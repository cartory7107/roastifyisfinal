import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

/** Hard limit per spec §8.4 — a Lighthouse run past this is abandoned. */
export const LIGHTHOUSE_TIMEOUT_MS = 60_000;

/**
 * Core Web Vitals plus supporting metrics extracted from the LHR
 * (spec §8.4). `null` means the audit did not report that value.
 * `inpSource` records whether INP came from the real INP audit or the
 * TBT fallback (spec §8.4: "or fallback to total-blocking-time").
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

function readNumeric(
  audits: Record<string, { numericValue?: number } | undefined>,
  auditId: string,
): number | null {
  const value = audits[auditId]?.numericValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type LhrAudits = Record<string, { numericValue?: number } | undefined>;

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

/**
 * Run Lighthouse on `url` (mobile emulation, performance category only,
 * spec §8.4) and return the extracted metrics. Always kills Chrome.
 * Throws on chrome-launch failure, LHR failure, or the 60s timeout.
 */
export async function runLighthouse(url: string): Promise<LighthouseMetrics> {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });

  try {
    const run = lighthouse(url, {
      port: chrome.port,
      output: "json",
      onlyCategories: ["performance"],
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
      },
    });

    // Promise.race attaches handlers to both inputs, so a late rejection
    // of `run` after the timeout is still considered handled.
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Lighthouse timed out after ${LIGHTHOUSE_TIMEOUT_MS / 1000}s`)),
        LIGHTHOUSE_TIMEOUT_MS,
      );
    });

    try {
      const result = await Promise.race([run, timeout]);
      if (!result?.lhr) {
        throw new Error("Lighthouse returned no LHR result");
      }
      return extractMetrics(result.lhr);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await chrome.kill();
  }
}
