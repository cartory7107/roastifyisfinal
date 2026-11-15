import "dotenv/config";

import type { CrawlData } from "@rostify/shared";

import { analyzeContent } from "../analysts/content.js";
import { crawlUrl } from "../crawler/playwright.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";

const TEST_NICHE = {
  category: "web development agency",
  location: "Dhaka",
  keywords: ["web development", "software company", "it services"],
};

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  const competitorUrls = process.argv.slice(3);

  console.log(`[crawl] target: ${url}`);
  const target = await crawlUrl(url, {
    label: "target",
    screenshotMode: "local",
  });

  const competitors: CrawlData[] = [];
  for (const competitorUrl of competitorUrls) {
    try {
      console.log(`[crawl] competitor: ${competitorUrl}`);
      competitors.push(
        await crawlUrl(competitorUrl, {
          label: "competitor",
          screenshotMode: "local",
        }),
      );
    } catch (err) {
      console.warn(`[crawl] skipping ${competitorUrl}:`, err);
    }
  }

  console.log(
    `[content] ${competitors.length} competitor page(s), niche "${TEST_NICHE.keywords[0]}"`,
  );
  const analysis = await analyzeContent(target, competitors, TEST_NICHE);

  // Contract check: must be a schema-valid CategoryAnalysis.
  CategoryAnalysisSchema.parse(analysis);

  console.log(JSON.stringify(analysis, null, 2));
  console.log(`\nscore: ${analysis.score}/100`);
  console.log(`findings: ${analysis.findings.length}`);
  console.log(
    `subscores: ${JSON.stringify(analysis.metrics.subscores as Record<string, number>)}`,
  );
  console.log(`eeat: ${String(analysis.metrics.eeatScore)}/30`);
  console.log(`gaps: ${String(analysis.metrics.gapsCount)}`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
