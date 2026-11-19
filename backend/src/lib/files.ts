import { getPool, hasDatabase } from "./db.js";
import { publicApiUrl } from "./env.js";
import { uploadReportPdf, uploadScreenshot } from "./pb.js";

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Public URL of a file served by the Postgres-backed API. */
export function fileUrl(auditId: string, filename: string): string {
  return `${publicApiUrl()}/files/${encodeURIComponent(auditId)}/${encodeURIComponent(filename)}`;
}

/** Store bytes in the `audit_files` table (serverless mode only). */
export async function putFile(
  auditId: string,
  filename: string,
  mimeType: string,
  bytes: Buffer,
): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_files (audit_id, filename, mime_type, bytes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (audit_id, filename)
     DO UPDATE SET mime_type = EXCLUDED.mime_type,
                   bytes = EXCLUDED.bytes,
                   created_at = now()`,
    [auditId, filename, mimeType, bytes],
  );
}

/** Read one stored file; `null` when it does not exist. */
export async function readFile(
  auditId: string,
  filename: string,
): Promise<{ mimeType: string; bytes: Buffer } | null> {
  const result = await getPool().query<{ mime_type: string; bytes: Buffer }>(
    "SELECT mime_type, bytes FROM audit_files WHERE audit_id = $1 AND filename = $2",
    [auditId, filename],
  );
  const row = result.rows[0];
  return row === undefined ? null : { mimeType: row.mime_type, bytes: row.bytes };
}

/**
 * Save one screenshot. PocketBase stores it on the audit record; Postgres
 * stores it in `audit_files` and returns this API's `/files/...` URL.
 */
export async function saveScreenshot(
  auditId: string,
  label: string,
  device: "desktop" | "mobile",
  bytes: Buffer,
  mimeType: string,
): Promise<string> {
  const extension = EXTENSION[mimeType] ?? "png";
  const filename = `${label}-${device}.${extension}`;

  if (!hasDatabase) {
    return uploadScreenshot(`${auditId}/${filename}`, bytes);
  }

  await putFile(auditId, filename, mimeType, bytes);
  return fileUrl(auditId, filename);
}

/** Save the rendered report PDF and return its public URL. */
export async function saveReportPdf(
  auditId: string,
  bytes: Buffer,
): Promise<string> {
  if (!hasDatabase) {
    return uploadReportPdf(`${auditId}/report.pdf`, bytes);
  }

  await putFile(auditId, "report.pdf", "application/pdf", bytes);
  return fileUrl(auditId, "report.pdf");
}
