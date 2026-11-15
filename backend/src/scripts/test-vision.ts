import "dotenv/config";

import type { CrawlData } from "@rostify/shared";

import { analyzeVision } from "../analysts/vision.js";
import { crawlUrl } from "../crawler/playwright.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  const competitorUrls = process.argv.slice(3);

  console.log(`[crawl] target: ${url}`);
  const target = await crawlUrl(url, {
    label: "target",
    screenshotMode: "local",
  });

  const competitors: CrawlData[] = [];
  for (const [index, competitorUrl] of competitorUrls.entries()) {
    try {
      console.log(`[crawl] competitor: ${competitorUrl}`);
      competitors.push(
        await crawlUrl(competitorUrl, {
          label: `competitor-${index + 1}`,
          screenshotMode: "local",
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[crawl] skipped ${competitorUrl}: ${message}`);
    }
  }

  console.log(`[vision] comparing against ${competitors.length} competitor(s)`);
  const analysis = await analyzeVision(target, competitors);

  // Contract check: must be a schema-valid CategoryAnalysis.
  CategoryAnalysisSchema.parse(analysis);

  console.log(JSON.stringify(analysis, null, 2));
  console.log(`\nscore: ${analysis.score}/100`);
  console.log(`findings: ${analysis.findings.length}`);
  console.log(`imagesSent: ${String(analysis.metrics.imagesSent)}`);
  console.log(`competitorsCompared: ${String(analysis.metrics.competitorsCompared)}`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
