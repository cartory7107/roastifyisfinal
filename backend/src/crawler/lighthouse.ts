import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

import {
  extractMetrics,
  type LighthouseMetrics,
} from "../lib/lighthouse-metrics.js";

export { extractMetrics };
export type { LighthouseMetrics };

/** Hard limit per spec §8.4 — a Lighthouse run past this is abandoned. */
export const LIGHTHOUSE_TIMEOUT_MS = 60_000;

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
