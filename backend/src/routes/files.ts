import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { hasDatabase } from "../lib/db.js";
import { readFile } from "../lib/files.js";

/**
 * Public file endpoint for the serverless (Postgres) store. Screenshots and
 * PDFs live in `audit_files`, so the browser and the vision model read them
 * from this API instead of PocketBase.
 */
export const fileRoutes: FastifyPluginAsync = async (app) => {
  app.get("/files/:auditId/:filename", async (request, reply) => {
    if (!hasDatabase) {
      return reply.code(404).send({ error: "Not found." });
    }

    const parsed = z
      .object({
        auditId: z.string().regex(/^[A-Za-z0-9]{1,64}$/),
        filename: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
      })
      .safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid file path." });
    }

    let file: Awaited<ReturnType<typeof readFile>>;
    try {
      file = await readFile(parsed.data.auditId, parsed.data.filename);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: "Failed to read file." });
    }

    if (file === null) {
      return reply.code(404).send({ error: "Not found." });
    }

    reply.header("content-type", file.mimeType);
    reply.header("content-length", String(file.bytes.length));
    // A re-render can replace `report.pdf`, so a day of caching is the safe
    // maximum; screenshots never change after a completed audit.
    reply.header("cache-control", "public, max-age=86400");
    return reply.send(file.bytes);
  });
};
