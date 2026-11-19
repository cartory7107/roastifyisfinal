export class CrawlError extends Error {
  constructor(
    message: string,
    readonly url: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "CrawlError";
    this.cause = cause;
  }
}
