import "dotenv/config";

import { huntCompetitors } from "../analysts/competitor.js";
import { classifyNiche } from "../analysts/niche.js";
import { crawlUrl } from "../crawler/playwright.js";
import { isLlmConfigured } from "../lib/llm.js";
import { isSerperConfigured } from "../lib/serper.js";

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";

  console.log(`[1/3] crawling ${url}`);
  const data = await crawlUrl(url, { label: "target", screenshotMode: "local" });

  if (!isLlmConfigured()) {
    console.log("\nGROQ_API_KEY missing — set it in .env to test the niche classifier.");
    process.exitCode = 1;
    return;
  }

  console.log("[2/3] classifying niche (Groq) ...");
  const niche = await classifyNiche(data);
  console.log(JSON.stringify(niche, null, 2));

  if (!isSerperConfigured()) {
    console.log("\nSERPER_API_KEY missing — set it in .env to test competitor hunting.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n[3/3] hunting competitors for "${niche.keywords.join(", ")}" (Serper) ...`);
  const competitors = await huntCompetitors(niche, data.url);
  console.log(JSON.stringify(competitors, null, 2));

  if (competitors.length === 0) {
    console.log("\n(no competitors found — check quota or blocklist)");
  }
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
