import { describe, expect, it } from "vitest";

import {
  AuditIdSchema,
  AuditPollResponseSchema,
  AuditRowSchema,
  CreateAuditRequestSchema,
  CreateAuditResponseSchema,
} from "./schemas.js";

/** PocketBase generates 15-char alphanumeric ids (not UUIDs). */
const POCKETBASE_ID = "xum87xtyov0bbzo";

describe("AuditIdSchema", () => {
  it("accepts PocketBase ids", () => {
    expect(AuditIdSchema.parse(POCKETBASE_ID)).toBe(POCKETBASE_ID);
  });

  it("rejects UUID-style and unsafe ids", () => {
    expect(AuditIdSchema.safeParse("").success).toBe(false);
    expect(AuditIdSchema.safeParse("bad id!").success).toBe(false);
    expect(AuditIdSchema.safeParse("a".repeat(65)).success).toBe(false);
  });
});

describe("CreateAuditRequestSchema", () => {
  it("accepts http and https urls", () => {
    expect(CreateAuditRequestSchema.safeParse({ url: "https://example.com" }).success).toBe(
      true,
    );
    expect(CreateAuditRequestSchema.safeParse({ url: "http://example.com" }).success).toBe(
      true,
    );
  });

  it("rejects a plain string", () => {
    expect(CreateAuditRequestSchema.safeParse({ url: "example.com" }).success).toBe(
      false,
    );
    expect(CreateAuditRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("CreateAuditResponseSchema", () => {
  it("accepts a PocketBase id", () => {
    const parsed = CreateAuditResponseSchema.safeParse({
      auditId: POCKETBASE_ID,
      status: "running",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("AuditRowSchema", () => {
  it("parses a pending row with every analysis empty", () => {
    const parsed = AuditRowSchema.safeParse({
      id: POCKETBASE_ID,
      status: "pending",
      current_step: null,
      target_url: "https://example.com",
      niche: null,
      keyword_research: null,
      competitors: null,
      crawl_data: null,
      technical_analysis: null,
      onpage_analysis: null,
      content_analysis: null,
      performance_analysis: null,
      offpage_analysis: null,
      ai_readiness_analysis: null,
      uiux_analysis: null,
      final_report: null,
      pdf_url: null,
      error_message: null,
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("requires uiux_analysis to be declared", () => {
    const row = {
      id: POCKETBASE_ID,
      status: "completed",
      current_step: null,
      target_url: "https://example.com",
      niche: null,
      keyword_research: null,
      competitors: null,
      crawl_data: null,
      technical_analysis: null,
      onpage_analysis: null,
      content_analysis: null,
      performance_analysis: null,
      offpage_analysis: null,
      ai_readiness_analysis: null,
      final_report: null,
      pdf_url: null,
      error_message: null,
      created_at: "2026-01-01T00:00:00.000Z",
      completed_at: null,
    };

    expect(AuditRowSchema.safeParse(row).success).toBe(false);
  });
});

describe("AuditPollResponseSchema", () => {
  it("accepts a running poll with no page yet", () => {
    const parsed = AuditPollResponseSchema.safeParse({
      id: POCKETBASE_ID,
      status: "running",
      currentStep: "crawl_target",
      targetUrl: "https://example.com",
      result: null,
      error: null,
      uiux: null,
      pdfUrl: null,
      page: null,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts a page snapshot", () => {
    const parsed = AuditPollResponseSchema.safeParse({
      id: POCKETBASE_ID,
      status: "running",
      currentStep: "onpage",
      targetUrl: "https://example.com",
      result: null,
      error: null,
      uiux: null,
      pdfUrl: null,
      page: {
        url: "https://example.com/",
        title: "Example",
        metaDescription: "Example page",
        h1: ["Hello"],
        h2: [],
        wordCount: 120,
        statusCode: 200,
      },
    });

    expect(parsed.success).toBe(true);
  });
});
