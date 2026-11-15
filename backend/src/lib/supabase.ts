import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class MissingSupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(
      `Supabase is not configured. Missing env: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill the Supabase keys.",
    );
    this.name = "MissingSupabaseConfigError";
  }
}

export class ScreenshotUploadError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Failed to upload screenshot to Supabase Storage: ${path}`);
    this.name = "ScreenshotUploadError";
    this.cause = cause;
  }
}

export class ReportUploadError extends Error {
  constructor(path: string, cause: unknown) {
    super(`Failed to upload report PDF to Supabase Storage: ${path}`);
    this.name = "ReportUploadError";
    this.cause = cause;
  }
}

const REQUIRED_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export const SCREENSHOTS_BUCKET = "screenshots";
export const REPORTS_BUCKET = "reports";

export function getMissingSupabaseKeys(): string[] {
  return REQUIRED_KEYS.filter((key) => !process.env[key]?.trim());
}

export function isSupabaseConfigured(): boolean {
  return getMissingSupabaseKeys().length === 0;
}

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  const missing = getMissingSupabaseKeys();
  if (missing.length > 0) {
    throw new MissingSupabaseConfigError(missing);
  }

  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  return client;
}

export async function uploadScreenshot(
  storagePath: string,
  png: Buffer,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .upload(storagePath, png, { contentType: "image/png", upsert: true });

  if (error) {
    throw new ScreenshotUploadError(storagePath, error);
  }

  const { data } = supabase.storage
    .from(SCREENSHOTS_BUCKET)
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new ScreenshotUploadError(storagePath, "empty public URL");
  }

  return data.publicUrl;
}

/**
 * Upload a rendered report PDF to the `reports` bucket (spec §6:
 * `reports` — `{audit_id}/report.pdf`) and return its public URL.
 */
export async function uploadReportPdf(
  storagePath: string,
  pdf: Buffer,
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage
    .from(REPORTS_BUCKET)
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });

  if (error) {
    throw new ReportUploadError(storagePath, error);
  }

  const { data } = supabase.storage.from(REPORTS_BUCKET).getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new ReportUploadError(storagePath, "empty public URL");
  }

  return data.publicUrl;
}
