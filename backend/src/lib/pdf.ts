import { hasDatabase } from "./db.js";
import { renderReportPdfPlaywright } from "./pdf-playwright.js";
import { renderReportPdfServer } from "./pdf-server.js";

export { PdfRenderError, printUrl, webBaseUrl } from "./pdf-playwright.js";

/**
 * Render the report for `auditId` and return its public URL.
 *
 * Serverless mode (Postgres) draws the PDF with PDFKit: no browser, no web app
 * round-trip. The PocketBase path keeps the browser-rendered print view.
 */
export async function renderReportPdf(auditId: string): Promise<string> {
  return hasDatabase
    ? renderReportPdfServer(auditId)
    : renderReportPdfPlaywright(auditId);
}
