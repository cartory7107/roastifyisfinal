/**
 * All audit scoring math lives here (spec §9).
 * Analysts collect facts; this module turns facts into deterministic numbers.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export type TechnicalChecks = {
  robotsExists: boolean;
  robotsValid: boolean;
  sitemapExists: boolean;
  sitemapValid: boolean;
  canonicalIsSelf: boolean;
  noindex: boolean;
  redirectCount: number;
  isHttps: boolean;
  /** `brokenLinks / checkedLinks`, 0 when no links were checked. */
  brokenRatio: number;
  metaRefresh: boolean;
};

/** Technical score, max 100 (spec §9.1). */
export function technicalScore(data: TechnicalChecks): number {
  let score = 0;
  if (data.robotsExists && data.robotsValid) score += 15;
  if (data.sitemapExists && data.sitemapValid) score += 15;
  if (data.canonicalIsSelf) score += 10;
  if (!data.noindex) score += 10;
  if (data.redirectCount <= 1) score += 10;
  if (data.isHttps) score += 10;
  if (data.brokenRatio < 0.1) score += 15;
  if (!data.metaRefresh) score += 15;
  return clamp(score, 0, 100);
}

export type AiReadinessFacts = {
  hasJsonLd: boolean;
  schemaValid: boolean;
  hasLlmsTxt: boolean;
  blockedBots: string[];
  richResultTypes: string[];
};

/** AI readiness score, max 100 (spec §9.6). */
export function aiReadinessScore(facts: AiReadinessFacts): number {
  let score = 0;
  if (facts.hasJsonLd && facts.schemaValid) score += 30;
  if (facts.hasLlmsTxt) score += 25;
  if (facts.blockedBots.length === 0) score += 25;
  if (facts.richResultTypes.length > 0) score += 20;
  return clamp(score, 0, 100);
}

export type OnPageFacts = {
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  internalLinkCount: number;
  url: string;
  primaryKeyword: string;
};

/** Sub-score maxima, used by the analyst to derive point loss → severity. */
export const ON_PAGE_MAX = {
  title: 25,
  meta: 15,
  h1: 20,
  hierarchy: 15,
  internalLinks: 15,
  url: 10,
} as const;

function containsKeyword(text: string, keyword: string): boolean {
  const needle = keyword.trim().toLowerCase();
  if (needle.length === 0) return false;
  return text.toLowerCase().includes(needle);
}

export function titlePoints(title: string, kw: string): number {
  const len = title.trim().length;
  if (!len) return 0;
  const hasKw = containsKeyword(title, kw);
  if (len >= 50 && len <= 60 && hasKw) return 25;
  if ((len >= 50 && len <= 60) || (hasKw && len >= 40 && len <= 70)) return 18;
  if (len >= 30 && len <= 80) return 10;
  return 0;
}

export function metaPoints(meta: string, kw: string): number {
  const len = meta.trim().length;
  if (!len) return 0;
  const hasKw = containsKeyword(meta, kw);
  if (len >= 150 && len <= 160 && hasKw) return 15;
  if ((len >= 150 && len <= 160) || (hasKw && len >= 120 && len <= 180)) return 10;
  if (len >= 80 && len <= 200) return 5;
  return 0;
}

export function h1Points(h1: string[], kw: string): number {
  if (h1.length === 0) return 0;
  if (h1.length > 1) return 0;
  return containsKeyword(h1[0] ?? "", kw) ? 20 : 12;
}

/**
 * `_h3`: an `h3` without any `h2` is a skipped level, but that case already
 * scores 0 via the `h2.length === 0` branch — full heading order is not in
 * CrawlData (spec §9.2 simplification).
 */
export function hierarchyPoints(h2: string[], _h3: string[]): number {
  if (h2.length === 0) return 0;
  if (h2.length >= 2) return 15;
  return 8;
}

export function internalLinkPoints(count: number): number {
  if (count >= 3) return 15;
  if (count >= 1) return 8;
  return 0;
}

export function urlPoints(url: string): number {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 0;
  }
  const depth = pathname.split("/").filter(Boolean).length;
  const usesHyphens = !pathname.includes("_");
  const cleanExt = !/\.(php|html?|aspx?)$/.test(pathname);
  if (depth <= 3 && usesHyphens && cleanExt) return 10;
  if (depth <= 5 && usesHyphens) return 5;
  return 0;
}

/** LCP sub-score, 0-100 (spec §9.4). `lcp` in seconds. */
export function lcpScore(lcpSeconds: number): number {
  if (lcpSeconds <= 2.5) return 100;
  if (lcpSeconds <= 4.0) return 100 - ((lcpSeconds - 2.5) / 1.5) * 50;
  return Math.max(0, 50 - (lcpSeconds - 4.0) * 20);
}

/** INP sub-score, 0-100 (spec §9.4). `inp` in milliseconds. */
export function inpScore(inpMs: number): number {
  if (inpMs <= 200) return 100;
  if (inpMs <= 500) return 100 - ((inpMs - 200) / 300) * 50;
  return Math.max(0, 50 - ((inpMs - 500) / 100) * 20);
}

/** CLS sub-score, 0-100 (spec §9.4). */
export function clsScore(cls: number): number {
  if (cls <= 0.1) return 100;
  if (cls <= 0.25) return 100 - ((cls - 0.1) / 0.15) * 50;
  return Math.max(0, 50 - (cls - 0.25) * 100);
}

/** Performance score, max 100 (spec §9.4): 0.40 LCP + 0.30 INP + 0.30 CLS. */
export function performanceScore(
  lcpSeconds: number,
  inpMs: number,
  cls: number,
): number {
  return clamp(
    0.4 * lcpScore(lcpSeconds) +
      0.3 * inpScore(inpMs) +
      0.3 * clsScore(cls),
    0,
    100,
  );
}

/** On-Page score, max 100 (spec §9.2). */
export function onPageScore(f: OnPageFacts): number {
  return clamp(
    titlePoints(f.title, f.primaryKeyword) +
      metaPoints(f.metaDescription, f.primaryKeyword) +
      h1Points(f.h1, f.primaryKeyword) +
      hierarchyPoints(f.h2, f.h3) +
      internalLinkPoints(f.internalLinkCount) +
      urlPoints(f.url),
    0,
    100,
  );
}
