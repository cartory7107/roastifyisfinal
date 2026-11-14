import type { CrawlData } from "@rostify/shared";

/** Niche prompts only need a short excerpt of the homepage copy. */
const BODY_WORD_LIMIT = 500;

export function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, limit).join(" ");
}

export function buildNichePrompt(data: CrawlData): string {
  const body = firstWords(data.bodyText, BODY_WORD_LIMIT);

  return `You are a website analyst. Given scraped homepage data, identify the business.

INPUT:
Title: ${data.title}
Meta Description: ${data.metaDescription}
H1: ${data.h1.join(" | ")}
Body excerpt (first ${BODY_WORD_LIMIT} words): ${body}

OUTPUT strict JSON (no markdown, no commentary):
{
  "category": "short business category e.g. 'digital marketing agency', 'dental clinic'",
  "location": "city, country — default 'Bangladesh' if not detectable",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Keywords must be exactly 3, each 2-4 words, search-intent oriented, specific to what this business sells.`;
}
