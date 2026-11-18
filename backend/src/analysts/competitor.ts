import type { Competitor, Niche } from "@rostify/shared";

import { serperSearch } from "../lib/serper.js";

/** Aggregators and social platforms are never useful competitors (spec §8.8). */
const BLOCK_LIST = [
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "yelp.com",
  "tripadvisor.com",
  "wikipedia.org",
  "medium.com",
  "reddit.com",
  "quora.com",
  "yellowpages.com",
  "bbb.org",
  "crunchbase.com",
  "glassdoor.com",
] as const;

const MAX_COMPETITORS = 2;
const RESULTS_PER_KEYWORD = 10;

/**
 * Locations that carry no geo signal: appending them to a search query would
 * pull results from the wrong market (spec rule: never pigeonhole a global
 * SaaS/store/content site into a local market). Only an explicitly detected
 * place qualifies.
 */
const NON_LOCATIONS = new Set(["not detectable", "unknown", "global", "worldwide"]);

function usableLocation(location: string | undefined): string | null {
  const trimmed = (location ?? "").trim();
  if (trimmed.length === 0) return null;
  if (NON_LOCATIONS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** `www.example.com` → `example.com`; returns null for unparseable links. */
function normalizeDomain(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlocked(domain: string): boolean {
  return BLOCK_LIST.some((blocked) => domain.endsWith(blocked));
}

/**
 * Find up to 2 direct competitors from Google (spec §8.8).
 * Never throws: a Serper failure (401, quota, network) stops the step and
 * returns whatever was collected — possibly `[]`, which later analysts
 * treat as "target-only analysis".
 */
export async function huntCompetitors(
  niche: Niche,
  targetUrl: string,
): Promise<Competitor[]> {
  const targetDomain = normalizeDomain(targetUrl);
  const candidates = new Map<string, Competitor>();
  const location = usableLocation(niche.location);

  for (const keyword of niche.keywords) {
    const query = location === null ? keyword : `${keyword} ${location}`;

    let organic: { link: string; title: string; snippet: string }[];
    try {
      const results = await serperSearch(query, { num: RESULTS_PER_KEYWORD });
      organic = results.organic;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[competitor] stopping search after "${query}": ${message}`);
      break;
    }

    for (const result of organic) {
      const domain = normalizeDomain(result.link);
      if (domain === null) continue;
      if (targetDomain !== null && domain === targetDomain) continue;
      if (isBlocked(domain)) continue;
      if (candidates.has(domain)) continue;

      candidates.set(domain, {
        url: result.link,
        title: result.title,
        snippet: result.snippet,
        da: null,
      });
    }

    if (candidates.size >= MAX_COMPETITORS) break;
  }

  return Array.from(candidates.values()).slice(0, MAX_COMPETITORS);
}
