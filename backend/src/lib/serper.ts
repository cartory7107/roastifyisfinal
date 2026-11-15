import { z } from "zod";

import { withRetry } from "./retry.js";

const SERPER_ENDPOINT = "https://google.serper.dev/search";
const DEFAULT_NUM = 10;

/** Serper returns Google's geo/locale defaults; the product targets BD (spec §8.8). */
const DEFAULT_GEO = "bd";
const DEFAULT_LOCALE = "en";

const SerpResultSchema = z.object({
  link: z.string(),
  title: z.string().optional(),
  snippet: z.string().optional(),
});

const SerperResponseSchema = z.object({
  organic: z.array(SerpResultSchema).optional(),
  peopleAlsoAsk: z
    .array(
      z.object({
        question: z.string().optional(),
        snippet: z.string().optional(),
        link: z.string().optional(),
      }),
    )
    .optional(),
  relatedSearches: z
    .array(
      z.object({
        query: z.string().optional(),
      }),
    )
    .optional(),
});

export type SerperOrganicResult = {
  link: string;
  title: string;
  snippet: string;
};

export type SerperSearchResponse = {
  organic: SerperOrganicResult[];
};

/** One raw Serper payload, kept unparsed so callers can pick what they need. */
export type SerperRawResult = z.infer<typeof SerperResponseSchema>;

/**
 * Everything the content analyst reads off one SERP request (spec §8.3).
 * Fetching PAA and related searches costs nothing extra — they arrive in the
 * same response — so they are captured here rather than in a second call.
 */
export type SerpSnapshot = {
  query: string;
  organic: SerperOrganicResult[];
  peopleAlsoAsk: Array<{ question: string; snippet: string }>;
  relatedSearches: string[];
};

export type SerperErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "invalid_response";

export class SerperError extends Error {
  readonly code: SerperErrorCode;
  /** HTTP status when the failure came from the Serper API. */
  readonly status: number | null;

  constructor(
    code: SerperErrorCode,
    message: string,
    status: number | null = null,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SerperError";
    this.code = code;
    this.status = status;
  }
}

export function isSerperConfigured(): boolean {
  return Boolean(process.env.SERPER_API_KEY);
}

/** Auth and quota failures will not fix themselves on retry. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof SerperError)) return true;
  return err.status === null || (err.status !== 401 && err.status !== 403);
}

async function postSearch(
  query: string,
  num: number,
): Promise<SerperRawResult> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    throw new SerperError("missing_api_key", "SERPER_API_KEY is not set");
  }

  let response: Response;
  try {
    response = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num,
        gl: DEFAULT_GEO,
        hl: DEFAULT_LOCALE,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new SerperError(
      "request_failed",
      `Serper request failed: ${err instanceof Error ? err.message : String(err)}`,
      null,
      err,
    );
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SerperError(
      "request_failed",
      `Serper responded with HTTP ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new SerperError(
      "invalid_response",
      "Serper returned a non-JSON body",
      response.status,
      err,
    );
  }

  const parsed = SerperResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SerperError(
      "invalid_response",
      `Serper response failed validation: ${parsed.error.message}`,
      response.status,
    );
  }

  return parsed.data;
}

/** Shared retry envelope: 3 attempts, exponential backoff, 401/403 immediate. */
async function searchWithRetry(
  query: string,
  num: number,
): Promise<SerperRawResult> {
  return withRetry(() => postSearch(query, num), {
    shouldRetry: isRetryable,
    onRetry: (err, failedAttempt) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[serper] attempt ${failedAttempt} failed: ${message}`);
    },
  });
}

/**
 * Google SERP lookup via Serper.dev. Retries 3x with exponential backoff,
 * except for 401/403 which surface immediately as `SerperError`.
 */
export async function serperSearch(
  query: string,
  options: { num?: number } = {},
): Promise<SerperSearchResponse> {
  const num = options.num ?? DEFAULT_NUM;
  const data = await searchWithRetry(query, num);

  return {
    organic: (data.organic ?? []).map((result) => ({
      link: result.link,
      title: result.title ?? "",
      snippet: result.snippet ?? "",
    })),
  };
}

/**
 * Same request cost as `serperSearch` — the intent signals arrive in the same
 * payload — but returns the extra fields the content analyst uses to check
 * whether the page answers what the SERP is actually asking (spec §8.3).
 */
export async function fetchSerpSnapshot(
  query: string,
  options: { num?: number } = {},
): Promise<SerpSnapshot> {
  const num = options.num ?? DEFAULT_NUM;
  const data = await searchWithRetry(query, num);

  return {
    query,
    organic: (data.organic ?? []).map((result) => ({
      link: result.link,
      title: result.title ?? "",
      snippet: result.snippet ?? "",
    })),
    peopleAlsoAsk: (data.peopleAlsoAsk ?? [])
      .map((item) => ({
        question: (item.question ?? "").trim(),
        snippet: (item.snippet ?? "").trim(),
      }))
      .filter((item) => item.question.length > 0),
    relatedSearches: (data.relatedSearches ?? [])
      .map((item) => (item.query ?? "").trim())
      .filter((query) => query.length > 0),
  };
}
