import type {
  CategoryAnalysis,
  CategoryKey,
  Competitor,
  CrawlData,
  FinalReport,
  Grade,
  Niche,
} from "@rostify/shared";
import { z } from "zod";

import { generateJson, GeminiError } from "../lib/gemini.js";
import { rankFindings, type RankedFinding } from "../lib/impact.js";
import { grade as letterGrade, overallScore } from "../lib/scoring.js";
import { buildSynthesizerPrompt } from "../prompts/synthesizer.js";

/** Spec §8.10: exactly three priorities, ordered by impact. */
const PRIORITY_COUNT = 3;

const PrioritySchema = z.object({
  title: z.string(),
  category: z.string(),
  why: z.string(),
});

const SummaryLlmSchema = z.object({
  executive_summary: z.string().optional(),
  top_priorities: z.array(PrioritySchema).optional(),
});

export type TopPriority = { title: string; category: string; why: string };

export type SynthesizerInput = {
  niche: Niche;
  target: CrawlData;
  /** Serper results, used for titles and domain authority (spec §8.6). */
  competitors: Competitor[];
  /** Competitors that actually loaded — the ones with screenshots. */
  competitorPages: CrawlData[];
  analyses: Record<CategoryKey, CategoryAnalysis>;
  /** ISO timestamp the audit finished at. */
  auditedAt: string;
  /** Wall-clock time of the whole audit, in milliseconds. */
  durationMs: number;
};

/** Numeric-only part of the overall score (spec §9.7/§9.8). */
export function overallFromAnalyses(analyses: Record<CategoryKey, CategoryAnalysis>): {
  overall: number;
  grade: Grade;
} {
  const overall = overallScore({
    technical: analyses.technical.score,
    onpage: analyses.onpage.score,
    content: analyses.content.score,
    performance: analyses.performance.score,
    offpage: analyses.offpage.score,
    ai_readiness: analyses.ai_readiness.score,
  });
  return { overall, grade: letterGrade(overall) };
}

/**
 * Backfills priorities from the impact ranking when the model returns fewer
 * than three, or fails outright. The model may phrase a priority; the order
 * and every fallback row come from the ranking computed in code (spec §8.10).
 */
function fillPriorities(
  given: TopPriority[],
  ranked: RankedFinding[],
): TopPriority[] {
  const filled = given.slice(0, PRIORITY_COUNT);

  for (const row of ranked) {
    if (filled.length >= PRIORITY_COUNT) break;
    const issue = row.finding.issue.toLowerCase();
    if (filled.some((priority) => priority.title.toLowerCase() === issue)) {
      continue;
    }
    filled.push({
      title: row.finding.issue,
      category: row.category,
      why: row.finding.recommendation,
    });
  }

  return filled;
}

/**
 * One LLM call for prose only (spec §8.10). Scores are never taken from the
 * model; on failure the documented generic fallback is used (spec §8.10).
 */
async function summarize(
  url: string,
  niche: Niche,
  analyses: Record<CategoryKey, CategoryAnalysis>,
  overall: number,
  grade: Grade,
  rankedFindings: RankedFinding[],
): Promise<{ executive_summary: string; top_priorities: TopPriority[] }> {
  const fallback = {
    executive_summary: `This website scored ${overall}/100. See detailed findings below.`,
    top_priorities: fillPriorities([], rankedFindings),
  };

  try {
    const result = await generateJson(
      buildSynthesizerPrompt({
        url,
        niche,
        categoryScores: analyses,
        overall,
        grade,
        rankedFindings,
      }),
      SummaryLlmSchema,
    );

    const summary = result.executive_summary?.trim();
    if (!summary) return fallback;

    return {
      executive_summary: summary,
      top_priorities: fillPriorities(result.top_priorities ?? [], rankedFindings),
    };
  } catch (err) {
    const message = err instanceof GeminiError ? err.message : String(err);
    console.warn(`[synthesizer] LLM summary failed: ${message}`);
    return fallback;
  }
}

/** Competitors with a loaded page: title from the crawl, DA from Serper. */
function competitorRows(
  competitors: Competitor[],
  pages: CrawlData[],
): FinalReport["competitors"] {
  return pages.map((page) => {
    const match = competitors.find(
      (candidate) => candidate.url === page.url || candidate.url === page.finalUrl,
    );
    return {
      url: page.finalUrl,
      title: page.title.trim() || match?.title || page.finalUrl,
      da: match?.da ?? null,
    };
  });
}

/**
 * Phase 9 pipeline stage: compute the overall score and grade in code, ask
 * the LLM for the executive summary, and assemble the FinalReport (spec §7.3).
 */
export async function synthesizeReport(input: SynthesizerInput): Promise<FinalReport> {
  const { overall, grade } = overallFromAnalyses(input.analyses);
  const rankedFindings = rankFindings(input.analyses);

  const { executive_summary, top_priorities } = await summarize(
    input.target.finalUrl,
    input.niche,
    input.analyses,
    overall,
    grade,
    rankedFindings,
  );

  return {
    overall_score: overall,
    grade,
    category_scores: input.analyses,
    executive_summary,
    top_priorities,
    competitors: competitorRows(input.competitors, input.competitorPages),
    screenshots: {
      target: {
        desktop: input.target.screenshotDesktopUrl,
        mobile: input.target.screenshotMobileUrl,
      },
      competitors: input.competitorPages.map((page) => ({
        url: page.finalUrl,
        mobile: page.screenshotMobileUrl,
      })),
    },
    meta: {
      url: input.target.finalUrl,
      audited_at: input.auditedAt,
      duration_ms: input.durationMs,
    },
  };
}
