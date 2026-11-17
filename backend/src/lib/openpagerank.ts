import { z } from "zod";

import { withRetry } from "./retry.js";

/**
 * OpenPageRank (Keywords Everywhere) bulk domain endpoint. The legacy domcop
 * `getPageRank` endpoint and its `API-OPR` header were retired, so this uses a
 * bearer token and a JSON POST body.
 */
const OPR_ENDPOINT = "https://openpagerank.keywordseverywhere.com/v1/domains/bulk";

/** The API accepts up to 100 domains per call (spec §8.5). */
const MAX_DOMAINS_PER_REQUEST = 100;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Tolerant by design: the current shape is `results[].open_page_rank`, but the
 * older `page_rank_decimal` / `page_rank_integer` keys are still accepted so a
 * quiet field rename cannot silently zero every domain.
 */
const DomainEntrySchema = z
  .object({
    domain: z.string().optional(),
    open_page_rank: z.union([z.number(), z.string()]).optional(),
    page_rank_decimal: z.union([z.number(), z.string()]).optional(),
    page_rank_integer: z.union([z.number(), z.string()]).optional(),
    error: z.string().optional(),
  })
  .passthrough();

const OpenPageRankResponseSchema = z.union([
  z.object({
    results: z.array(DomainEntrySchema).optional(),
    response: z.array(DomainEntrySchema).optional(),
  }),
  z.array(DomainEntrySchema),
]);

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

/** Auth and bad-request failures will not fix themselves on retry. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof OpenPageRankError)) return true;
  if (err.status === null) return true;
  return err.status !== 401 && err.status !== 403 && err.status !== 400;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toScore(value: number | string | undefined): number | null {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(10, numeric));
}

async function fetchChunk(domains: string[]): Promise<PageRankEntry[]> {
  const apiKey = process.env.OPENPAGERANK_API_KEY;
  if (!apiKey) {
    throw new OpenPageRankError(
      "missing_api_key",
      "OPENPAGERANK_API_KEY is not set",
    );
  }

  let response: Response;
  try {
    response = await fetch(OPR_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domains, include_history: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    const detail = await response.text().catch(() => "");
    throw new OpenPageRankError(
      "request_failed",
      `OpenPageRank responded with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
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

  const entries = Array.isArray(parsed.data)
    ? parsed.data
    : (parsed.data.results ?? parsed.data.response ?? []);

  return entries.map((entry, index) => ({
    domain: entry.domain ?? domains[index] ?? "",
    pageRank:
      toScore(entry.open_page_rank) ??
      toScore(entry.page_rank_decimal) ??
      toScore(entry.page_rank_integer),
  }));
}

/**
 * Domain authority lookup via OpenPageRank (spec §8.5), batched 100 domains
 * per request. Retries 3x with exponential backoff except for 400/401/403.
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
