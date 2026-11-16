import type { FastifyInstance } from "fastify";

/**
 * One error shape for the whole API: `{ error, requestId }`. Unexpected
 * failures are logged with the request id and reported without their internal
 * message, so a stack trace or database detail never reaches a client.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: "Not found.", requestId: request.id });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    if (reply.sent) return;

    const raw = error.statusCode ?? 500;
    const status = raw >= 400 && raw < 500 ? raw : 500;

    reply.code(status).send({
      error: status === 500 ? "Internal server error." : error.message,
      requestId: request.id,
    });
  });
}
