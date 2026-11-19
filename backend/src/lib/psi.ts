import { env } from "./env.js";
import {
  extractMetrics,
  type LighthouseMetrics,
} from "./lighthouse-metrics.js";

/**
 * PageSpeed Insights runs real Chrome in Google's cloud and returns the
 * Lighthouse result plus a screenshot. It needs no API key (a free key only
 * raises the quota) and no payment method, which makes it the serverless
 * replacement for a local Chrome + Lighthouse run.
 */
export class PsiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PsiError";
  }
}

export type PsiSnapshot = {
  metrics: LighthouseMetrics;
  /** `data:image/jpeg;base64,...` viewport screenshot, when PSI returned one. */
  screenshotDataUri: string | null;
  finalUrl: string | null;
};

type PsiAudit = {
  numericValue?: number;
  details?: {
    data?: string;
    screenshot?: { data?: string };
  };
};

type PsiResponse = {
  error?: { code?: number; message?: string; status?: string };
  lighthouseResult?: {
    finalUrl?: string;
    runtimeError?: { code?: string; message?: string };
    audits?: Record<string, PsiAudit | undefined>;
  };
};

const CACHE_TTL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 90_000;

const cache = new Map<string, { at: number; value: Promise<PsiSnapshot> }>();

export type PsiStrategy = "mobile" | "desktop";

function screenshotOf(audits: Record<string, PsiAudit | undefined>): string | null {
  const finalShot = audits["final-screenshot"]?.details?.data;
  if (typeof finalShot === "string" && finalShot.startsWith("data:")) {
    return finalShot;
  }

  const fullShot = audits["full-page-screenshot"]?.details?.screenshot?.data;
  if (typeof fullShot === "string" && fullShot.startsWith("data:")) {
    return fullShot;
  }

  return null;
}

async function fetchPsi(url: string, strategy: PsiStrategy): Promise<PsiSnapshot> {
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.append("category", "performance");
  if (env.PSI_API_KEY !== undefined) {
    endpoint.searchParams.set("key", env.PSI_API_KEY);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new PsiError(`PageSpeed Insights request failed: ${detail}`);
  }

  const body = (await response.json().catch(() => null)) as PsiResponse | null;

  if (!response.ok || body === null) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    throw new PsiError(`PageSpeed Insights error: ${detail}`);
  }

  if (body.error !== undefined) {
    throw new PsiError(
      `PageSpeed Insights error: ${body.error.message ?? body.error.status ?? "unknown"}`,
    );
  }

  const lhr = body.lighthouseResult;
  if (lhr === undefined || lhr.audits === undefined) {
    throw new PsiError("PageSpeed Insights returned no Lighthouse result");
  }

  const runtimeCode = lhr.runtimeError?.code;
  if (runtimeCode !== undefined && runtimeCode !== "" && runtimeCode !== "NO_ERROR") {
    // Any runtime error means the run is not trustworthy. The message is more
    // useful than the code, so prefer it when present.
    throw new PsiError(
      `PageSpeed Insights could not load the page: ${lhr.runtimeError?.message ?? runtimeCode}`,
    );
  }

  return {
    metrics: extractMetrics({ audits: lhr.audits }),
    screenshotDataUri: screenshotOf(lhr.audits),
    finalUrl: lhr.finalUrl ?? null,
  };
}

/**
 * Memoized PSI call: the crawler needs the screenshot and the performance
 * analyst needs the metrics for the same URL, so both share one request.
 */
export function psiSnapshot(
  url: string,
  strategy: PsiStrategy,
): Promise<PsiSnapshot> {
  const key = `${strategy}|${url}`;
  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value;
  }

  const value = fetchPsi(url, strategy);
  cache.set(key, { at: Date.now(), value });
  void value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Split a `data:image/...;base64,...` URI into bytes and a mime type. */
export function decodeDataUri(
  dataUri: string,
): { mimeType: string; bytes: Buffer } | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/s.exec(dataUri);
  if (match === null) return null;

  const mimeType = match[1] ?? "image/png";
  const payload = match[2] ?? "";
  return { mimeType, bytes: Buffer.from(payload, "base64") };
}
