import type { CrawlData } from "@rostify/shared";

import { ANTI_SLOP_RULES } from "./anti-slop.js";
import { firstWords } from "./niche.js";

/** The E-E-A-T prompt reads a long slice of the target, less of each competitor. */
const TARGET_WORD_LIMIT = 2000;
const COMPETITOR_WORD_LIMIT = 800;

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function competitorBlock(competitor: CrawlData): string {
  const name = hostnameOf(competitor.finalUrl);
  const body = firstWords(competitor.bodyText, COMPETITOR_WORD_LIMIT);
  return `- ${name}
  Title: ${competitor.title}
  Body (first ${COMPETITOR_WORD_LIMIT} words): ${body}`;
}

/**
 * Content prompt (spec §8.3): information gain, semantic depth, E-E-A-T and
 * competitor content gaps. Returns strict JSON so `generateJson` can validate
 * it with a Zod schema.
 *
 * Methodology ported from the `page-audit` skill: the E-E-A-T block is a
 * scored rubric with bands rather than a checklist of assets, and the gap
 * analysis names missing entities instead of asking for "more detail".
 */
export function buildContentPrompt(
  target: CrawlData,
  competitors: CrawlData[],
): string {
  const body = firstWords(target.bodyText, TARGET_WORD_LIMIT);
  const competitorsSection =
    competitors.length === 0
      ? "(no competitors were crawled — score the target on its own and return no gaps)"
      : competitors.map(competitorBlock).join("\n\n");

  return `You are a senior content strategist auditing one page for E-E-A-T, information gain and semantic depth. Fifteen years in organic search. You are auditing, not writing. The reader owns the site and will act on this.

TARGET (${target.finalUrl}):
Title: ${target.title}
Body (first ${TARGET_WORD_LIMIT} words): ${body}

COMPETITORS:
${competitorsSection}

STEP 1 — INFORMATION GAIN.
Compare the target against the competitor bodies above. What does the target contain that they do not: original data, a first-hand process, specific numbers, dated observations, named examples. If the target adds nothing the competitor set already covers, that is the most important finding on this page and it must be stated plainly. Do not reward length. Length without new information is a liability, not an asset.

STEP 2 — SEMANTIC DEPTH.
List the entities (products, tools, standards, roles, places, costs), the predicates (the verbs a practitioner in this field uses, which are not the verbs a generalist uses), and the entity-attribute-value pairs that appear in the competitor bodies but are absent from the target. Name the missing ones specifically. "Add more detail" is not an acceptable answer here.

STEP 3 — E-E-A-T.
Score each component 0-10 using the bands below, then set eeat_score = round((Experience + Expertise + Authoritativeness + Trustworthiness) x 0.75), capped at 30.

Experience — the most underrated component. Bio length does not count; demonstrated doing counts.
  8-10: dated first-person accounts, original photos or screenshots, specific amounts or version numbers, what failed before this approach, counterintuitive findings.
  4-6: "in my experience" with no specifics, examples that could apply to any business, one anecdote with no numbers or dates.
  1-3: desk-research synthesis, "imagine you are..." instead of "when we did...", a bio claiming experience the body never demonstrates, stock imagery only.
  Heuristic: count specific, datable, first-person observations. Three or more reads strong. Zero or one reads absent, however good the bio is.

Expertise
  8-10: states where the advice does not apply (works above X, not below), explains the why behind each claim, domain vocabulary used naturally, two or more edge cases or trade-offs addressed.
  4-6: correct facts, no nuance, no "it depends" framing, terminology slightly loose.
  1-3: what a competent generalist produces in thirty minutes, every claim framed as universal, vocabulary a practitioner would not use.

Authoritativeness
  8-10: verifiable author identity, the page sits inside a topical cluster on the same domain, cites recognised sources accurately and in context.
  4-6: generic byline, orphaned page with no related content, vague "studies show".
  1-3: no attribution or attribution to the brand, no related content on the topic, no citations or citations to low-quality sources.

Trustworthiness
  8-10: statistics carry a named source and date, commercial relationships disclosed, hedging used where honesty requires it, methodology stated for original data, last-updated date backed by real edits.
  4-6: inconsistent citations, disclosure buried, minor outdated claims.
  1-3: unverifiable or fabricated claims, dead citations, affiliate content presented as editorial, no author, no date, no corrections.

Schema-without-substance red flags — score Trustworthiness down when you see them:
- Person schema plus a rich author bio with zero demonstrated experience in the body.
- Review or AggregateRating schema with no visible review text, or reviews the brand wrote about itself.
- FAQ questions phrased as keyword strings rather than something a person would ask.
- Credentials irrelevant to the topic.
- A "last updated" date with no substantive change behind it.

STEP 4 — CONTENT GAPS.
For each gap, name the topic, the competitor hostnames that cover it (use the names from COMPETITORS) and the concrete reason it matters for this business. Maximum 5. Do not list a gap the target already covers.

SEVERITY:
  critical — the page cannot compete as written (no information gain at all, or no experience demonstrated anywhere).
  high — a missing E-E-A-T component or a major topic gap.
  medium — a partial gap or an inconsistent signal.
  low — polish.
Do not return everything as high.

${ANTI_SLOP_RULES}

OUTPUT strict JSON (no markdown):
{
  "eeat_score": <0-30 integer>,
  "eeat_findings": [
    { "severity": "critical"|"high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "content_gaps": [
    { "topic": "...", "seenOn": ["domain1", "domain2"], "why": "..." }
  ]
}

"issue" is a claim about one specific element, maximum 90 characters. "detail" quotes or locates the evidence in the input. "recommendation" names the change, not the goal.`;
}
