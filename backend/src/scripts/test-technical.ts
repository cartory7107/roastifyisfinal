import "dotenv/config";

import { analyzeAiReadiness } from "../analysts/ai-readiness.js";
import { analyzeTechnical } from "../analysts/technical.js";
import { crawlUrl } from "../crawler/playwright.js";
import { CategoryAnalysisSchema } from "../lib/schemas.js";
import { isSupabaseConfigured } from "../lib/supabase.js";

async function main(): Promise<void> {
  const target = process.argv[2] ?? "https://example.com";
  const upload = isSupabaseConfigured();

  if (!upload) {
    console.warn(
      "[warn] Supabase credentials missing: screenshots will be written to backend/.cache/screenshots",
    );
  }

  console.log(`[crawl] ${target}`);
  const data = await crawlUrl(target, {
    label: "target",
    screenshotMode: upload ? "upload" : "local",
  });

  const startedAt = Date.now();
  const [technical, aiReadiness] = await Promise.all([
    analyzeTechnical(data),
    analyzeAiReadiness(data),
  ]);
  const analysisDurationMs = Date.now() - startedAt;

  // Contract check: analysts must produce schema-valid CategoryAnalysis objects.
  CategoryAnalysisSchema.parse(technical);
  CategoryAnalysisSchema.parse(aiReadiness);

  console.log("\n--- technical ---");
  console.log(JSON.stringify(technical, null, 2));

  console.log("\n--- ai readiness ---");
  console.log(JSON.stringify(aiReadiness, null, 2));

  console.log("\n--- summary ---");
  console.log(`technical score   : ${technical.score}`);
  console.log(`technical findings: ${technical.findings.length}`);
  console.log(`ai readiness score: ${aiReadiness.score}`);
  console.log(`ai findings       : ${aiReadiness.findings.length}`);
  console.log(`analysis duration : ${analysisDurationMs}ms`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
