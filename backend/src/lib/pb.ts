import PocketBase from "pocketbase";

export class MissingPocketBaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `PocketBase is not configured. Missing env: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill the PocketBase keys.",
    );
    this.name = "MissingPocketBaseConfigError";
  }
}

export class ScreenshotUploadError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Failed to upload screenshot to PocketBase: ${path}`);
    this.name = "ScreenshotUploadError";
    this.cause = cause;
  }
}

export class ReportUploadError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Failed to upload report PDF to PocketBase: ${path}`);
    this.name = "ReportUploadError";
    this.cause = cause;
  }
}

const REQUIRED_KEYS = [
  "POCKETBASE_URL",
  "POCKETBASE_ADMIN_EMAIL",
  "POCKETBASE_ADMIN_PASSWORD",
] as const;

export const AUDITS_COLLECTION = "audits";

export function getMissingPocketBaseKeys(): string[] {
  return REQUIRED_KEYS.filter((key) => !process.env[key]?.trim());
}

export function isPocketBaseConfigured(): boolean {
  return getMissingPocketBaseKeys().length === 0;
}

/** Server-side base URL (used for the SDK calls). */
function baseUrl(): string {
  return (process.env.POCKETBASE_URL?.trim() ?? "").replace(/\/+$/, "");
}

/** Browser-facing base URL — file links are rendered in the web app. */
function publicBaseUrl(): string {
  const configured = process.env.POCKETBASE_PUBLIC_URL?.trim();
  return (configured === undefined || configured === "" ? baseUrl() : configured)
    .replace(/\/+$/, "");
}

/** Public URL for a file stored on an `audits` record. */
export function fileUrl(recordId: string, filename: string): string {
  return `${publicBaseUrl()}/api/files/${AUDITS_COLLECTION}/${recordId}/${encodeURIComponent(filename)}`;
}

let client: PocketBase | null = null;
let authPromise: Promise<PocketBase> | null = null;

/**
 * Shared admin client. PocketBase tokens expire, so re-authenticate lazily
 * whenever the store is no longer valid.
 */
export async function getPocketBase(): Promise<PocketBase> {
  if (!isPocketBaseConfigured()) {
    throw new MissingPocketBaseConfigError(getMissingPocketBaseKeys());
  }

  if (!client) {
    client = new PocketBase(baseUrl());
    client.autoCancellation(false);
  }

  if (!client.authStore.isValid) {
    if (!authPromise) {
      authPromise = client
        .collection("_superusers")
        .authWithPassword(
          process.env.POCKETBASE_ADMIN_EMAIL as string,
          process.env.POCKETBASE_ADMIN_PASSWORD as string,
        )
        .then(() => client as PocketBase)
        .finally(() => {
          authPromise = null;
        });
    }
    await authPromise;
  }

  return client;
}

/**
 * File fields live on the audit record, so every upload is a record update.
 * Updates are serialized: two parallel uploads would otherwise read the same
 * "before" snapshot and clobber each other.
 */
let queue: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** PocketBase returns a string for single-file fields and an array for multi. */
function toFileList(value: unknown): string[] {
  if (typeof value === "string") return value === "" ? [] : [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

async function attachFile(
  recordId: string,
  field: "screenshots" | "report",
  filename: string,
  buffer: Buffer,
  mimeType: string,
  errorClass: new (path: string, cause: unknown) => Error,
  keepExisting = false,
): Promise<string> {
  return serial(async () => {
    const path = `${recordId}/${filename}`;
    try {
      const pb = await getPocketBase();
      const before = await pb.collection(AUDITS_COLLECTION).getOne(recordId);
      const previous = toFileList(before[field]);

      const form = new FormData();
      // PocketBase replaces the whole file field on update; resubmit the names
      // of the files we want to keep so multi-file fields accumulate.
      if (keepExisting) {
        for (const name of previous) form.append(field, name);
      }
      form.append(field, new Blob([new Uint8Array(buffer)], { type: mimeType }), filename);

      const updated = await pb.collection(AUDITS_COLLECTION).update(recordId, form);
      const added = toFileList(updated[field]).find((name) => !previous.includes(name));

      if (added === undefined) {
        throw new Error("upload returned no filename");
      }
      return fileUrl(recordId, added);
    } catch (err) {
      throw new errorClass(path, err);
    }
  });
}

/**
 * Upload a screenshot onto the audit record. `storagePath` keeps the spec
 * shape `{audit_id}/{site}-{device}.png`.
 */
export async function uploadScreenshot(
  storagePath: string,
  png: Buffer,
): Promise<string> {
  const { recordId, filename } = splitPath(storagePath);
  return attachFile(
    recordId,
    "screenshots",
    filename,
    png,
    "image/png",
    ScreenshotUploadError,
    true,
  );
}

/** Upload the rendered report PDF and return its public URL. */
export async function uploadReportPdf(
  storagePath: string,
  pdf: Buffer,
): Promise<string> {
  const { recordId, filename } = splitPath(storagePath);
  return attachFile(recordId, "report", filename, pdf, "application/pdf", ReportUploadError);
}

function splitPath(storagePath: string): { recordId: string; filename: string } {
  const slash = storagePath.lastIndexOf("/");
  if (slash <= 0 || slash === storagePath.length - 1) {
    throw new Error(`Invalid storage path: ${storagePath}`);
  }
  return {
    recordId: storagePath.slice(0, slash),
    filename: storagePath.slice(slash + 1),
  };
}
