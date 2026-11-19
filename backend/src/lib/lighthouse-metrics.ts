/**
 * Core Web Vitals extracted from a Lighthouse report (spec §8.4). `null` means
 * the audit did not report that value. `inpSource` records whether INP came
 * from the real INP audit or the TBT fallback.
 *
 * Lives in its own module so the PageSpeed Insights path can reuse the
 * extraction without importing the (browser-bound) Lighthouse runner.
 */
export type LighthouseMetrics = {
  lcpSeconds: number | null;
  inpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpSeconds: number | null;
  speedIndexSeconds: number | null;
  inpSource: "inp" | "tbt" | null;
};

type LhrAudits = Record<string, { numericValue?: number } | undefined>;

function readNumeric(audits: LhrAudits, auditId: string): number | null {
  const value = audits[auditId]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Pull the CWV metrics out of a Lighthouse LHR (spec §8.4 extraction). */
export function extractMetrics(lhr: { audits: LhrAudits }): LighthouseMetrics {
  const audits = lhr.audits;

  const lcpMs = readNumeric(audits, "largest-contentful-paint");
  const cls = readNumeric(audits, "cumulative-layout-shift");
  const tbtMs = readNumeric(audits, "total-blocking-time");
  const fcpMs = readNumeric(audits, "first-contentful-paint");
  const speedIndexMs = readNumeric(audits, "speed-index");

  const inpMs = readNumeric(audits, "interaction-to-next-paint");
  const usingFallback = inpMs === null;

  return {
    lcpSeconds: lcpMs === null ? null : lcpMs / 1000,
    inpMs: usingFallback ? tbtMs : inpMs,
    cls,
    tbtMs,
    fcpSeconds: fcpMs === null ? null : fcpMs / 1000,
    speedIndexSeconds: speedIndexMs === null ? null : speedIndexMs / 1000,
    inpSource: usingFallback ? (tbtMs === null ? null : "tbt") : "inp",
  };
}
