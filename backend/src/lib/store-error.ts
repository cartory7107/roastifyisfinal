export class AuditStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Audit store ${operation} failed: ${detail}`);
    this.name = "AuditStoreError";
    this.cause = cause;
  }
}
