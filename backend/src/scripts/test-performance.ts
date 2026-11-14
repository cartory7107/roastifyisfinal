import "dotenv/config";

import { analyzePerformance } from "../analysts/performance.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";

async function main(): Promise<void> {
  const url = process.argv[2] ?? "https://example.com";

  console.log(`[lighthouse] ${url}`);
  const analysis = await analyzePerformance(url);

  // Contract check: must be a schema-valid CategoryAnalysis.
  CategoryAnalysisSchema.parse(analysis);

  console.log(JSON.stringify(analysis, null, 2));
  console.log(`\nscore: ${analysis.score}/100`);
  console.log(`findings: ${analysis.findings.length}`);
  console.log(
    `metrics: lcp=${String(analysis.metrics.lcp_seconds)}s inp=${String(analysis.metrics.inp_ms)}ms cls=${String(analysis.metrics.cls)}`,
  );
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
