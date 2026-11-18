/**
 * All audit scoring math lives here (spec §9).
 * Analysts collect facts; this module turns facts into deterministic numbers.
 */

import type { Grade, MeasurementStatus } from "@rostify/shared";

import { z } from "zod";

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

export type ContentGap = {
  topic: string;
  seenOn: string[];
  why: string;
};

export type ContentFacts = {
  wordCount: number;
  keywordInFirst100: boolean;
  keywordInFirst200: boolean;
  /** Highest Jaccard similarity of 5-word shingles vs any competitor. */
  maxJaccard: number;
  /** Year parsed from the copyright line; 0 when none was found. */
  copyrightYear: number;
  contentGaps: ContentGap[];
};

export type ContentSubScores = {
  /** 0-25. */
  wordCount: number;
  /** 0-10. */
  keywordPlacement: number;
  /** 0-10. */
  duplicateAvoidance: number;
  /** 0-10. */
  freshness: number;
  /** 0-15. */
  completeness: number;
};

/** Code-side content sub-scores, max 75 of the 100 points (spec §9.3). */
export function contentSubScores(f: ContentFacts): ContentSubScores {
  const wordCount = 25 * Math.min(1, f.wordCount / 1000);

  const keywordPlacement = f.keywordInFirst100 ? 10 : f.keywordInFirst200 ? 5 : 0;

  const duplicateAvoidance =
    f.maxJaccard < 0.2 ? 10 :
    f.maxJaccard < 0.4 ? 6 :
    f.maxJaccard < 0.6 ? 2 : 0;

  const currentYear = new Date().getFullYear();
  const freshness =
    f.copyrightYear >= currentYear - 1 ? 10 :
    f.copyrightYear >= currentYear - 2 ? 6 :
    f.copyrightYear >= currentYear - 3 ? 3 : 0;

  const gapsCount = f.contentGaps.length;
  const completeness =
    gapsCount === 0 ? 15 :
    gapsCount === 1 ? 12 :
    gapsCount === 2 ? 9 :
    gapsCount === 3 ? 6 :
    gapsCount === 4 ? 3 : 0;

  return { wordCount, keywordPlacement, duplicateAvoidance, freshness, completeness };
}

/** Content score, max 100 (spec §9.3): code sub-scores + LLM E-E-A-T (0-30). */
export function contentScore(f: ContentFacts, llmEeatScore: number): number {
  const sub = contentSubScores(f);

  return clamp(
    sub.wordCount +
      sub.keywordPlacement +
      sub.duplicateAvoidance +
      sub.freshness +
      sub.completeness +
      clamp(llmEeatScore, 0, 30),
    0,
    100,
  );
}

/** Off-Page score, max 100 from OpenPageRank 0-10 (spec §9.5). */
export function offPageScore(openPageRank: number): number {
  return clamp(openPageRank * 10, 0, 100);
}

/** Category weights for the overall score (spec §9.7). Sum = 1.00. */
export const OVERALL_WEIGHTS = {
  technical: 0.20,
  onpage: 0.20,
  content: 0.20,
  performance: 0.15,
  offpage: 0.10,
  ai_readiness: 0.15,
} as const;

export type OverallWeights = typeof OVERALL_WEIGHTS;
export type OverallCategoryKey = keyof OverallWeights;

/** What one category feeds into the overall: a number, or a possibly unmeasured analysis. */
export type OverallCategoryInput =
  | number
  | {
      score: number;
      measurement?: MeasurementStatus;
    };

export type OverallScoreInput = Record<OverallCategoryKey, OverallCategoryInput>;

function categoryValue(entry: OverallCategoryInput): {
  score: number;
  measured: boolean;
} {
  if (typeof entry === "number") return { score: entry, measured: true };
  return { score: entry.score, measured: entry.measurement !== "unavailable" };
}

/**
 * Weighted mean of the six category scores (spec §9.7), renormalized when a
 * category could not be measured. A failed external check (OpenPageRank,
 * Lighthouse, vision model) must never drag the overall down: its weight is
 * redistributed across the categories that did produce real data. A
 * placeholder score therefore never reads as a definitive penalty.
 */
export function overallScore(scores: OverallScoreInput): number {
  let sum = 0;
  let weight = 0;
  for (const [key, weightValue] of Object.entries(OVERALL_WEIGHTS)) {
    const { score, measured } = categoryValue(
      scores[key as OverallCategoryKey],
    );
    if (!measured) continue;
    sum += score * weightValue;
    weight += weightValue;
  }
  if (weight === 0) return 0;
  return Math.round(clamp(sum / weight, 0, 100));
}

/** Letter grade from the overall score (spec §9.8). */
export function grade(score: number): Grade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
