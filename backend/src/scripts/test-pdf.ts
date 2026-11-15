import "dotenv/config";

import { printUrl, renderReportPdf, webBaseUrl } from "../lib/pdf.js";

/**
 * Smoke test for the PDF stage (spec §13, phase 11).
 * Usage: pnpm --filter backend test:pdf <audit-id>
 * Requires a completed audit and a running frontend on WEB_BASE_URL.
 */
async function main(): Promise<void> {
  const auditId = process.argv[2]?.trim();

  if (auditId === undefined || auditId === "") {
    console.error("usage: pnpm --filter backend test:pdf <audit-id>");
    process.exitCode = 1;
    return;
  }

  console.log(`[pdf] web base ${webBaseUrl()}`);
  console.log(`[pdf] rendering ${printUrl(auditId)}`);

  const startedAt = Date.now();
  const url = await renderReportPdf(auditId);

  console.log(`[pdf] rendered in ${Date.now() - startedAt}ms`);
  console.log(`[pdf] ${url}`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
