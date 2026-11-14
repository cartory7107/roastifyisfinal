import type { CrawlData, Niche } from "@rostify/shared";
import { z } from "zod";

import { generateJson } from "../lib/gemini.js";
import { buildNichePrompt } from "../prompts/niche.js";

/** Strict shape from spec §8.7 — stricter than the shared persistence schema. */
export const NicheResultSchema = z.object({
  category: z.string().min(3).max(100),
  location: z.string().min(2).max(100),
  keywords: z.array(z.string().min(3).max(80)).length(3),
});

/** Used when Gemini fails 3x — competitor hunt degrades but never breaks. */
export const NICHE_FALLBACK: Niche = {
  category: "unknown",
  location: "Bangladesh",
  keywords: ["services", "products", "company"],
};

/**
 * Classify the business behind a crawled homepage (spec §8.7).
 * Never throws: falls back to a generic niche so the pipeline continues.
 */
export async function classifyNiche(data: CrawlData): Promise<Niche> {
  try {
    return await generateJson(buildNichePrompt(data), NicheResultSchema);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[niche] classification failed, using fallback: ${message}`);
    return NICHE_FALLBACK;
  }
}
