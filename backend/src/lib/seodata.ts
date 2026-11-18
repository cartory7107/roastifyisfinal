import { z } from "zod";

import pLimit from "p-limit";

import type { KeywordMetric, KeywordSuggestion } from "@rostify/shared";

import { withRetry } from "./retry.js";

/**
 * seodata.dev keyword lookup: monthly search volume, CPC, Google Ads
 * competition and related terms for one keyword at a time. Anonymous use needs
 * no key (20 lookups/day per IP); a free key raises that to 50/day, 500/month.
 */
const SEODATA_ENDPOINT = "https://api.seodata.dev/v1/keyword";
const REQUEST_TIMEOUT_MS = 15_000;

/** The API has no bulk endpoint; the niche's keywords are looked up in parallel. */
const LOOKUP_CONCURRENCY = 3;

/** Country defaults to the US: seodata.dev does not cover every market. */
const DEFAULT_COUNTRY = "us";

/**
 * Every lookup counts against the account's daily/monthly allowance, and
 * indexed keywords barely change month to month, so results are reused for a
 * day instead of re-spending quota on the same term.
 */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

const SimilarSchema = z
  .object({
    keyword: z.string().optional(),
    volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    overlap: z.number().nullable().optional(),
  })
  .passthrough();

const KeywordResponseSchema = z
  .object({
    keyword: z.string().optional(),
    volume: z.number().nullable().optional(),
    cpc: z.number().nullable().optional(),
    competition: z.number().nullable().optional(),
    country: z.string().optional(),
    similar: z.array(SimilarSchema).optional(),
  })
  .passthrough();

export type SeoDataErrorCode =
  | "request_failed"
  | "invalid_response"
  | "rate_limited";

export class SeoDataError extends Error {
  readonly code: SeoDataErrorCode;
  /** HTTP status when the failure came from the seodata.dev API. */
  readonly status: number | null;

  constructor(
    code: SeoDataErrorCode,
    message: string,
    status: number | null = null,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "SeoDataError";
    this.code = code;
    this.status = status;
  }
}

/** Anonymous lookups work without a key; a key only raises the daily limits. */
export function isSeoDataConfigured(): boolean {
  return Boolean(process.env.SEODATA_API_KEY);
}

/** Quota (429) and auth failures will not fix themselves on retry. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof SeoDataError)) return true;
  if (err.code === "rate_limited") return false;
  return err.status === null || (err.status !== 401 && err.status !== 403);
}

function toNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toSuggestions(
  rows: z.infer<typeof SimilarSchema>[] | undefined,
): KeywordSuggestion[] {
  return (rows ?? [])
    .map((row) => ({
      keyword: (row.keyword ?? "").trim(),
      volume: toNumber(row.volume),
      cpc: toNumber(row.cpc),
      overlap: toNumber(row.overlap),
    }))
    .filter((row) => row.keyword.length > 0)
    .sort((a, b) => (b.overlap ?? 0) - (a.overlap ?? 0));
}

const cache = new Map<string, { expiresAt: number; metric: KeywordMetric }>();

function cacheKey(keyword: string, country: string): string {
  return `${country.toLowerCase()}:${keyword.trim().toLowerCase()}`;
}

function readCache(key: string): KeywordMetric | null {
  const entry = cache.get(key);
  if (entry === undefined) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.metric;
}

function writeCache(key: string, metric: KeywordMetric): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done !== true) cache.delete(oldest.value);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, metric });
}

/** Test hook: drop memoised lookups between cases. */
export function clearKeywordCache(): void {
  cache.clear();
}

async function requestKeyword(
  keyword: string,
  country: string,
): Promise<KeywordMetric> {
  const apiKey = process.env.SEODATA_API_KEY;

  const url = new URL(SEODATA_ENDPOINT);
  url.searchParams.set("q", keyword);
  url.searchParams.set("country", country);

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new SeoDataError(
      "request_failed",
      `seodata.dev request failed: ${err instanceof Error ? err.message : String(err)}`,
      null,
      err,
    );
  }

  if (response.status === 404) {
    // A keyword outside the provider's index is "no data", not an error:
    // retrying cannot make it appear and it would fail the whole batch.
    await response.body?.cancel().catch(() => undefined);
    return {
      keyword,
      volume: null,
      cpc: null,
      competition: null,
      similar: [],
    };
  }

  if (response.status === 429) {
    await response.body?.cancel().catch(() => undefined);
    throw new SeoDataError(
      "rate_limited",
      "seodata.dev lookup limit reached — set SEODATA_API_KEY for a higher quota",
      429,
    );
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new SeoDataError(
      "request_failed",
      `seodata.dev responded with HTTP ${response.status}`,
      response.status,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    throw new SeoDataError(
      "invalid_response",
      "seodata.dev returned a non-JSON body",
      response.status,
      err,
    );
  }

  const parsed = KeywordResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new SeoDataError(
      "invalid_response",
      `seodata.dev response failed validation: ${parsed.error.message}`,
      response.status,
    );
  }

  return {
    keyword: parsed.data.keyword ?? keyword,
    volume: toNumber(parsed.data.volume),
    cpc: toNumber(parsed.data.cpc),
    competition: toNumber(parsed.data.competition),
    similar: toSuggestions(parsed.data.similar),
  };
}

/**
 * Volume/CPC/competition/similar terms for one keyword. Retries 3x with
 * exponential backoff, except for auth and quota failures which surface
 * immediately as `SeoDataError`. Repeated lookups inside the TTL are free.
 */
export async function lookupKeyword(
  keyword: string,
  options: { country?: string } = {},
): Promise<KeywordMetric> {
  const country = (options.country ?? DEFAULT_COUNTRY).toLowerCase();
  const key = cacheKey(keyword, country);

  const cached = readCache(key);
  if (cached !== null) return cached;

  const metric = await withRetry(() => requestKeyword(keyword, country), {
    shouldRetry: isRetryable,
    onRetry: (err, failedAttempt) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[seodata] attempt ${failedAttempt} failed: ${message}`);
    },
  });

  writeCache(key, metric);
  return metric;
}

export type KeywordLookupResult = {
  metrics: KeywordMetric[];
  /** Codes of the lookups that failed, so callers can explain the gap. */
  failures: SeoDataErrorCode[];
};

/**
 * Look up several keywords concurrently. A keyword the API cannot answer is
 * dropped rather than failing the batch, so one bad term costs its own row only.
 */
export async function lookupKeywords(
  keywords: string[],
  options: { country?: string } = {},
): Promise<KeywordLookupResult> {
  const country = (options.country ?? DEFAULT_COUNTRY).toLowerCase();
  const limit = pLimit(LOOKUP_CONCURRENCY);

  const settled = await Promise.allSettled(
    keywords.map((keyword) => limit(() => lookupKeyword(keyword, { country }))),
  );

  const metrics: KeywordMetric[] = [];
  const failures: SeoDataErrorCode[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      metrics.push(result.value);
      return;
    }
    if (result.reason instanceof SeoDataError) failures.push(result.reason.code);
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn(`[seodata] lookup failed for "${keywords[index] ?? "unknown"}": ${reason}`);
  });

  return { metrics, failures };
}
