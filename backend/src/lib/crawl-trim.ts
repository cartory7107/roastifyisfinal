import type { CrawlBundle, CrawlData } from "@rostify/shared";

/**
 * PocketBase caps a JSON column at 1 MB by default, and sitemaps alone can be
 * several megabytes. The report only reads the page metadata, so the raw
 * robots.txt/sitemap.xml text is stored as a short preview instead of the whole
 * document (the technical analysis keeps its own preview as well).
 *
 * Postgres has no such cap, but both stores share this trim so a report looks
 * identical regardless of where it was persisted.
 */
const CRAWL_TEXT_PREVIEW = 4_096;

function trimCrawlText(value: string | null): string | null {
  return value === null ? null : value.slice(0, CRAWL_TEXT_PREVIEW);
}

export function trimCrawlData(bundle: CrawlBundle): CrawlBundle {
  const trim = (data: CrawlData): CrawlData => ({
    ...data,
    robotsTxt: trimCrawlText(data.robotsTxt),
    sitemapXml: trimCrawlText(data.sitemapXml),
  });
  return { target: trim(bundle.target), competitors: bundle.competitors.map(trim) };
}
