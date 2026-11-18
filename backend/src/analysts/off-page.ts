import type { CategoryAnalysis, Competitor, Finding } from "@rostify/shared";

import { sortBySeverity } from "../lib/findings.js";
import {
  fetchPageRank,
  isOpenPageRankConfigured,
  OpenPageRankError,
} from "../lib/openpagerank.js";
import { offPageScore } from "../lib/scoring.js";

/** Neutral score used when authority data cannot be fetched (spec §8.5).
 * The placeholder is EXCLUDED from the overall score (see scoring.ts) and the
 * finding says so, so a broken API never reads as a definitive penalty. */
const NEUTRAL_SCORE = 40;

/** A competitor average this far above the target is a competitive gap. */
const COMPETITOR_GAP = 2;

/**
 * What this analyst can and cannot see. No free source exposes a backlink
 * profile, so authority here is one domain-rank number. The report says that
 * out loud instead of carrying a claim ("check your anchor text") that nothing
 * in the pipeline could have measured.
 */
const LINK_DATA_COVERAGE = {
  measured: ["domain_authority"],
  notMeasured: [
    "referring_domains",
    "anchor_text_distribution",
    "dofollow_ratio",
    "link_velocity",
  ],
} as const;

const COVERAGE_SENTENCE =
  "Authority is measured by domain rank only: referring domains, anchor text, dofollow ratio and link velocity are not available in this build.";

type DomainRank = { url: string; da: number };

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function limitedAnalysis(reason: string): CategoryAnalysis {
  const finding: Finding = {
    severity: "medium",
    category: "offpage-unavailable",
    issue: "Off-Page check temporarily unavailable — API runner limit",
    detail:
      "Temporarily Unavailable due to API Runner Limit: domain authority for the target and its competitors could not be retrieved, so no off-page verdict is issued. " +
      "The placeholder score below is excluded from the overall score. Cause: " +
      reason,
    recommendation:
      "Re-run the audit once OPENPAGERANK_API_KEY is valid and the OpenPageRank API is reachable; the off-page score will then be measured, not estimated.",
    evidence: { reason, measurement: "unavailable" },
  };

  return {
    score: NEUTRAL_SCORE,
    measurement: "unavailable",
    measurement_reason: reason,
    findings: [finding],
    summary: `Off-Page temporarily unavailable — domain authority could not be measured (API runner limit: ${reason}). Placeholder score ${NEUTRAL_SCORE} is excluded from the overall.`,
    metrics: {
      openPageRank: null,
      competitorsAvg: null,
      domains: [],
      reason,
      linkDataCoverage: LINK_DATA_COVERAGE,
    },
  };
}

function summaryFor(score: number, target: number, competitorsAvg: number): string {
  const head = `Off-Page score ${score}/100 from domain authority ${target}/10.`;
  const gap =
    competitorsAvg > 0 ? ` Competitors average ${competitorsAvg.toFixed(1)}/10.` : "";
  return `${head}${gap} ${COVERAGE_SENTENCE}`;
}

/**
 * Off-Page analyst (spec §8.5) — OpenPageRank for the target plus each
 * competitor domain. Any API failure (missing key, quota, network) yields
 * the neutral 40 score and a single "limited" finding.
 */
export async function analyzeOffPage(
  targetUrl: string,
  competitors: Competitor[],
): Promise<CategoryAnalysis> {
  if (!isOpenPageRankConfigured()) {
    return limitedAnalysis("OPENPAGERANK_API_KEY is not set");
  }

  const targetDomain = hostnameOf(targetUrl);
  if (targetDomain === null) {
    return limitedAnalysis(`could not parse the target URL: ${targetUrl}`);
  }

  const competitorDomains: string[] = [];
  for (const competitor of competitors) {
    const domain = hostnameOf(competitor.url);
    if (domain === null || domain === targetDomain) continue;
    if (!competitorDomains.includes(domain)) competitorDomains.push(domain);
  }

  let ranks: Map<string, number>;
  try {
    const entries = await fetchPageRank([targetDomain, ...competitorDomains]);
    ranks = new Map(
      entries.map((entry) => [entry.domain, entry.pageRank ?? 0]),
    );
  } catch (err) {
    const reason =
      err instanceof OpenPageRankError ? err.message : String(err);
    console.warn(`[offpage] authority lookup failed: ${reason}`);
    return limitedAnalysis(reason);
  }

  // An unranked domain is reported as 0 rather than "unknown": it simply
  // has no measurable backlink authority yet.
  const targetRank = ranks.get(targetDomain) ?? 0;

  const domains: DomainRank[] = [{ url: targetDomain, da: targetRank }];
  for (const domain of competitorDomains) {
    domains.push({ url: domain, da: ranks.get(domain) ?? 0 });
  }

  const competitorsAvg = mean(
    domains.filter((entry) => entry.url !== targetDomain).map((entry) => entry.da),
  );

  const score = Math.round(offPageScore(targetRank));
  const findings: Finding[] = [];

  if (targetRank < 2) {
    findings.push({
      severity: "high",
      category: "offpage-authority",
      issue: "Domain has very low authority",
      detail: `Domain authority is ${targetRank}/10, which sits below the threshold where most competitive queries are winnable on content alone.`,
      recommendation:
        "Earn backlinks from relevant local directories, industry publications, and partner sites.",
      evidence: { open_page_rank: targetRank, threshold: 2 },
    });
  } else if (targetRank < 4) {
    findings.push({
      severity: "medium",
      category: "offpage-authority",
      issue: "Domain authority is below average",
      detail: `Domain authority is ${targetRank}/10; competitors in most niches sit higher, which caps rankings on competitive terms.`,
      recommendation:
        "Run a steady link-building cadence and publish link-worthy resources (guides, data, case studies).",
      evidence: { open_page_rank: targetRank, threshold: 4 },
    });
  }

  if (competitorDomains.length > 0 && competitorsAvg >= targetRank + COMPETITOR_GAP) {
    findings.push({
      severity: "high",
      category: "offpage-gap",
      issue: "Competitors have much stronger authority",
      detail: `The audited competitors average ${competitorsAvg.toFixed(1)}/10 domain authority against ${targetRank}/10 for this site.`,
      recommendation: `Build backlinks; competitors avg DA ${competitorsAvg.toFixed(1)} vs yours ${targetRank}.`,
      evidence: {
        target_da: targetRank,
        competitors_avg: Number(competitorsAvg.toFixed(2)),
        gap: COMPETITOR_GAP,
      },
    });
  }

  const sorted = sortBySeverity(findings);

  return {
    score,
    findings: sorted,
    summary: summaryFor(score, targetRank, competitorsAvg),
    metrics: {
      openPageRank: targetRank,
      competitorsAvg: Number(competitorsAvg.toFixed(2)),
      domains,
      linkDataCoverage: LINK_DATA_COVERAGE,
    },
  };
}
