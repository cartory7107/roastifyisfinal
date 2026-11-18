import type { ZodType } from "zod";

import { env } from "./env.js";
import { sleep, withRetry } from "./retry.js";

/**
 * All supported providers speak the OpenAI chat-completions dialect, so one
 * request builder serves them:
 *
 * - Gemini — free tier (`gemini-4-hydrogen`): frontier multimodal, 1M context.
 * - Ollama Cloud — pay per token, larger multimodal models (`glm-5.3-flash`).
 * - Groq — free tier with an 8K tokens/minute budget (`qwen/qwen3.8-27b`).
 *
 * `LLM_PROVIDER=auto` (the default) prefers the free Gemini tier, then Ollama
 * Cloud, then Groq, so one provider's outage or rate limit does not fail the
 * whole audit.
 */
export type LlmProvider = "gemini" | "ollama" | "groq";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";
const DEFAULT_OLLAMA_BASE_URL = "https://ollama.com/v1";
const DEFAULT_OLLAMA_MODEL = "glm-5.3-flash";

/** Groq bills every image as a flat 2048 input tokens (vision docs). */
const IMAGE_TOKENS = 2048;
/** Hard API limit: a single request may carry at most three images. */
const MAX_IMAGES = 3;
const CHARS_PER_TOKEN = 4;
/** Room for the JSON answer, so the pre-flight estimate is not optimistic. */
const OUTPUT_TOKEN_RESERVE = 900;
const REQUEST_TIMEOUT_MS = 120_000;
const RATE_WINDOW_MS = 60_000;
/** Used when the provider answers 429 without a usable `retry-after` header. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;

type ProviderConfig = {
  id: LlmProvider;
  /** Human label used in logs and error messages. */
  label: string;
  endpoint: string;
  apiKey: string;
  model: string;
  /** Groq wants `max_completion_tokens`; the others take `max_tokens`. */
  maxTokensField: "max_tokens" | "max_completion_tokens";
  /** Gemini 3/4 cannot disable thinking, so ask for the cheapest level. */
  reasoningEffort: "none" | "low";
  /** Groq's free tier needs client-side pacing; the others bill per token. */
  paceTokens: boolean;
};

export type LlmErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "rate_limited"
  | "invalid_json"
  | "schema_mismatch";

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  /** HTTP status when the failure came from the provider API. */
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

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function requestedProvider(): "auto" | LlmProvider {
  const raw = envValue("LLM_PROVIDER")?.toLowerCase();
  return raw === "gemini" || raw === "ollama" || raw === "groq" ? raw : "auto";
}

function ollamaEndpoint(): string {
  const base = envValue("OLLAMA_BASE_URL") ?? DEFAULT_OLLAMA_BASE_URL;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

function geminiEndpoint(): string {
  const base = envValue("GEMINI_BASE_URL") ?? DEFAULT_GEMINI_BASE_URL;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

/** Resolve one provider's settings, or `null` when it has no API key. */
function providerConfig(id: LlmProvider): ProviderConfig | null {
  if (id === "gemini") {
    const apiKey = envValue("GEMINI_API_KEY");
    if (apiKey === undefined) return null;
    return {
      id,
      label: "Gemini",
      endpoint: geminiEndpoint(),
      apiKey,
      model: envValue("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
      maxTokensField: "max_tokens",
      reasoningEffort: "low",
      paceTokens: false,
    };
  }

  if (id === "ollama") {
    const apiKey = envValue("OLLAMA_API_KEY");
    if (apiKey === undefined) return null;
    return {
      id,
      label: "Ollama",
      endpoint: ollamaEndpoint(),
      apiKey,
      model: envValue("OLLAMA_MODEL") ?? DEFAULT_OLLAMA_MODEL,
      maxTokensField: "max_tokens",
      reasoningEffort: "none",
      paceTokens: false,
    };
  }

  const apiKey = envValue("GROQ_API_KEY");
  if (apiKey === undefined) return null;
  return {
    id,
    label: "Groq",
    endpoint: GROQ_ENDPOINT,
    apiKey,
    model: envValue("GROQ_MODEL") ?? DEFAULT_GROQ_MODEL,
    maxTokensField: "max_completion_tokens",
    reasoningEffort: "none",
    paceTokens: true,
  };
}

/**
 * Providers to try, in order. `auto` runs the free tiers first (Gemini, then
 * Groq's fallback) and keeps the paid Ollama Cloud last, so an account without
 * credits never slows an audit down.
 */
export function configuredProviders(): LlmProvider[] {
  const requested = requestedProvider();
  if (requested !== "auto") {
    return providerConfig(requested) === null ? [] : [requested];
  }
  return (["gemini", "ollama", "groq"] as const).filter(
    (id) => providerConfig(id) !== null,
  );
}

/** The provider `generateJson` will try first, even if no key is set yet. */
function primaryProvider(): LlmProvider {
  const configured = configuredProviders()[0];
  if (configured !== undefined) return configured;
  const requested = requestedProvider();
  return requested === "auto" ? "gemini" : requested;
}

export function isLlmConfigured(): boolean {
  return configuredProviders().length > 0;
}

export function llmModelName(): string {
  const primary = primaryProvider();
  const config = providerConfig(primary);
  if (config !== null) return config.model;
  if (primary === "gemini") return DEFAULT_GEMINI_MODEL;
  if (primary === "ollama") return DEFAULT_OLLAMA_MODEL;
  return DEFAULT_GROQ_MODEL;
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
 * Rolling one-minute token window, used for Groq only. Its free tier allows 8K
 * tokens per minute, and one screenshot review already costs >7K, so unpaced
 * calls would 429 each other. Requests wait here instead of burning retries.
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

type ChatCompletionResponse = {
  choices?: {
    message?: { content?: string | null };
  }[];
  usage?: { total_tokens?: number };
};

function apiKeyEnvName(id: LlmProvider): string {
  if (id === "gemini") return "GEMINI_API_KEY";
  if (id === "ollama") return "OLLAMA_API_KEY";
  return "GROQ_API_KEY";
}

async function requestJson(
  provider: LlmProvider,
  prompt: string,
  images: LlmImage[],
): Promise<string> {
  const config = providerConfig(provider);
  if (config === null) {
    throw new LlmError(
      "missing_api_key",
      `${apiKeyEnvName(provider)} is not set`,
    );
  }

  const reservation = config.paceTokens
    ? await reserveTokens(
        estimateTokens(prompt, Math.min(images.length, MAX_IMAGES)),
      )
    : null;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [{ role: "user", content: buildContent(prompt, images) }],
    response_format: { type: "json_object" },
    // Instruct mode: JSON extraction does not need chain-of-thought, and
    // thinking tokens eat Groq's minute budget and paid output tokens.
    reasoning_effort: config.reasoningEffort,
    temperature: 0.2,
    [config.maxTokensField]: 4_096,
  };

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError(
      "request_failed",
      `${config.label} request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      null,
      err,
    );
  }

  if (response.status === 429) {
    const waitMs = retryAfterMs(response);
    await response.body?.cancel().catch(() => undefined);
    console.warn(
      `[llm] ${config.label} rate limited — waiting ${Math.round(waitMs / 1000)}s`,
    );
    await sleep(waitMs);
    throw new LlmError(
      "rate_limited",
      `${config.label} rate limit reached`,
      429,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new LlmError(
      "request_failed",
      `${config.label} responded with HTTP ${response.status}${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`,
      response.status,
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch (err) {
    throw new LlmError(
      "invalid_json",
      `${config.label} returned a non-JSON body`,
      response.status,
      err,
    );
  }

  // Providers report the real cost, which is usually far below the image
  // estimate. Booking the actual number keeps the next call from waiting.
  if (reservation !== null) {
    const actual = payload.usage?.total_tokens;
    if (typeof actual === "number" && actual > 0) {
      reservation.tokens = actual;
    }
  }

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new LlmError(
      "invalid_json",
      `${config.label} returned an empty response`,
    );
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

function missingKeyError(): LlmError {
  switch (requestedProvider()) {
    case "gemini":
      return new LlmError("missing_api_key", "GEMINI_API_KEY is not set");
    case "ollama":
      return new LlmError("missing_api_key", "OLLAMA_API_KEY is not set");
    case "groq":
      return new LlmError("missing_api_key", "GROQ_API_KEY is not set");
    default:
      return new LlmError(
        "missing_api_key",
        "No LLM provider configured: set GEMINI_API_KEY, OLLAMA_API_KEY or GROQ_API_KEY",
      );
  }
}

async function generateOnce<T>(
  provider: LlmProvider,
  prompt: string,
  schema: ZodType<T>,
  images: LlmImage[],
): Promise<T> {
  const label = providerConfig(provider)?.label ?? provider;
  const text = stripCodeFence(await requestJson(provider, prompt, images));

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new LlmError(
      "invalid_json",
      `${label} returned non-JSON output: ${text.slice(0, 200)}`,
      null,
      err,
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(
      "schema_mismatch",
      `${label} output failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * Ask the LLM for JSON and return it validated by `schema`.
 *
 * Each configured provider is retried 3x with exponential backoff (2x when
 * another provider is available as a fallback), except for auth/validation
 * failures. When every attempt on one provider fails, the next provider is
 * tried instead of failing the whole audit.
 */
export async function generateJson<T>(
  prompt: string,
  schema: ZodType<T>,
  images: LlmImage[] = [],
): Promise<T> {
  const providers = configuredProviders();
  if (providers.length === 0) throw missingKeyError();

  let lastError: unknown = null;

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]!;
    const label = providerConfig(provider)?.label ?? provider;
    const hasFallback = index < providers.length - 1;

    try {
      return await withRetry(
        () => generateOnce(provider, prompt, schema, images),
        {
          attempts: hasFallback ? 2 : 3,
          shouldRetry: isRetryable,
          onRetry: (err, failedAttempt) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(
              `[llm] ${label} attempt ${failedAttempt} failed: ${message}`,
            );
          },
        },
      );
    } catch (err) {
      lastError = err;
      if (!hasFallback) break;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[llm] ${label} failed — falling back to ${providers[index + 1]}: ${message}`,
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
