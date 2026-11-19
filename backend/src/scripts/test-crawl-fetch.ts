import "dotenv/config";
import { randomUUID } from "node:crypto";

import { crawlUrl } from "../crawler/fetch.js";

/**
 * Smoke test for the Chromium-free crawler (no screenshots, so no PSI quota):
 *   pnpm --filter backend test:crawl-fetch https://example.com
 */
const url = process.argv[2] ?? "https://example.com";

const data = await crawlUrl(url, {
  auditId: randomUUID(),
  label: "target",
  screenshots: false,
});

console.log({
  url: data.url,
  finalUrl: data.finalUrl,
  statusCode: data.statusCode,
  redirectCount: data.redirectCount,
  title: data.title,
  metaDescription: data.metaDescription,
  h1: data.h1.slice(0, 3),
  wordCount: data.wordCount,
  images: data.images.length,
  internalLinks: data.internalLinks.length,
  externalLinks: data.externalLinks.length,
  jsonLd: data.jsonLd.length,
  robotsTxt: data.robotsTxt === null ? "none" : `${data.robotsTxt.length} chars`,
  sitemapXml: data.sitemapXml === null ? "none" : `${data.sitemapXml.length} chars`,
  crawlDurationMs: data.crawlDurationMs,
});
