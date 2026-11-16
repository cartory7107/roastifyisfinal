import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

/** Spec §8.9: screenshots are downscaled to at most 1024px wide before sending. */
export const MAX_VISION_WIDTH = 1024;

const DOWNLOAD_TIMEOUT_MS = 15_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type VisionImage = {
  label: string;
  /** Storage URL (upload mode) or local file path (local mode). */
  source: string;
  mimeType: string;
  base64: string;
  width: number;
  height: number;
  resized: boolean;
};

export type VisionImageInput = {
  label: string;
  source: string;
};

type LoadedImage = VisionImageInput & {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  resized: boolean;
};

/** PNG width/height straight from the IHDR chunk — no decode, no dependency. */
export function pngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function mimeTypeOf(buffer: Buffer): string {
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length > 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/png";
}

/** Read a screenshot from its remote URL or from the local `.cache` folder. */
async function loadImage(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`screenshot download failed with ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(source);
}

type ResizeResult = {
  width: number;
  height: number;
  dataUrl: string | null;
};

/**
 * Resize with Chromium's canvas — Playwright is already a dependency and the
 * canvas path keeps PNG encoding correct without adding an image library.
 * Returns `dataUrl: null` when the image already fits.
 */
async function resizeInBrowser(
  buffer: Buffer,
  mimeType: string,
  maxWidth: number,
): Promise<ResizeResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    // tsx/esbuild injects `__name(...)` into serialized callbacks; same shim
    // as the crawler so `page.evaluate` does not throw inside the browser.
    await page.addInitScript({
      content: "globalThis.__name = globalThis.__name || ((fn) => fn);",
    });

    return await page.evaluate(
      async (arg: { src: string; maxWidth: number }) => {
        const image = new Image();
        image.src = arg.src;
        await image.decode();

        const width = image.naturalWidth;
        const height = image.naturalHeight;
        if (width <= arg.maxWidth) {
          return { width, height, dataUrl: null };
        }

        const canvas = document.createElement("canvas");
        canvas.width = arg.maxWidth;
        canvas.height = Math.max(1, Math.round((height * arg.maxWidth) / width));

        const context = canvas.getContext("2d");
        if (context === null) {
          return { width, height, dataUrl: null };
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return {
          width: canvas.width,
          height: canvas.height,
          dataUrl: canvas.toDataURL("image/png"),
        };
      },
      {
        src: `data:${mimeType};base64,${buffer.toString("base64")}`,
        maxWidth,
      },
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function base64FromDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/**
 * Load every screenshot and downscale the ones wider than `maxWidth`.
 * A screenshot that cannot be loaded is dropped (logged) so one broken
 * competitor image never fails the whole audit.
 */
export async function prepareVisionImages(
  inputs: VisionImageInput[],
  maxWidth: number = MAX_VISION_WIDTH,
): Promise<VisionImage[]> {
  const loaded: LoadedImage[] = [];

  for (const input of inputs) {
    if (!input.source) continue;
    try {
      const buffer = await loadImage(input.source);
      const dimensions = pngDimensions(buffer);
      loaded.push({
        ...input,
        buffer,
        mimeType: mimeTypeOf(buffer),
        width: dimensions?.width ?? 0,
        height: dimensions?.height ?? 0,
        resized: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[vision] skipping ${input.label} screenshot (${input.source}): ${message}`,
      );
    }
  }

  for (const image of loaded) {
    // Unknown dimensions (non-PNG) are sent as-is: the browser probe below is
    // only worth it for PNGs we know are too wide.
    if (image.width === 0 || image.width <= maxWidth) continue;

    try {
      const result = await resizeInBrowser(image.buffer, image.mimeType, maxWidth);
      if (result.dataUrl === null) continue;
      image.buffer = Buffer.from(base64FromDataUrl(result.dataUrl), "base64");
      image.mimeType = "image/png";
      image.width = result.width;
      image.height = result.height;
      image.resized = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[vision] resize failed for ${image.label}, sending original: ${message}`);
    }
  }

  return loaded.map((image) => ({
    label: image.label,
    source: image.source,
    mimeType: image.mimeType,
    base64: image.buffer.toString("base64"),
    width: image.width,
    height: image.height,
    resized: image.resized,
  }));
}
