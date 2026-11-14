import pLimit from "p-limit";

export type BrokenLink = {
  url: string;
  /** HTTP status of the last response, or `null` when the request failed entirely. */
  status: number | null;
  error: string | null;
};

const CONCURRENCY = 5;
const DEFAULT_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

type Probe = { status: number } | { error: string };

async function request(
  url: string,
  method: "HEAD" | "GET",
): Promise<Probe> {
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // Release the socket without downloading large bodies.
    await response.body?.cancel().catch(() => undefined);

    return { status: response.status };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : `${method} request failed`,
    };
  }
}

/**
 * Probe a single URL. `HEAD` is tried first; servers that reject it (or return
 * a status that HEAD commonly misreports) are re-checked with `GET`.
 */
async function probe(url: string): Promise<BrokenLink | null> {
  const head = await request(url, "HEAD");

  if ("status" in head) {
    if (head.status < 400) return null;
    if (![400, 403, 405, 501].includes(head.status)) {
      return { url, status: head.status, error: null };
    }
  }

  const get = await request(url, "GET");

  if ("status" in get) {
    if (get.status < 400) return null;
    return { url, status: get.status, error: null };
  }

  const reason = "error" in head ? head.error : get.error;
  return { url, status: null, error: reason };
}

/**
 * Check up to `limit` URLs for broken responses, 5 requests in flight.
 * Returns only the URLs that failed (4xx/5xx or network error).
 */
export async function checkBrokenLinks(
  urls: string[],
  limit: number = DEFAULT_LIMIT,
): Promise<BrokenLink[]> {
  const candidates = Array.from(
    new Set(
      urls.filter((url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }),
    ),
  ).slice(0, Math.max(0, limit));

  if (candidates.length === 0) return [];

  const limitConcurrency = pLimit(CONCURRENCY);
  const results = await Promise.all(
    candidates.map((url) => limitConcurrency(() => probe(url))),
  );

  return results.filter((result): result is BrokenLink => result !== null);
}
