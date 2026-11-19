import type { CrawlData } from "@rostify/shared";
import { load } from "cheerio";

import { saveScreenshot } from "../lib/files.js";
import { decodeDataUri, psiSnapshot } from "../lib/psi.js";
import { CrawlDataSchema } from "../lib/schemas.js";
import { CrawlError } from "./errors.js";

/**
 * Chromium-free crawler used in serverless mode. It fetches the HTML with
 * `fetch`, parses the same fields the browser crawler captured, and takes the
 * screenshots from PageSpeed Insights (real Chrome in Google's cloud).
 *
 * The crawl is fetch-based, so JavaScript-rendered content is not available.
 * Every downstream analyst reads server-rendered markup, so that trade-off is
 * acceptable; the performance/vision stages still see a real browser render.
 */

const NAV_TIMEOUT_MS = 30_000;
const MAX_TEXT_BYTES = 5_000_000;
const MAX_BODY_WORDS = 3000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const MAX_REDIRECTS = 5;

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * WordPress mShots: a keyless, free screenshot service. It is the fallback for
 * the vision stage when PageSpeed Insights is unavailable (its anonymous
 * quota is shared by every caller on the internet, so it regularly runs out).
 */
const MSHOTS_BASE = "https://s.wordpress.com/mshots/v1";
const MSHOTS_MIN_BYTES = 8_000; // below this it is the "generating" placeholder

export type FetchCrawlOptions = {
  auditId: string;
  /** Short site label used in screenshot filenames (defaults to the hostname). */
  label?: string;
  /** Capture desktop + mobile screenshots via PageSpeed Insights (default true). */
  screenshots?: boolean;
};

type PageSnapshot = {
  title: string;
  metaDescription: string;
  metaRobots: string | null;
  canonical: string | null;
  viewportMeta: string | null;
  hreflang: string[];
  ogTags: Record<string, string>;
  h1: string[];
  h2: string[];
  h3: string[];
  fullText: string;
  images: { src: string; alt: string | null }[];
  internalLinks: string[];
  externalLinks: string[];
  jsonLd: unknown[];
  microdata: boolean;
  metaRefresh: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch (err) {
    throw new CrawlError("Invalid URL", input, err);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CrawlError("Only http(s) URLs can be crawled", input);
  }

  return parsed.toString();
}

function sanitizeLabel(label: string): string {
  const clean = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean.slice(0, 40) || "site";
}

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string | undefined, base: string): string | null {
  if (href === undefined || href.trim() === "") return null;
  try {
    const resolved = new URL(href.trim(), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

/** GET a text file with the 3x exponential retry required by the spec. */
async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": DESKTOP_UA },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return await response.text();
      }

      if (
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404
      ) {
        return null;
      }
    } catch {
      // Network errors are retried below.
    }

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await sleep(delay);
  }

  return null;
}

function firstSitemapUrl(robotsTxt: string | null, origin: string): string {
  if (robotsTxt) {
    for (const line of robotsTxt.split(/\r?\n/)) {
      const match = /^\s*sitemap:\s*(\S+)\s*$/i.exec(line);
      const candidate = match?.[1];
      if (candidate) return candidate;
    }
  }

  return `${origin}/sitemap.xml`;
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (reader === undefined) {
    return Buffer.from(await response.arrayBuffer());
  }

  const chunks: Buffer[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;

    chunks.push(Buffer.from(value));
    total += value.byteLength;

    if (total >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return Buffer.concat(chunks).subarray(0, maxBytes);
}

/** Follow redirects by hand so the hop count matches what the browser saw. */
async function fetchPage(url: string): Promise<{
  response: Response;
  finalUrl: string;
  redirects: number;
}> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: {
          "user-agent": DESKTOP_UA,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(NAV_TIMEOUT_MS),
      });
    } catch (err) {
      throw new CrawlError(`Failed to load ${url}`, url, err);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (location === null) {
        return { response, finalUrl: current, redirects: hop };
      }

      current = new URL(location, current).toString();
      continue;
    }

    return { response, finalUrl: current, redirects: hop };
  }

  throw new CrawlError(`Too many redirects for ${url}`, url);
}

function parseHtml(html: string, baseUrl: string): PageSnapshot {
  const $ = load(html);
  const origin = new URL(baseUrl).origin;

  const headings = (selector: string): string[] =>
    $(selector)
      .map((_index, element) => compact($(element).text()))
      .get()
      .filter((text) => text.length > 0);

  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_index, element) => {
    const key = $(element).attr("property");
    const value = $(element).attr("content")?.trim();
    if (key && value) ogTags[key] = value;
  });

  const hreflang = $('link[rel="alternate"][hreflang]')
    .map((_index, element) => $(element).attr("hreflang")?.trim() ?? "")
    .get()
    .filter((value) => value.length > 0);

  const images = $("img")
    .map((_index, element) => {
      const src = absoluteUrl(
        $(element).attr("src") ?? $(element).attr("data-src"),
        baseUrl,
      );
      if (src === null) return null;
      const alt = $(element).attr("alt")?.trim();
      return { src, alt: alt !== undefined && alt !== "" ? alt : null };
    })
    .get()
    .filter(
      (image): image is { src: string; alt: string | null } => image !== null,
    );

  const internal = new Set<string>();
  const external = new Set<string>();
  $("a[href]").each((_index, element) => {
    const href = absoluteUrl($(element).attr("href"), baseUrl);
    if (href === null) return;

    try {
      if (new URL(href).origin === origin) internal.add(href);
      else external.add(href);
    } catch {
      // Ignore unparseable hrefs.
    }
  });

  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).text().trim();
    if (raw === "") return;
    try {
      jsonLd.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is ignored; the crawler must not fail on it.
    }
  });

  const body = $("body").clone();
  body.find("script, style, noscript, template").remove();
  const fullText = compact(body.length > 0 ? body.text() : $.root().text());

  const metaRefresh = $("meta[http-equiv]")
    .toArray()
    .some(
      (element) =>
        ($(element).attr("http-equiv") ?? "").toLowerCase() === "refresh",
    );

  return {
    title: compact($("title").first().text()),
    metaDescription: compact($('meta[name="description"]').attr("content")),
    metaRobots: $('meta[name="robots"]').attr("content")?.trim() || null,
    canonical: absoluteUrl($('link[rel="canonical"]').attr("href"), baseUrl),
    viewportMeta: $('meta[name="viewport"]').attr("content")?.trim() || null,
    hreflang,
    ogTags,
    h1: headings("h1"),
    h2: headings("h2"),
    h3: headings("h3"),
    fullText,
    images,
    internalLinks: Array.from(internal),
    externalLinks: Array.from(external),
    jsonLd,
    microdata: $("[itemscope]").length > 0,
    metaRefresh,
  };
}

async function screenshotUrl(
  auditId: string,
  label: string,
  device: "desktop" | "mobile",
  dataUri: string,
): Promise<string> {
  const decoded = decodeDataUri(dataUri);
  if (decoded === null) return "";
  return saveScreenshot(auditId, label, device, decoded.bytes, decoded.mimeType);
}

/** Keyless fallback screenshot; returns null while mShots is still generating. */
async function mshotsScreenshot(
  url: string,
  width: number,
  height: number,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const endpoint = `${MSHOTS_BASE}/${encodeURIComponent(url)}?w=${width}&h=${height}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(15_000),
      });

      const mimeType = response.headers.get("content-type") ?? "image/jpeg";
      if (response.ok && mimeType.startsWith("image/")) {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MSHOTS_MIN_BYTES) {
          return { bytes, mimeType };
        }
      }
    } catch {
      // Retry below; a cold mShots render can be slow.
    }

    await sleep(2_500);
  }

  return null;
}

async function captureScreenshots(
  finalUrl: string,
  auditId: string,
  label: string,
): Promise<{ desktop: string; mobile: string }> {
  const [mobile, desktop] = await Promise.allSettled([
    psiSnapshot(finalUrl, "mobile"),
    psiSnapshot(finalUrl, "desktop"),
  ]);

  const fallback = async (
    device: "desktop" | "mobile",
  ): Promise<string> => {
    const size =
      device === "mobile"
        ? { width: 390, height: 844 }
        : { width: 1200, height: 900 };
    const shot = await mshotsScreenshot(finalUrl, size.width, size.height);
    if (shot === null) return "";

    try {
      return await saveScreenshot(auditId, label, device, shot.bytes, shot.mimeType);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[crawl] could not store ${device} screenshot: ${reason}`);
      return "";
    }
  };

  const resolve = async (
    settled: PromiseSettledResult<{ screenshotDataUri: string | null }>,
    device: "desktop" | "mobile",
  ): Promise<string> => {
    if (settled.status === "rejected") {
      const reason =
        settled.reason instanceof Error
          ? settled.reason.message
          : String(settled.reason);
      console.warn(`[crawl] ${device} PSI screenshot unavailable: ${reason}`);
      return fallback(device);
    }

    const dataUri = settled.value.screenshotDataUri;
    if (dataUri === null) return fallback(device);

    try {
      return await screenshotUrl(auditId, label, device, dataUri);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[crawl] could not store ${device} screenshot: ${reason}`);
      return fallback(device);
    }
  };

  const [mobileUrl, desktopUrl] = await Promise.all([
    resolve(mobile, "mobile"),
    resolve(desktop, "desktop"),
  ]);

  return { desktop: desktopUrl, mobile: mobileUrl };
}

export async function crawlUrl(
  inputUrl: string,
  options: FetchCrawlOptions,
): Promise<CrawlData> {
  const url = normalizeUrl(inputUrl);
  const label = sanitizeLabel(options.label ?? new URL(url).hostname);
  const startedAt = Date.now();

  const { response, finalUrl, redirects } = await fetchPage(url);

  let html: string;
  try {
    html = (await readCapped(response, MAX_TEXT_BYTES)).toString("utf8");
  } catch (err) {
    throw new CrawlError(`Failed to read ${finalUrl}`, finalUrl, err);
  }

  const snapshot = parseHtml(html, finalUrl);
  const origin = new URL(finalUrl).origin;

  const robotsTxt = await fetchText(new URL("/robots.txt", finalUrl).href);
  const sitemapXml = await fetchText(firstSitemapUrl(robotsTxt, origin));

  const screenshots =
    options.screenshots === false
      ? { desktop: "", mobile: "" }
      : await captureScreenshots(finalUrl, options.auditId, label);

  const words = snapshot.fullText === "" ? [] : snapshot.fullText.split(/\s+/);
  const bodyText = words.slice(0, MAX_BODY_WORDS).join(" ");

  const data: CrawlData = {
    url,
    finalUrl,
    statusCode: response.status,
    isHttps: new URL(finalUrl).protocol === "https:",
    redirectCount: redirects,

    title: snapshot.title,
    metaDescription: snapshot.metaDescription,
    metaRobots: snapshot.metaRobots,
    canonical: snapshot.canonical,
    viewportMeta: snapshot.viewportMeta,
    hreflang: snapshot.hreflang,
    ogTags: snapshot.ogTags,

    h1: snapshot.h1,
    h2: snapshot.h2,
    h3: snapshot.h3,

    bodyText,
    wordCount: words.length,
    images: snapshot.images,
    internalLinks: snapshot.internalLinks,
    externalLinks: snapshot.externalLinks,

    jsonLd: snapshot.jsonLd,
    microdata: snapshot.microdata,
    metaRefresh: snapshot.metaRefresh,

    robotsTxt,
    sitemapXml,

    screenshotDesktopUrl: screenshots.desktop,
    screenshotMobileUrl: screenshots.mobile,

    crawledAt: new Date().toISOString(),
    crawlDurationMs: Date.now() - startedAt,
  };

  return CrawlDataSchema.parse(data);
}
