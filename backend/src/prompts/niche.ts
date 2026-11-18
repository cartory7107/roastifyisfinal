import type { CrawlData } from "@rostify/shared";

/** Niche prompts only need a short excerpt of the homepage copy. */
const BODY_WORD_LIMIT = 500;

export function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, limit).join(" ");
}

export function buildNichePrompt(data: CrawlData): string {
  const body = firstWords(data.bodyText, BODY_WORD_LIMIT);

  return `You are a business-model analyst. Given scraped homepage data, identify what this business actually is before anything else. Do not assume a business model from one cue: derive it from the site's own words, structure and offerings.

INPUT:
Title: ${data.title}
Meta Description: ${data.metaDescription}
H1: ${data.h1.join(" | ")}
Body excerpt (first ${BODY_WORD_LIMIT} words): ${body}

STEP 1 — BUSINESS MODEL. Classify the site by what it demonstrably offers, from evidence in the input. Examples of model classes — pick by evidence, not by default: AI/SaaS tool, developer tool/infrastructure, e-commerce store, course/education platform, digital-assets marketplace, creator or personal brand, community/network, media/publication, marketplace, portfolio/agency studio, local offline service business. Only classify as a "local marketing/digital agency" when the site itself explicitly sells local offline marketing services; never map a SaaS, tool, store or content site onto that template.

STEP 2 — LOCATION. Use a city/country only when the input states it (address, contact details, "serving {city}", local phone/currency). Otherwise return "not detectable". Never invent or default to a country, and never assume US/UK from language alone.

STEP 3 — KEYWORDS. Exactly 3 keywords, 2-4 words each, naming what this specific business sells — drawn from its own product/service vocabulary. Hard rules:
- No generic agency boilerplate ("digital marketing services", "SEO services", "best marketing agency") unless the site explicitly is that.
- No city or country name in a keyword unless the business is genuinely local offline.
- No brand name of the site itself.
- Each keyword should be a query a real customer of THIS model would type.

OUTPUT strict JSON (no markdown, no commentary):
{
  "category": "business category named from evidence, e.g. 'AI writing assistant SaaS', 'handmade jewellery store', 'developer API platform'",
  "location": "city, country — or 'not detectable' when the input does not state one",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;
}
