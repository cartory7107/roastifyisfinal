import "dotenv/config";

import { lookupKeyword, isSeoDataConfigured } from "../lib/seodata.js";

/**
 * Usage:
 *   pnpm --filter backend test:keywords "email marketing" ["headless cms" ...]
 *
 * Without arguments it looks up one obvious keyword so the exit code proves
 * the API key/quota works.
 */
async function main(): Promise<void> {
  const keywords = process.argv.slice(2);
  const targets = keywords.length > 0 ? keywords : ["seo audit"];
  const country = (process.env.SEO_KEYWORD_COUNTRY ?? "us").toLowerCase();

  console.log(
    `seodata.dev: ${isSeoDataConfigured() ? "key configured" : "anonymous (20/day)"}, country=${country}`,
  );

  for (const keyword of targets) {
    const metric = await lookupKeyword(keyword, { country });
    console.log(JSON.stringify(metric, null, 2));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
