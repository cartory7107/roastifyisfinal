import "dotenv/config";

import { runAudit } from "../pipeline.js";
import { fetchAudit, insertAudit } from "../lib/store.js";
import { getMissingPocketBaseKeys } from "../lib/pb.js";

/**
 * Demo rehearsal (spec Â§13, phase 12): run one or more audits end to end and
 * report the wall-clock time of each, so a demo can be timed and the failure
 * modes surfaced before an audience sees them.
 *
 * Usage: pnpm --filter backend test:audit https://example.com [https://...]
 */

type RunResult = {
  url: string;
  auditId: string;
  status: string;
  seconds: number;
  overall: string;
  grade: string;
  pdfUrl: string;
  error: string;
};

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function rehearse(url: string): Promise<RunResult> {
  header(url);

  const auditId = await insertAudit(url);
  console.log(`[audit] ${auditId}`);

  const startedAt = Date.now();
  await runAudit(auditId);
  const seconds = Math.round((Date.now() - startedAt) / 100) / 10;

  const row = await fetchAudit(auditId);
  const report = row?.final_report ?? null;

  const result: RunResult = {
    url,
    auditId,
    status: row?.status ?? "missing",
    seconds,
    overall:
      typeof report?.overall_score === "number"
        ? String(report.overall_score)
        : "n/a",
    grade: typeof report?.grade === "string" ? report.grade : "n/a",
    pdfUrl: row?.pdf_url ?? "n/a",
    error: row?.error_message ?? "n/a",
  };

  console.log(`[audit] status     ${result.status}`);
  console.log(`[audit] duration   ${result.seconds}s`);
  console.log(`[audit] score      ${result.overall} (${result.grade})`);
  console.log(`[audit] pdf        ${result.pdfUrl}`);
  if (result.error !== "n/a") {
    console.log(`[audit] error      ${result.error}`);
  }

  return result;
}

async function main(): Promise<void> {
  const urls = process.argv
    .slice(2)
    .map((value) => value.trim())
    .filter((value) => value !== "");

  if (urls.length === 0) {
    console.error(
      "usage: pnpm --filter backend test:audit <url> [<url> ...]",
    );
    process.exitCode = 1;
    return;
  }

  const missing = getMissingPocketBaseKeys();
  if (missing.length > 0) {
    console.error(`[audit] missing env: ${missing.join(", ")}`);
    console.error("[audit] copy .env.example to .env and fill in the keys");
    process.exitCode = 1;
    return;
  }

  const results: RunResult[] = [];
  for (const url of urls) {
    results.push(await rehearse(url));
  }

  header("summary");
  for (const item of results) {
    console.log(
      `${item.status.padEnd(9)} ${`${item.seconds}s`.padStart(7)}  ` +
        `${item.overall.padStart(3)} ${item.grade.padEnd(2)}  ${item.url}`,
    );
  }

  const total = results.reduce((sum, item) => sum + item.seconds, 0);
  console.log(`\ntotal wall clock: ${Math.round(total * 10) / 10}s`);

  if (results.some((item) => item.status !== "completed")) {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
