import { z } from "zod";

import { withRetry } from "./retry.js";

const OPR_ENDPOINT = "https://openpagerank.com/api/v1.0/getPageRank";

/** The API accepts up to 100 domains per call (spec §8.5). */
const MAX_DOMAINS_PER_REQUEST = 100;

const OpenPageRankResponseSchema = z.object({
  response: z
    .array(
      z.object({
        status_code: z.number().optional(),
        domain: z.string(),
        page_rank_integer: z.number().optional(),
        page_rank_decimal: z.number().optional(),
        error: z.string().optional(),
      }),
    )
    .optional(),
});

export type PageRankEntry = {
  domain: string;
  /** 0-10, or null when the API could not resolve the domain. */
  pageRank: number | null;
};

export type OpenPageRankErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "invalid_response";

export class OpenPageRankError extends Error {
  readonly code: OpenPageRankErrorCode;
  /** HTTP status when the failure came from the OpenPageRank API. */
  readonly status: number | null;

  constructor(
    code: OpenPageRankErrorCode,
    message: string,
    status: number | null = null,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "OpenPageRankError";
    this.code = code;
    this.status = status;
  }
}

export function isOpenPageRankConfigured(): boolean {
  return Boolean(process.env.OPENPAGERANK_API_KEY);
}

/** Auth failures will not fix themselves on retry. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof OpenPageRankError)) return true;
  return err.status === null || (err.status !== 401 && err.status !== 403);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchChunk(domains: string[]): Promise<PageRankEntry[]> {
  const apiKey = process.env.OPENPAGERANK_API_KEY;
  if (!apiKey) {
    throw new OpenPageRankError(
      "missing_api_key",
      "OPENPAGERANK_API_KEY is not set",
    );
  }

  const query = domains
    .map((domain) => `domains[]=${encodeURIComponent(domain)}`)
    .join("&");

  let response: Response;
  try {
    response = await fetch(`${OPR_ENDPOINT}?${query}`, {
      method: "GET",
      headers: { "API-OPR": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new OpenPageRankError(
      "request_failed",
      `OpenPageRank request failed: ${err instanceof Error ? err.message : String(err)}`,
      null,
      err,
    );
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new OpenPageRankError(
      "request_failed",
      `OpenPageRank responded with HTTP ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new OpenPageRankError(
      "invalid_response",
      "OpenPageRank returned a non-JSON body",
      response.status,
      err,
    );
  }

  const parsed = OpenPageRankResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new OpenPageRankError(
      "invalid_response",
      `OpenPageRank response failed validation: ${parsed.error.message}`,
      response.status,
    );
  }

  return (parsed.data.response ?? []).map((entry) => ({
    domain: entry.domain,
    pageRank:
      typeof entry.page_rank_integer === "number"
        ? Math.max(0, Math.min(10, entry.page_rank_integer))
        : null,
  }));
}

/**
 * Domain authority lookup via OpenPageRank (spec §8.5), batched 100 domains
 * per request. Retries 3x with exponential backoff except for 401/403.
 */
export async function fetchPageRank(
  domains: string[],
): Promise<PageRankEntry[]> {
  const results: PageRankEntry[] = [];

  for (const batch of chunk(domains, MAX_DOMAINS_PER_REQUEST)) {
    const entries = await withRetry(() => fetchChunk(batch), {
      shouldRetry: isRetryable,
      onRetry: (err, failedAttempt) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[openpagerank] attempt ${failedAttempt} failed: ${message}`,
        );
      },
    });
    results.push(...entries);
  }

  return results;
}
