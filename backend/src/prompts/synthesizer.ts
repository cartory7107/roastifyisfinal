import type { CategoryAnalysis, CategoryKey, Grade, Niche } from "@rostify/shared";

import { sortBySeverity } from "../lib/findings.js";

/** How many findings per category the synthesizer prompt shows (spec §8.10). */
const TOP_FINDINGS = 3;

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  technical: "Technical",
  onpage: "On-Page",
  content: "Content",
  performance: "Performance",
  offpage: "Off-Page",
  ai_readiness: "AI Readiness",
};

export type SynthesizerPromptInput = {
  url: string;
  niche: Niche;
  overall: number;
  grade: Grade;
  categoryScores: Record<CategoryKey, CategoryAnalysis>;
};

function categoryBlock(key: CategoryKey, analysis: CategoryAnalysis): string {
  const findings = sortBySeverity(analysis.findings)
    .slice(0, TOP_FINDINGS)
    .map((finding) => `    - [${finding.severity}] ${finding.issue}: ${finding.detail}`);

  return [
    `  ${CATEGORY_LABELS[key]}: ${analysis.score}`,
    findings.length === 0 ? "    - no findings" : findings.join("\n"),
  ].join("\n");
}

/**
 * Synthesizer prompt (spec §8.10): the executive summary and top priorities.
 * Scores are already computed in code and are only described here.
 */
export function buildSynthesizerPrompt(input: SynthesizerPromptInput): string {
  const categories = (Object.keys(CATEGORY_LABELS) as CategoryKey[])
    .map((key) => categoryBlock(key, input.categoryScores[key]))
    .join("\n");

  return `You are a report writer for an SEO agency pitching to a client. Given the audit results, write a concise executive summary.

INPUT:
URL: ${input.url}
Niche: ${input.niche.category} in ${input.niche.location}
Scores:
  Overall: ${input.overall}/100 (${input.grade})
  Technical: ${input.categoryScores.technical.score}
  On-Page: ${input.categoryScores.onpage.score}
  Content: ${input.categoryScores.content.score}
  Performance: ${input.categoryScores.performance.score}
  Off-Page: ${input.categoryScores.offpage.score}
  AI Readiness: ${input.categoryScores.ai_readiness.score}

Top findings per category:
${categories}

OUTPUT strict JSON:
{
  "executive_summary": "3-4 sentences, agency-pitch tone, highlight the biggest issues and the biggest opportunities",
  "top_priorities": [
    { "title": "short priority", "category": "technical"|"onpage"|"content"|"performance"|"offpage"|"ai_readiness", "why": "1 sentence" }
  ]
}

Exactly 3 top_priorities, ordered by impact.`;
}
