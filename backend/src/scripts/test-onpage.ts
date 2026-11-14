import "dotenv/config";

import { analyzeOnPage, primaryKeywordOf } from "../analysts/on-page.js";
import { crawlUrl } from "../crawler/playwright.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";

const TEST_NICHE = {
  category: "web development agency",
  location: "Dhaka",
  keywords: ["web development", "software company", "it services"],
};

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";

  console.log(`[crawl] ${url}`);
  const data = await crawlUrl(url, { label: "target", screenshotMode: "local" });

  const niche =
    process.argv[3] === "--no-niche" ? null : TEST_NICHE;
  console.log(`[onpage] primary keyword: "${primaryKeywordOf(niche)}"`);

  const analysis = analyzeOnPage(data, niche);

  // Contract check: must be a schema-valid CategoryAnalysis.
  CategoryAnalysisSchema.parse(analysis);

  console.log(JSON.stringify(analysis, null, 2));
  console.log(`\nscore: ${analysis.score}/100`);
  console.log(`findings: ${analysis.findings.length}`);
  console.log(
    `subscores: ${JSON.stringify(analysis.metrics.subscores as Record<string, number>)}`,
  );
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
