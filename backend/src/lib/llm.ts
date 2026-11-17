import type { ZodType } from "zod";

import { env } from "./env.js";
import { sleep, withRetry } from "./retry.js";

/**
 * Groq's OpenAI-compatible chat endpoint. `qwen/qwen3.8-27b` is multimodal and
 * supports JSON object mode, so it replaces Gemini for both the text analysts
 * and the screenshot review.
 */
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.8-27b";

/** Groq bills every image as a flat 2048 input tokens (vision docs). */
const IMAGE_TOKENS = 2048;
/** Hard API limit: a single request may carry at most three images. */
const MAX_IMAGES = 3;
const CHARS_PER_TOKEN = 4;
/** Room for the JSON answer, so the pre-flight estimate is not optimistic. */
const OUTPUT_TOKEN_RESERVE = 900;
const REQUEST_TIMEOUT_MS = 120_000;
const RATE_WINDOW_MS = 60_000;
/** Used when Groq answers 429 without a usable `retry-after` header. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;

export type LlmErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "rate_limited"
  | "invalid_json"
  | "schema_mismatch";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** HTTP status when the failure came from the Groq API. */
  readonly status: number | null;

  constructor(
    code: LlmErrorCode,
    message: string,
    status: number | null = null,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "LlmError";
    this.code = code;
    this.status = status;
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function llmModelName(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

/** One image part for a multimodal request (spec §8.9). */
export type LlmImage = {
  base64: string;
  mimeType: string;
};

export function estimateTokens(prompt: string, imageCount: number): number {
  return (
    Math.ceil(prompt.length / CHARS_PER_TOKEN) +
    imageCount * IMAGE_TOKENS +
    OUTPUT_TOKEN_RESERVE
  );
}

/**
 * Rolling one-minute token window. The Groq free tier allows 8K tokens per
 * minute, and one screenshot review already costs >7K, so unpaced calls would
 * 429 each other. Requests wait here instead of burning retries.
 */
const recentUsage: { at: number; tokens: number }[] = [];

function pruneUsage(now: number): void {
  while (recentUsage.length > 0 && now - recentUsage[0]!.at >= RATE_WINDOW_MS) {
    recentUsage.shift();
  }
}

async function reserveTokens(
  tokens: number,
): Promise<{ at: number; tokens: number }> {
  const budget = env.LLM_TOKENS_PER_MINUTE;
  const reservation = { at: Date.now(), tokens };
  // A single call that is over budget cannot be fixed by waiting.
  if (tokens >= budget) return reservation;

  for (;;) {
    const now = Date.now();
    pruneUsage(now);
    const used = recentUsage.reduce((sum, entry) => sum + entry.tokens, 0);
    if (used + tokens <= budget) {
      reservation.at = now;
      recentUsage.push(reservation);
      return reservation;
    }

    const oldest = recentUsage[0];
    if (oldest === undefined) return reservation;
    const waitMs = Math.max(1_000, RATE_WINDOW_MS - (now - oldest.at) + 100);
    console.warn(
      `[llm] token budget ${used}/${budget} in use — waiting ${Math.round(waitMs / 1000)}s`,
    );
    await sleep(waitMs);
  }
}

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildContent(
  prompt: string,
  images: LlmImage[],
): string | ChatPart[] {
  if (images.length === 0) return prompt;

  return [
    { type: "text", text: prompt },
    ...images.slice(0, MAX_IMAGES).map((image) => ({
      type: "image_url" as const,
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    })),
  ];
}

function retryAfterMs(response: Response): number {
  const header = response.headers.get("retry-after");
  if (header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 120_000);
    }
  }
  return DEFAULT_RATE_LIMIT_WAIT_MS;
}

type GroqResponse = {
  choices?: {
    message?: { content?: string | null };
  }[];
  usage?: { total_tokens?: number };
};

async function requestJson(
  prompt: string,
  images: LlmImage[],
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    throw new LlmError("missing_api_key", "GROQ_API_KEY is not set");
  }

  const reservation = await reserveTokens(
    estimateTokens(prompt, Math.min(images.length, MAX_IMAGES)),
  );

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmModelName(),
        messages: [{ role: "user", content: buildContent(prompt, images) }],
        response_format: { type: "json_object" },
        // Instruct mode: JSON extraction does not need chain-of-thought, and
        // thinking tokens would eat the free tier's 8K-per-minute budget.
        reasoning_effort: "none",
        temperature: 0.2,
        max_completion_tokens: 4_096,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError(
      "request_failed",
      `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
      null,
      err,
    );
  }

  if (response.status === 429) {
    const waitMs = retryAfterMs(response);
    await response.body?.cancel().catch(() => undefined);
    console.warn(`[llm] rate limited — waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
    throw new LlmError("rate_limited", "Groq rate limit reached", 429);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmError(
      "request_failed",
      `Groq responded with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  let payload: GroqResponse;
  try {
    payload = (await response.json()) as GroqResponse;
  } catch (err) {
    throw new LlmError(
      "invalid_json",
      "Groq returned a non-JSON body",
      response.status,
      err,
    );
  }

  // Groq reports the real cost, which is usually far below the image estimate.
  // Booking the actual number keeps the next call from waiting needlessly.
  const actual = payload.usage?.total_tokens;
  if (typeof actual === "number" && actual > 0) {
    reservation.tokens = actual;
  }

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new LlmError("invalid_json", "Groq returned an empty response");
  }
  return text;
}

/** Auth and validation failures will not fix themselves on retry. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof LlmError)) return true;
  if (err.code === "missing_api_key") return false;
  if (err.status === null) return true;
  return err.status === 429 || err.status >= 500;
}

/** Models sometimes wrap JSON in a ```json fence even in JSON mode. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
}

/**
 * Ask the LLM for JSON and return it validated by `schema`.
 * Retries 3x with exponential backoff except for auth/validation failures.
 */
export async function generateJson<T>(
  prompt: string,
  schema: ZodType<T>,
  images: LlmImage[] = [],
): Promise<T> {
  return withRetry(
    async () => {
      const text = stripCodeFence(await requestJson(prompt, images));

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new LlmError(
          "invalid_json",
          `Groq returned non-JSON output: ${text.slice(0, 200)}`,
          null,
          err,
        );
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new LlmError(
          "schema_mismatch",
          `Groq output failed validation: ${result.error.message}`,
        );
      }
      return result.data;
    },
    {
      shouldRetry: isRetryable,
      onRetry: (err, failedAttempt) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[llm] attempt ${failedAttempt} failed: ${message}`);
      },
    },
  );
}
