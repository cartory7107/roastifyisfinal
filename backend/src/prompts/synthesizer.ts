import type { CategoryAnalysis, CategoryKey, Grade, Niche } from "@rostify/shared";

import { sortBySeverity } from "../lib/findings.js";
import { ANTI_SLOP_RULES } from "./anti-slop.js";

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
 *
 * Ported from the `page-audit` Phase 3 output contract: the summary has to
 * state cost and consequence, priorities are ordered by business impact rather
 * than points available, and the model is forbidden from citing any metric the
 * audit does not measure.
 */
export function buildSynthesizerPrompt(input: SynthesizerPromptInput): string {
  const categories = (Object.keys(CATEGORY_LABELS) as CategoryKey[])
    .map((key) => categoryBlock(key, input.categoryScores[key]))
    .join("\n");

  return `You are a senior SEO consultant writing the opening assessment of an audit report. The reader owns the site, not another SEO. They will give this one page of attention and it has to earn the rest of the document.

Everything below was measured. You are not re-scoring anything. Do not reference a category or a metric that is not in this input.

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

WHAT THE SUMMARY HAS TO DO
1. Name the site's condition in the first sentence, in language a non-specialist understands. Give the number, then say what it means for this business, not what it means for a search engine.
2. Name the two or three findings costing the most and say what each one costs. A finding with no consequence attached is filler.
3. If the categories disagree badly, one strong and one weak, say so. That pattern is diagnostic and usually the most useful observation in the report.
4. Close with what changes first. Concrete, not directional.

WHAT IT MUST NOT DO
- No "in today's competitive landscape". No "presents both challenges and opportunities".
- Do not list the category scores back at the reader. The table is already on the page.
- Do not cite anything this audit does not measure: keyword volumes, traffic estimates, backlink counts, ranking positions, revenue. You do not have them.
- Do not soften. A 34/100 is a site that is not ranking. Write it as that.

TOP PRIORITIES
Exactly 3, ordered by business impact. Not by points available, not by category order. A one-line fix that unblocks a sale outranks a twenty-point technical tidy-up no visitor ever sees.
Each "why" states the mechanism: what changes for the business once this is fixed.

${ANTI_SLOP_RULES}

OUTPUT strict JSON:
{
  "executive_summary": "3-4 sentences. Sentence one is the condition. Then cost, then the first move.",
  "top_priorities": [
    { "title": "the change, under 70 characters", "category": "technical"|"onpage"|"content"|"performance"|"offpage"|"ai_readiness", "why": "1 sentence naming the mechanism" }
  ]
}

Exactly 3 top_priorities, ordered by impact.`;
}
