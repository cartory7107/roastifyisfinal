import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Request, type Response } from "playwright";
import type { CrawlData } from "@rostify/shared";
import { CrawlDataSchema } from "../lib/schemas.js";
import {
  getMissingSupabaseKeys,
  isSupabaseConfigured,
  MissingSupabaseConfigError,
  uploadScreenshot,
} from "../lib/supabase.js";

export class CrawlError extends Error {
  constructor(
    message: string,
    readonly url: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "CrawlError";
    this.cause = cause;
  }
}

export type ScreenshotMode = "upload" | "local" | "none";

export type CrawlOptions = {
  /** Folder name in the `screenshots` bucket, per spec: `{audit_id}/{site}-{device}.png`. */
  auditId?: string;
  /** Short site label used in screenshot filenames (defaults to the hostname). */
  label?: string;
  /** `upload` (default) sends PNGs to Supabase Storage, `local` writes to `.cache/`. */
  screenshotMode?: ScreenshotMode;
};

const NAV_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 8_000;
const MAX_BODY_WORDS = 3000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const CACHE_DIR = fileURLToPath(
  new URL("../../.cache/screenshots", import.meta.url),
);

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
  origin: string;
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

function countRedirects(response: Response | null): number {
  let hops = 0;
  let request: Request | null = response?.request() ?? null;

  while (request) {
    request = request.redirectedFrom();
    if (request) hops += 1;
  }

  return hops;
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

async function captureSnapshot(
  page: import("playwright").Page,
): Promise<PageSnapshot> {
  return page.evaluate(() => {
    const metaContent = (selector: string): string | null => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      return el?.content?.trim() || null;
    };

    const linkHref = (selector: string): string | null => {
      const el = document.querySelector<HTMLLinkElement>(selector);
      return el?.href?.trim() || null;
    };

    const compact = (value: string | null | undefined): string =>
      (value ?? "").replace(/\s+/g, " ").trim();

    const headings = (selector: string): string[] =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => compact(el.textContent))
        .filter(Boolean);

    const ogTags: Record<string, string> = {};
    document.querySelectorAll<HTMLMetaElement>('meta[property^="og:"]').forEach(
      (el) => {
        const key = el.getAttribute("property");
        const value = el.getAttribute("content")?.trim();
        if (key && value) ogTags[key] = value;
      },
    );

    const hreflang = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel="alternate"][hreflang]',
      ),
    )
      .map((el) => el.getAttribute("hreflang")?.trim() ?? "")
      .filter(Boolean);

    const images = Array.from(document.querySelectorAll("img"))
      .map((img) => ({ src: img.currentSrc || img.src, alt: img.alt || null }))
      .filter((img) => img.src.startsWith("http"));

    const internal = new Set<string>();
    const external = new Set<string>();
    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      try {
        const resolved = new URL(anchor.href, document.baseURI);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
          return;
        }
        resolved.hash = "";
        if (resolved.origin === location.origin) {
          internal.add(resolved.href);
        } else {
          external.add(resolved.href);
        }
      } catch {
        // Ignore unparseable hrefs.
      }
    });

    const jsonLd: unknown[] = [];
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((script) => {
        const raw = script.textContent?.trim();
        if (!raw) return;
        try {
          jsonLd.push(JSON.parse(raw));
        } catch {
          // Malformed JSON-LD is ignored; the crawler must not fail on it.
        }
      });

    return {
      title: document.title.trim(),
      metaDescription: metaContent('meta[name="description"]') ?? "",
      metaRobots: metaContent('meta[name="robots"]'),
      canonical: linkHref('link[rel="canonical"]'),
      viewportMeta: metaContent('meta[name="viewport"]'),
      hreflang,
      ogTags,
      h1: headings("h1"),
      h2: headings("h2"),
      h3: headings("h3"),
      fullText: compact(document.body?.innerText ?? ""),
      images,
      internalLinks: Array.from(internal),
      externalLinks: Array.from(external),
      jsonLd,
      microdata: document.querySelector("[itemscope]") !== null,
      origin: location.origin,
    };
  });
}

async function storeScreenshot(
  mode: ScreenshotMode,
  png: Buffer,
  auditId: string,
  label: string,
  device: "desktop" | "mobile",
): Promise<string> {
  if (mode === "none") return "";

  if (mode === "upload") {
    return uploadScreenshot(`${auditId}/${label}-${device}.png`, png);
  }

  const dir = path.join(CACHE_DIR, auditId);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${label}-${device}.png`);
  await writeFile(filePath, png);
  return filePath;
}

export async function crawlUrl(
  inputUrl: string,
  options: CrawlOptions = {},
): Promise<CrawlData> {
  const url = normalizeUrl(inputUrl);
  const auditId = options.auditId ?? randomUUID();
  const label = sanitizeLabel(options.label ?? new URL(url).hostname);
  const screenshotMode = options.screenshotMode ?? "upload";

  if (screenshotMode === "upload" && !isSupabaseConfigured()) {
    throw new MissingSupabaseConfigError(getMissingSupabaseKeys());
  }

  const startedAt = Date.now();
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });

  try {
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: DESKTOP_UA,
      ignoreHTTPSErrors: true,
    });
    const page = await desktopContext.newPage();

    // tsx/esbuild injects `__name(...)` into serialized callbacks; without this
    // shim `page.evaluate` throws "__name is not defined" inside the browser.
    // It must be registered before the first navigation to take effect.
    await page.addInitScript({
      content: "globalThis.__name = globalThis.__name || ((fn) => fn);",
    });

    let response: Response | null;
    try {
      response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (err) {
      throw new CrawlError(`Failed to load ${url}`, url, err);
    }

    await page
      .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
      .catch(() => undefined);

    const snapshot = await captureSnapshot(page);
    const finalUrl = page.url();

    const robotsTxt = await fetchText(new URL("/robots.txt", finalUrl).href);
    const sitemapXml = await fetchText(
      firstSitemapUrl(robotsTxt, snapshot.origin),
    );

    const desktopPng = await page.screenshot({ type: "png" });

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
      userAgent: MOBILE_UA,
      ignoreHTTPSErrors: true,
    });

    let mobilePng: Buffer;
    try {
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(finalUrl, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT_MS,
      });
      await mobilePage
        .waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS })
        .catch(() => undefined);
      mobilePng = await mobilePage.screenshot({ type: "png" });
    } finally {
      await mobileContext.close();
    }

    const [screenshotDesktopUrl, screenshotMobileUrl] = await Promise.all([
      storeScreenshot(screenshotMode, desktopPng, auditId, label, "desktop"),
      storeScreenshot(screenshotMode, mobilePng, auditId, label, "mobile"),
    ]);

    const words = snapshot.fullText ? snapshot.fullText.split(/\s+/) : [];
    const bodyText = words.slice(0, MAX_BODY_WORDS).join(" ");

    const data: CrawlData = {
      url,
      finalUrl,
      statusCode: response?.status() ?? 0,
      isHttps: new URL(finalUrl).protocol === "https:",
      redirectCount: countRedirects(response),

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

      robotsTxt,
      sitemapXml,

      screenshotDesktopUrl,
      screenshotMobileUrl,

      crawledAt: new Date().toISOString(),
      crawlDurationMs: Date.now() - startedAt,
    };

    return CrawlDataSchema.parse(data);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
