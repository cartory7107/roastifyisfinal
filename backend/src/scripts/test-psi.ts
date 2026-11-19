import "dotenv/config";

import { psiSnapshot } from "../lib/psi.js";

/**
 * Smoke test for the PageSpeed Insights path:
 *   pnpm --filter backend test:psi https://example.com
 */
const url = process.argv[2] ?? "https://example.com";

const snapshot = await psiSnapshot(url, "mobile");

console.log("metrics:", snapshot.metrics);
console.log("final url:", snapshot.finalUrl);

if (snapshot.screenshotDataUri === null) {
  console.log("screenshot: none");
} else {
  console.log(
    `screenshot: ${snapshot.screenshotDataUri.slice(0, 32)}… (${snapshot.screenshotDataUri.length} chars)`,
  );
}
