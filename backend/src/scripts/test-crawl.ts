import "dotenv/config";
import { checkBrokenLinks } from "../crawler/broken-links.js";
import { crawlUrl } from "../crawler/playwright.js";
import { isPocketBaseConfigured } from "../lib/pb.js";

async function main(): Promise<void> {
  const target = process.argv[2] ?? "https://example.com";
  const upload = isPocketBaseConfigured();

  if (!upload) {
    console.warn(
      "[warn] PocketBase credentials missing: screenshots will be written to backend/.cache/screenshots",
    );
  }

  console.log(`[crawl] ${target}`);
  const data = await crawlUrl(target, {
    label: "target",
    screenshotMode: upload ? "upload" : "local",
  });

  console.log(JSON.stringify(data, null, 2));

  console.log("\n--- summary ---");
  console.log(`status          : ${data.statusCode}`);
  console.log(`final url       : ${data.finalUrl}`);
  console.log(`words           : ${data.wordCount}`);
  console.log(`h1 / h2 / h3    : ${data.h1.length} / ${data.h2.length} / ${data.h3.length}`);
  console.log(`internal links  : ${data.internalLinks.length}`);
  console.log(`external links  : ${data.externalLinks.length}`);
  console.log(`images          : ${data.images.length}`);
  console.log(`json-ld blocks  : ${data.jsonLd.length}`);
  console.log(`sitemap         : ${data.sitemapXml ? "found" : "missing"}`);
  console.log(`screenshot (desktop): ${data.screenshotDesktopUrl || "(none)"}`);
  console.log(`screenshot (mobile) : ${data.screenshotMobileUrl || "(none)"}`);
  console.log(`duration        : ${data.crawlDurationMs}ms`);

  const broken = await checkBrokenLinks(data.internalLinks, 10);
  console.log(`\n--- broken links (first 10 internal) ---`);
  if (broken.length === 0) {
    console.log("none");
  } else {
    for (const link of broken) {
      console.log(`${link.status ?? "ERR"}  ${link.url}${link.error ? `  (${link.error})` : ""}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
