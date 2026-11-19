import type { AuditPollResponse } from "@rostify/shared";
import type { FastifyPluginAsync } from "fastify";

import { startAudit } from "../pipeline.js";
import { hasDatabase } from "../lib/db.js";
import { env } from "../lib/env.js";
import { renderReportPdf } from "../lib/pdf.js";
import { AuditIdParamsSchema, CreateAuditRequestSchema } from "../lib/schemas.js";
import { isPocketBaseConfigured } from "../lib/pb.js";
import { fetchAudit, insertAudit, updateAudit } from "../lib/store.js";
import { assertPublicUrl, BlockedUrlError } from "../lib/url-guard.js";

const NOT_CONFIGURED =
  "No audit store is configured — set DATABASE_URL (Postgres/Neon) or the POCKETBASE_* variables.";

/** Postgres (serverless) or PocketBase (self-hosted) can back the API. */
function storeConfigured(): boolean {
  return hasDatabase || isPocketBaseConfigured();
}

/**
 * One in-flight render per audit: a double-click on "Download PDF" should
 * queue behind the first render, not launch a second headless browser.
 */
const pdfRenders = new Map<string, Promise<string>>();

// POST /audit + GET /audit/:id (spec §10)
export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/audit",
    {
      config: {
        rateLimit: { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW },
      },
    },
    async (request, reply) => {
      if (!storeConfigured()) {
        return reply.code(503).send({ error: NOT_CONFIGURED });
      }

      const parsed = CreateAuditRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid body — expected { url: string } (a valid URL)." });
      }

      const { url } = parsed.data;

      // The server fetches this URL with a real browser, so reject anything
      // that points back at its own network (loopback, RFC 1918, metadata).
      try {
        await assertPublicUrl(url);
      } catch (err) {
        const message =
          err instanceof BlockedUrlError ? err.message : "URL is not allowed.";
        return reply.code(400).send({ error: message });
      }

      let auditId: string;
      try {
        auditId = await insertAudit(url);
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: "Failed to create audit row." });
      }

      // Detached run: the response returns before the pipeline starts (§10).
      startAudit(auditId);

      return { auditId, status: "running" };
    },
  );

  app.get("/audit/:id", async (request, reply) => {
    if (!storeConfigured()) {
      return reply.code(503).send({ error: NOT_CONFIGURED });
    }

    const params = AuditIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid audit id." });
    }

    let row;
    try {
      row = await fetchAudit(params.data.id);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "Failed to read audit row." });
    }

    if (row === null) {
      return reply.code(404).send({ error: "Audit not found." });
    }

    const target = row.crawl_data?.target ?? null;

    const response: AuditPollResponse = {
      id: row.id,
      status: row.status,
      currentStep: row.current_step,
      targetUrl: row.target_url,
      result: row.final_report,
      error: row.error_message,
      uiux: row.uiux_analysis,
      pdfUrl: row.pdf_url,
      page:
        target === null
          ? null
          : {
              url: target.finalUrl,
              title: target.title,
              metaDescription: target.metaDescription,
              h1: target.h1,
              h2: target.h2,
              wordCount: target.wordCount,
              statusCode: target.statusCode,
            },
    };
    return response;
  });

  // POST /audit/:id/pdf — build the PDF on demand (spec §13 fallback). The
  // pipeline already renders one after synthesis; this covers runs where that
  // render failed and audits from before the stage existed.
  app.post(
    "/audit/:id/pdf",
    {
      config: {
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      if (!storeConfigured()) {
        return reply.code(503).send({ error: NOT_CONFIGURED });
      }

      const params = AuditIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "Invalid audit id." });
      }

      let row;
      try {
        row = await fetchAudit(params.data.id);
      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({ error: "Failed to read audit row." });
      }

      if (row === null) {
        return reply.code(404).send({ error: "Audit not found." });
      }

      // Only completed reports can be rendered; the print page would 404.
      if (row.final_report === null) {
        return reply
          .code(409)
          .send({ error: "This audit has no report yet — wait for it to finish." });
      }

      const existing = row.pdf_url;
      if (existing !== null) {
        return { pdfUrl: existing };
      }

      let render = pdfRenders.get(row.id);
      if (render === undefined) {
        render = renderReportPdf(row.id).then(async (pdfUrl) => {
          await updateAudit(row.id, { pdf_url: pdfUrl });
          return pdfUrl;
        });
        pdfRenders.set(row.id, render);
        void render
          .catch(() => undefined)
          .finally(() => pdfRenders.delete(row.id));
      }

      try {
        return { pdfUrl: await render };
      } catch (err) {
        request.log.warn({ err }, "pdf render failed");
        return reply
          .code(502)
          .send({ error: "Could not render this report as a PDF. Try again." });
      }
    },
  );
};
