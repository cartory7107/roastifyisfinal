import type {
  CategoryAnalysis,
  CrawlData,
  Finding,
  Niche,
  Severity,
} from "@rostify/shared";

import { sortBySeverity } from "../lib/findings.js";
import {
  h1Points,
  hierarchyPoints,
  internalLinkPoints,
  metaPoints,
  onPageScore,
  ON_PAGE_MAX,
  titlePoints,
  urlPoints,
  type OnPageFacts,
} from "../lib/scoring.js";

const SUB_CHECK_COUNT = 6;

/**
 * Severity by point loss (spec §8.2): lost ≥15 → critical/high,
 * lost 5–14 → medium, lost <5 → low. The 15–19 band is "high";
 * ≥20 (a total sub-check failure) is "critical".
 */
function severityForLoss(loss: number): Severity {
  if (loss >= 20) return "critical";
  if (loss >= 15) return "high";
  if (loss >= 5) return "medium";
  return "low";
}

/**
 * Primary keyword: niche.keywords[0] (spec §8.2), falling back to the
 * category string, then to a generic term if the niche is unavailable.
 */
export function primaryKeywordOf(niche: Niche | null): string {
  const keyword = niche?.keywords[0]?.trim();
  if (keyword && keyword.length > 0) return keyword;

  const category = niche?.category?.trim();
  if (category && category.length > 0) return category;

  return "services";
}

function buildSummary(
  score: number,
  passedChecks: number,
  findings: Finding[],
): string {
  const head = `On-page score ${score}/100 with ${passedChecks}/${SUB_CHECK_COUNT} checks passing.`;

  if (findings.length === 0) {
    return `${head} Titles, headings, and URL structure are in good shape.`;
  }

  const priorities = findings
    .slice(0, 3)
    .map((finding) => finding.issue.toLowerCase())
    .join(", ");

  return `${head} Highest-impact fixes: ${priorities}.`;
}

/**
 * On-Page analyst (spec §8.2) — pure code, target crawl only.
 * If the crawl data looks incomplete (no HTML extracted), every check
 * fails: score 0 with `evidence.reason` (spec §8.2 failure mode).
 */
export function analyzeOnPage(
  data: CrawlData,
  niche: Niche | null,
): CategoryAnalysis {
  const primaryKeyword = primaryKeywordOf(niche);

  const incomplete =
    data.title.trim().length === 0 &&
    data.h1.length === 0 &&
    data.wordCount === 0;

  if (incomplete) {
    const reason = "crawl data incomplete: no HTML extracted from the page";
    const finding: Finding = {
      severity: "critical",
      category: "crawl-incomplete",
      issue: "On-page data could not be extracted",
      detail:
        "The crawl returned no title, no H1, and no body text, so every on-page check failed.",
      recommendation:
        "Re-run the audit; if it persists, verify that the page renders its content as HTML (not client-side only).",
      evidence: { reason },
    };
    return {
      score: 0,
      findings: [finding],
      summary: `On-page score 0/${ON_PAGE_MAX.title + ON_PAGE_MAX.meta + ON_PAGE_MAX.h1 + ON_PAGE_MAX.hierarchy + ON_PAGE_MAX.internalLinks + ON_PAGE_MAX.url} — ${reason}.`,
      metrics: { reason, primaryKeyword },
    };
  }

  const facts: OnPageFacts = {
    title: data.title,
    metaDescription: data.metaDescription,
    h1: data.h1,
    h2: data.h2,
    h3: data.h3,
    internalLinkCount: data.internalLinks.length,
    url: data.finalUrl,
    primaryKeyword,
  };

  const points = {
    title: titlePoints(facts.title, primaryKeyword),
    meta: metaPoints(facts.metaDescription, primaryKeyword),
    h1: h1Points(facts.h1, primaryKeyword),
    hierarchy: hierarchyPoints(facts.h2, facts.h3),
    internalLinks: internalLinkPoints(facts.internalLinkCount),
    url: urlPoints(facts.url),
  };

  const score = onPageScore(facts);
  const findings: Finding[] = [];

  const addFinding = (
    subCheck: keyof typeof ON_PAGE_MAX,
    issue: string,
    detail: string,
    recommendation: string,
    evidence: Record<string, unknown>,
  ): void => {
    const loss = ON_PAGE_MAX[subCheck] - points[subCheck];
    if (loss <= 0) return;
    findings.push({
      severity: severityForLoss(loss),
      category: `onpage-${subCheck}`,
      issue,
      detail,
      recommendation,
      evidence: { ...evidence, pointsLost: loss },
    });
  };

  const titleLength = facts.title.trim().length;
  if (titleLength === 0) {
    addFinding(
      "title",
      "Title tag is missing",
      "The page has no <title>, so search engines have no headline for the result listing.",
      `Write a 50–60 character title that includes the primary keyword "${primaryKeyword}".`,
      { title: facts.title, length: titleLength, primaryKeyword },
    );
  } else {
    addFinding(
      "title",
      "Title tag misses the target",
      `The title is ${titleLength} characters${titlePoints(facts.title, primaryKeyword) < 18 ? " or lacks the primary keyword" : ""}; the sweet spot is 50–60 characters with the keyword included.`,
      `Rewrite the title to 50–60 characters containing "${primaryKeyword}".`,
      { title: facts.title, length: titleLength, primaryKeyword },
    );
  }

  const metaLength = facts.metaDescription.trim().length;
  if (metaLength === 0) {
    addFinding(
      "meta",
      "Meta description is missing",
      "No meta description was found, so search engines will auto-generate the snippet.",
      `Add a 150–160 character meta description containing "${primaryKeyword}".`,
      { length: metaLength, primaryKeyword },
    );
  } else {
    addFinding(
      "meta",
      "Meta description misses the target",
      `The meta description is ${metaLength} characters${metaPoints(facts.metaDescription, primaryKeyword) < 10 ? " or lacks the primary keyword" : ""}; aim for 150–160 characters with the keyword.`,
      `Tune the meta description to 150–160 characters containing "${primaryKeyword}".`,
      { length: metaLength, primaryKeyword },
    );
  }

  if (facts.h1.length === 0) {
    addFinding(
      "h1",
      "H1 heading is missing",
      "The page has no H1, which leaves the main topic undefined for users and crawlers.",
      `Add exactly one H1 that includes "${primaryKeyword}".`,
      { h1Count: 0, primaryKeyword },
    );
  } else if (facts.h1.length > 1) {
    addFinding(
      "h1",
      "Multiple H1 headings found",
      `The page has ${facts.h1.length} H1 headings; search engines expect a single, focused H1.`,
      "Keep one H1 and demote the extras to H2.",
      { h1Count: facts.h1.length, h1: facts.h1.slice(0, 5) },
    );
  } else {
    addFinding(
      "h1",
      "H1 is missing the primary keyword",
      `The single H1 does not contain "${primaryKeyword}".`,
      `Rewrite the H1 so it includes "${primaryKeyword}".`,
      { h1: facts.h1[0], primaryKeyword },
    );
  }

  addFinding(
    "hierarchy",
    facts.h2.length === 0
      ? "No H2 subheadings"
      : "Heading hierarchy skips levels",
    facts.h2.length === 0
      ? "The page has no H2 subheadings, so the content structure is flat."
      : `Only ${facts.h2.length} H2 found; a structured page usually has at least 2 without skipped levels.`,
    "Organize content into H2 sections (with H3 children where needed).",
    { h2Count: facts.h2.length, h3Count: facts.h3.length },
  );

  addFinding(
    "internalLinks",
    facts.internalLinkCount === 0
      ? "No internal links"
      : "Too few internal links",
    `The page links to ${facts.internalLinkCount} internal URL(s); at least 3 spreads crawl equity and aids navigation.`,
    "Add contextual links to 3+ relevant pages on the same site.",
    { internalLinkCount: facts.internalLinkCount },
  );

  let urlDepth = 0;
  try {
    urlDepth = new URL(facts.url).pathname.split("/").filter(Boolean).length;
  } catch {
    // urlPoints already scores unparseable URLs 0; depth stays 0 in metrics.
  }
  addFinding(
    "url",
    "URL structure is not SEO-friendly",
    `The URL has depth ${urlDepth} and uses underscores or a dynamic extension (e.g. .php/.html).`,
    "Keep URLs ≤3 levels deep, hyphen-separated, and extension-free.",
    { url: facts.url, depth: urlDepth },
  );

  const sorted = sortBySeverity(findings);
  const passedChecks = Object.keys(ON_PAGE_MAX).filter((key) => {
    const subCheck = key as keyof typeof ON_PAGE_MAX;
    return ON_PAGE_MAX[subCheck] - points[subCheck] === 0;
  }).length;

  return {
    score,
    findings: sorted,
    summary: buildSummary(score, passedChecks, sorted),
    metrics: {
      primaryKeyword,
      titleLength,
      metaLength,
      h1Count: facts.h1.length,
      h2Count: facts.h2.length,
      h3Count: facts.h3.length,
      internalLinkCount: facts.internalLinkCount,
      urlDepth,
      subscores: points,
    },
  };
}
