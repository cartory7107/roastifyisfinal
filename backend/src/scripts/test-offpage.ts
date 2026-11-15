import "dotenv/config";

import type { Competitor } from "@rostify/shared";

import { analyzeOffPage } from "../analysts/off-page.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";

function toCompetitor(url: string): Competitor {
  return { url, title: "", snippet: "", da: null };
}

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";
  const competitors = process.argv.slice(3).map(toCompetitor);

  console.log(`[offpage] target: ${url}`);
  console.log(`[offpage] competitors: ${competitors.length}`);

  const analysis = await analyzeOffPage(url, competitors);

  // Contract check: must be a schema-valid CategoryAnalysis.
  CategoryAnalysisSchema.parse(analysis);

  console.log(JSON.stringify(analysis, null, 2));
  console.log(`\nscore: ${analysis.score}/100`);
  console.log(`findings: ${analysis.findings.length}`);
  console.log(`openPageRank: ${String(analysis.metrics.openPageRank)}/10`);
  console.log(`competitorsAvg: ${String(analysis.metrics.competitorsAvg)}/10`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
