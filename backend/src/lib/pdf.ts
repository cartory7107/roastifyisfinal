import { chromium } from "playwright";

import { uploadReportPdf } from "./pb.js";

/** Spec §15: 30s page timeout, one retry. */
const PAGE_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;

export class PdfRenderError extends Error {
  constructor(auditId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`PDF render failed for audit ${auditId}: ${detail}`);
    this.name = "PdfRenderError";
    this.cause = cause;
  }
}

/** Base URL of the web app whose print route renders the report (spec §12). */
export function webBaseUrl(): string {
  const configured = process.env.WEB_BASE_URL?.trim();
  return (configured === undefined || configured === "" ? "http://localhost:3000" : configured)
    .replace(/\/+$/, "");
}

export function printUrl(auditId: string): string {
  return `${webBaseUrl()}/audit/${auditId}/print`;
}

/**
 * Wait until fonts, images and the last section are in place. `networkidle`
 * alone is not enough: Next.js hydrates after the network settles and the
 * screenshots below the fold only start loading once they scroll into view.
 */
async function settleReport(page: import("playwright").Page): Promise<void> {
  await page.waitForSelector("#methodology", { timeout: PAGE_TIMEOUT_MS });

  // Every step below is best-effort and bounded: a font or a screenshot that
  // never settles must not hold the render (or crash it) — a slightly early
  // PDF beats no PDF at all.
  await page
    .waitForFunction(() => document.fonts.status === "loaded", undefined, {
      timeout: 5_000,
    })
    .catch(() => undefined);

  // Walk the page so below-the-fold screenshots start loading, then come back.
  await page
    .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    .catch(() => undefined);
  await page.waitForTimeout(400);
  await page
    .waitForFunction(
      () => Array.from(document.images).every((image) => image.complete),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
}

async function renderOnce(auditId: string): Promise<Buffer> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1240, height: 1754 },
    });
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);

    // `networkidle` is unreliable against a dev server (the HMR socket never
    // closes) and on pages that poll. The selector wait below is the real
    // readiness signal, so only block on the document here.
    const response = await page.goto(printUrl(auditId), {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });

    if (response !== null && response.status() >= 400) {
      throw new Error(`print page returned ${response.status()}`);
    }

    await settleReport(page);

    // `preferCSSPageSize` lets globals.css own the A4 margins (spec §11).
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

/**
 * Render `/audit/{id}/print` to PDF, attach it to the PocketBase audit record and return
 * its public URL (spec §13, phase 11). Retries once on a transient failure.
 */
export async function renderReportPdf(auditId: string): Promise<string> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const pdf = await renderOnce(auditId);
      return await uploadReportPdf(`${auditId}/report.pdf`, pdf);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[pdf] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${auditId}: ${message}`,
      );
    }
  }

  throw new PdfRenderError(auditId, lastError);
}
