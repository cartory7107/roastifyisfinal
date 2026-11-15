import type { CrawlData } from "@rostify/shared";

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
 * Content prompt (spec §8.3): E-E-A-T scoring plus competitor content gaps.
 * Returns strict JSON so `generateJson` can validate it with a Zod schema.
 */
export function buildContentPrompt(
  target: CrawlData,
  competitors: CrawlData[],
): string {
  const body = firstWords(target.bodyText, TARGET_WORD_LIMIT);
  const competitorsSection =
    competitors.length === 0
      ? "(no competitors were crawled — score E-E-A-T on the target alone and return no gaps)"
      : competitors.map(competitorBlock).join("\n\n");

  return `You are an E-E-A-T and content strategy expert. Analyze the target website's content quality and identify content gaps vs competitors.

TARGET (${target.finalUrl}):
Title: ${target.title}
Body (first ${TARGET_WORD_LIMIT} words): ${body}

COMPETITORS:
${competitorsSection}

Analyze:
1. E-E-A-T signals present/missing (Experience, Expertise, Authoritativeness, Trust)
   - Testimonials, case studies, author bios, credentials
   - Contact info, privacy policy, terms
   - Citations, industry mentions
   Score E-E-A-T from 0-30.

2. Content gaps — what topics/services/sections competitors have that target lacks.
   Return max 5 gaps.

OUTPUT strict JSON (no markdown):
{
  "eeat_score": <0-30 integer>,
  "eeat_findings": [
    { "severity": "high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "content_gaps": [
    { "topic": "...", "seenOn": ["domain1", "domain2"], "why": "..." }
  ]
}`;
}
