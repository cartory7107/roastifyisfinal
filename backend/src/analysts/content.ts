import type {
  CategoryAnalysis,
  CrawlData,
  Finding,
  Niche,
} from "@rostify/shared";
import { z } from "zod";

import { generateJson, GeminiError } from "../lib/gemini.js";
import { sortBySeverity } from "../lib/findings.js";
import {
  clamp,
  contentScore,
  contentSubScores,
  type ContentFacts,
  type ContentGap,
} from "../lib/scoring.js";
import { jaccardSimilarity, wordShingles } from "../lib/text-similarity.js";
import { buildContentPrompt } from "../prompts/content.js";
import { firstWords } from "../prompts/niche.js";

import { primaryKeywordOf } from "./on-page.js";

/** Spec §8.3: E-E-A-T is worth 30 points, gaps are capped at 5. */
const MAX_GAPS = 5;
const KEYWORD_HEAD_WORDS = 200;

const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

const ContentLlmSchema = z.object({
  eeat_score: z.number(),
  eeat_findings: z
    .array(
      z.object({
        severity: SeveritySchema,
        issue: z.string(),
        detail: z.string(),
        recommendation: z.string(),
      }),
    )
    .optional(),
  content_gaps: z
    .array(
      z.object({
        topic: z.string(),
        seenOn: z.array(z.string()).optional(),
        why: z.string(),
      }),
    )
    .optional(),
});

type ContentLlmResult = z.infer<typeof ContentLlmSchema>;

/** Highest copyright year in a `© 2024` / `Copyright 2024` style line, else 0. */
function parseCopyrightYear(text: string): number {
  const currentYear = new Date().getFullYear();
  const pattern = /(?:©|\(c\)|copyright)[^\d]{0,20}(\d{4})/gi;
  let best = 0;
  for (const match of text.matchAll(pattern)) {
    const year = Number(match[1]);
    if (year >= 1990 && year <= currentYear + 1 && year > best) {
      best = year;
    }
  }
  return best;
}

function maxJaccardAgainst(
  target: CrawlData,
  competitors: CrawlData[],
): number {
  if (competitors.length === 0) return 0;

  const targetShingles = wordShingles(target.bodyText);
  let max = 0;
  for (const competitor of competitors) {
    const similarity = jaccardSimilarity(
      targetShingles,
      wordShingles(competitor.bodyText),
    );
    if (similarity > max) max = similarity;
  }
  return max;
}

function codeFindings(facts: ContentFacts, competitorsCount: number): Finding[] {
  const findings: Finding[] = [];
  const currentYear = new Date().getFullYear();

  if (facts.wordCount < 300) {
    findings.push({
      severity: "high",
      category: "content-thin",
      issue: `Thin content (${facts.wordCount} words)`,
      detail:
        "Pages under ~300 words rarely rank for competitive queries because they cover too little of the topic.",
      recommendation:
        "Expand the page toward 1000+ words of genuinely useful copy: services, process, proof, and FAQs.",
      evidence: { word_count: facts.wordCount, target_words: 1000 },
    });
  }

  if (facts.maxJaccard >= 0.4) {
    findings.push({
      severity: facts.maxJaccard >= 0.6 ? "high" : "medium",
      category: "content-duplicate",
      issue: `Content overlaps competitors (${Math.round(facts.maxJaccard * 100)}% shingle similarity)`,
      detail:
        "Large stretches of the body copy mirror what competitors already publish, which gives search engines no reason to prefer this page.",
      recommendation:
        "Rewrite overlapping sections with first-hand experience, original data, and a distinct point of view.",
      evidence: {
        max_jaccard: Number(facts.maxJaccard.toFixed(3)),
        competitors_crawled: competitorsCount,
      },
    });
  }

  if (facts.copyrightYear === 0) {
    findings.push({
      severity: "low",
      category: "content-freshness",
      issue: "No copyright year detected",
      detail:
        "The footer has no `© {year}` line, so freshness signals are missing and the page may look unmaintained.",
      recommendation:
        `Add a footer copyright with the current year (${currentYear}) and keep it updated annually.`,
      evidence: { copyright_year: 0, current_year: currentYear },
    });
  } else if (facts.copyrightYear < currentYear - 1) {
    findings.push({
      severity: "medium",
      category: "content-freshness",
      issue: `Copyright year is stale (${facts.copyrightYear})`,
      detail:
        "The visible copyright predates the current year by more than one year, a common signal of neglected content.",
      recommendation:
        `Refresh the footer to ${currentYear} and review the page copy for outdated services and prices.`,
      evidence: { copyright_year: facts.copyrightYear, current_year: currentYear },
    });
  }

  if (facts.contentGaps.length > 0) {
    const topics = facts.contentGaps.map((gap) => gap.topic).join("; ");
    findings.push({
      severity: facts.contentGaps.length >= 3 ? "high" : "medium",
      category: "content-gaps",
      issue: `Missing ${facts.contentGaps.length} topic(s) competitors cover`,
      detail: `Competitors address topics the target page does not: ${topics}.`,
      recommendation:
        "Add dedicated sections (or pages) for these topics, covering them at least as thoroughly as the competitors do.",
      evidence: { gaps: facts.contentGaps },
    });
  }

  return findings;
}

function summaryFor(
  score: number,
  facts: ContentFacts,
  findings: Finding[],
): string {
  const head = `Content score ${score}/100 from ${facts.wordCount} words.`;
  if (findings.length === 0) {
    return `${head} Copy length, originality, freshness, and E-E-A-T signals are all healthy.`;
  }
  const priorities = findings
    .slice(0, 3)
    .map((finding) => finding.issue.toLowerCase())
    .join(", ");
  return `${head} Highest-impact fixes: ${priorities}.`;
}

/**
 * Content analyst (spec §8.3) — hybrid: code computes five sub-scores,
 * one LLM call supplies E-E-A-T (0-30) and the content gaps.
 * On LLM failure the E-E-A-T score is 0, gaps are empty, and a
 * "partially failed" finding is added (spec §8.3 failure mode).
 */
export async function analyzeContent(
  target: CrawlData,
  competitors: CrawlData[],
  niche: Niche | null,
): Promise<CategoryAnalysis> {
  const primaryKeyword = primaryKeywordOf(niche);
  const keyword = primaryKeyword.toLowerCase();
  const head200 = firstWords(target.bodyText, KEYWORD_HEAD_WORDS).toLowerCase();
  const head100 = firstWords(target.bodyText, 100).toLowerCase();

  let llm: ContentLlmResult | null = null;
  let llmError: string | null = null;
  try {
    llm = await generateJson(buildContentPrompt(target, competitors), ContentLlmSchema);
  } catch (err) {
    llmError = err instanceof GeminiError ? err.message : String(err);
    console.warn(`[content] LLM analysis failed: ${llmError}`);
  }

  const contentGaps: ContentGap[] = (llm?.content_gaps ?? [])
    .slice(0, MAX_GAPS)
    .map((gap) => ({
      topic: gap.topic,
      seenOn: gap.seenOn ?? [],
      why: gap.why,
    }));

  const facts: ContentFacts = {
    wordCount: target.wordCount,
    keywordInFirst100: head100.includes(keyword),
    keywordInFirst200: head200.includes(keyword),
    maxJaccard: maxJaccardAgainst(target, competitors),
    copyrightYear: parseCopyrightYear(target.bodyText),
    contentGaps,
  };

  const eeatScore = llm === null ? 0 : clamp(llm.eeat_score, 0, 30);
  const subScores = contentSubScores(facts);
  const score = Math.round(contentScore(facts, eeatScore));

  const findings: Finding[] = [];
  if (llm !== null) {
    for (const finding of llm.eeat_findings ?? []) {
      findings.push({
        severity: finding.severity,
        category: "content-eeat",
        issue: finding.issue,
        detail: finding.detail,
        recommendation: finding.recommendation,
      });
    }
  } else {
    findings.push({
      severity: "medium",
      category: "content-eeat-unavailable",
      issue: "Content analysis partially failed — E-E-A-T could not be evaluated",
      detail: `The E-E-A-T review did not run, so up to 30 content points are unearned. Cause: ${llmError}`,
      recommendation: "Re-run the audit; verify the Gemini API key and quota.",
      evidence: { reason: llmError },
    });
  }

  findings.push(...codeFindings(facts, competitors.length));

  const sorted = sortBySeverity(findings);

  return {
    score,
    findings: sorted,
    summary: summaryFor(score, facts, sorted),
    metrics: {
      primaryKeyword,
      wordCount: facts.wordCount,
      wordCountScore: subScores.wordCount,
      keywordPlacementScore: subScores.keywordPlacement,
      duplicateAvoidanceScore: subScores.duplicateAvoidance,
      freshnessScore: subScores.freshness,
      contentCompletenessScore: subScores.completeness,
      eeatScore,
      maxJaccard: Number(facts.maxJaccard.toFixed(3)),
      copyrightYear: facts.copyrightYear,
      gapsCount: contentGaps.length,
      contentGaps,
      competitorsAnalyzed: competitors.length,
      subscores: subScores,
    },
  };
}
