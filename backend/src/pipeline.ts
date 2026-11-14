import type { CategoryAnalysis, CrawlBundle, Niche } from "@rostify/shared";

import { analyzeAiReadiness } from "./analysts/ai-readiness.js";
import { huntCompetitors } from "./analysts/competitor.js";
import { classifyNiche, NICHE_FALLBACK } from "./analysts/niche.js";
import { analyzeOnPage } from "./analysts/on-page.js";
import { analyzeTechnical } from "./analysts/technical.js";
import { crawlUrl } from "./crawler/playwright.js";
import { updateAudit, fetchAudit, type AuditPatch } from "./lib/store.js";

/** Hard limit per spec §5.3 — anything longer fails with 'Audit timed out'. */
const AUDIT_TIMEOUT_MS = 180_000;

function log(message: string): void {
  console.log(`[pipeline] ${message}`);
}

/**
 * Reject with 'Audit timed out' after `ms`, clearing the timer when
 * `promise` wins the race so no unhandled rejection is left behind.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Audit timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one pipeline stage: mark `current_step`, run the stage, persist its
 * result. Every transition is logged (spec §18 stuck-handling item 10).
 */
async function stage<T>(
  id: string,
  step: AuditStepName,
  run: () => Promise<T> | T,
  save: (result: T) => AuditPatch,
): Promise<T> {
  log(`audit ${id}: step ${step}`);
  await updateAudit(id, { current_step: step });
  const result = await run();
  await updateAudit(id, save(result));
  log(`audit ${id}: step ${step} done`);
  return result;
}

type AuditStepName =
  | "crawl_target"
  | "technical"
  | "ai_readiness"
  | "niche"
  | "onpage"
  | "competitor";

/** Phase 5 pipeline: Crawl → [Tech, AI, Niche] ∥ → On-Page → Competitor. */
async function execute(auditId: string): Promise<void> {
  const row = await fetchAudit(auditId);
  if (row === null) {
    throw new Error(`audit ${auditId} not found`);
  }

  await updateAudit(auditId, { status: "running" });

  // A — crawl the target (screenshots upload to Supabase Storage).
  const target = await stage(
    auditId,
    "crawl_target",
    () =>
      crawlUrl(row.target_url, {
        label: "target",
        screenshotMode: "upload",
      }),
    (data) => ({ crawl_data: { target: data, competitors: [] } satisfies CrawlBundle }),
  );

  // B — technical, ai readiness, and niche are independent (spec §5.2).
  // Niche never throws (falls back), the analysts catch their own errors.
  let niche: Niche = NICHE_FALLBACK;
  await Promise.all([
    stage(
      auditId,
      "technical",
      () => analyzeTechnical(target),
      (analysis: CategoryAnalysis) => ({ technical_analysis: analysis }),
    ),
    stage(
      auditId,
      "ai_readiness",
      () => analyzeAiReadiness(target),
      (analysis: CategoryAnalysis) => ({ ai_readiness_analysis: analysis }),
    ),
    stage(
      auditId,
      "niche",
      () => classifyNiche(target),
      (result) => ({ niche: result }),
    ).then((result) => {
      niche = result;
    }),
  ]);

  // C — on-page depends on the niche's primary keyword (spec §8.2).
  await stage(
    auditId,
    "onpage",
    () => analyzeOnPage(target, niche),
    (analysis: CategoryAnalysis) => ({ onpage_analysis: analysis }),
  );

  // D — competitor hunt (Serper): degrades to [] on failure, never throws.
  await stage(
    auditId,
    "competitor",
    () => huntCompetitors(niche, row.target_url),
    (competitors) => ({ competitors }),
  );
}

/**
 * Fire-and-forget entry point called by POST /audit (spec §10):
 * the route returns immediately, this runs the pipeline detached.
 * Marks the audit completed when the phase-5 stages finish (later
 * phases extend `execute`), or failed with the error message.
 */
export function startAudit(auditId: string): void {
  setImmediate(() => {
    void runAudit(auditId);
  });
}

async function runAudit(auditId: string): Promise<void> {
  const startedAt = Date.now();
  log(`audit ${auditId} started`);

  try {
    await withTimeout(execute(auditId), AUDIT_TIMEOUT_MS);
    await updateAudit(auditId, {
      status: "completed",
      current_step: null,
      completed_at: new Date().toISOString(),
    });
    log(`audit ${auditId} completed in ${Date.now() - startedAt}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`audit ${auditId} failed after ${Date.now() - startedAt}ms: ${message}`);
    try {
      await updateAudit(auditId, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
    } catch (storeErr) {
      // The row could not be marked failed (e.g. Supabase outage) — log it
      // so `current_step` inspection can still explain the stall (§18.10).
      console.error(`[pipeline] could not mark ${auditId} failed:`, storeErr);
    }
  }
}
