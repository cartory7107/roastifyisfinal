import type { KeywordResearch, Niche } from "@rostify/shared";

import { lookupKeywords } from "../lib/seodata.js";

/** The library's default; seodata.dev does not cover every market. */
const DEFAULT_COUNTRY = "us";

export function keywordResearchCountry(): string {
  return (process.env.SEO_KEYWORD_COUNTRY ?? DEFAULT_COUNTRY).toLowerCase();
}

/**
 * Turn the niche's keywords into demand data (volume, CPC, competition, related
 * terms) via seodata.dev. Never throws: an unavailable or rate-limited API
 * yields an empty list plus the reason, and the audit continues without it.
 */
export async function researchKeywords(niche: Niche): Promise<KeywordResearch> {
  const country = keywordResearchCountry();
  const keywords = [...new Set(niche.keywords.map((keyword) => keyword.trim()))]
    .filter((keyword) => keyword.length > 0)
    .slice(0, 5);

  if (keywords.length === 0) {
    return { country, keywords: [], error: "unavailable" };
  }

  try {
    const { metrics, failures } = await lookupKeywords(keywords, { country });

    const error =
      metrics.length > 0
        ? null
        : failures.includes("rate_limited")
          ? "rate_limited"
          : "unavailable";

    return { country, keywords: metrics, error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[keywords] research failed, continuing without demand data: ${message}`);
    return { country, keywords: [], error: "unavailable" };
  }
}
