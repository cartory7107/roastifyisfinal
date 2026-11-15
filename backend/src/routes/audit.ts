import type { AuditPollResponse } from "@rostify/shared";
import type { FastifyPluginAsync } from "fastify";

import { startAudit } from "../pipeline.js";
import { AuditIdParamsSchema, CreateAuditRequestSchema } from "../lib/schemas.js";
import { fetchAudit, insertAudit } from "../lib/store.js";
import { isSupabaseConfigured } from "../lib/supabase.js";

const NOT_CONFIGURED =
  "Supabase is not configured — copy .env.example to .env and fill SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.";

// POST /audit + GET /audit/:id (spec §10)
export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.post("/audit", async (request, reply) => {
    if (!isSupabaseConfigured()) {
      return reply.code(503).send({ error: NOT_CONFIGURED });
    }

    const parsed = CreateAuditRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "Invalid body — expected { url: string } (a valid URL)." });
    }

    const { url } = parsed.data;
    if (!/^https?:\/\//i.test(url)) {
      return reply.code(400).send({ error: "URL must start with http:// or https://" });
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
  });

  app.get("/audit/:id", async (request, reply) => {
    if (!isSupabaseConfigured()) {
      return reply.code(503).send({ error: NOT_CONFIGURED });
    }

    const params = AuditIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid audit id — expected a UUID." });
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
};
