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
