import type { CategoryAnalysis, FinalReport } from "@rostify/shared";
import PDFDocument from "pdfkit";

import { saveReportPdf } from "./files.js";
import { fetchAudit } from "./store.js";

/**
 * Chromium-free PDF renderer used in serverless mode. It draws the report
 * directly from the stored JSON with PDFKit, so generating a PDF needs no
 * browser and no web app round-trip.
 */

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN;

const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const ACCENT = "#6d28d9";
const RULE = "#e5e7eb";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#a16207",
  low: "#15803d",
};

const CATEGORY_ORDER = [
  "technical",
  "onpage",
  "content",
  "performance",
  "offpage",
  "ai_readiness",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical SEO",
  onpage: "On-Page SEO",
  content: "Content",
  performance: "Performance",
  offpage: "Off-Page",
  ai_readiness: "AI Readiness",
};

function gradeColor(grade: string): string {
  switch (grade) {
    case "A+":
    case "A":
      return "#15803d";
    case "B":
      return "#0f766e";
    case "C":
      return "#a16207";
    default:
      return "#b91c1c";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "#15803d";
  if (score >= 60) return "#0f766e";
  if (score >= 40) return "#a16207";
  return "#b91c1c";
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > BOTTOM) {
    doc.addPage();
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 48);
  doc.moveDown(0.9);
  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(title);
  doc
    .moveTo(MARGIN, doc.y + 3)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y + 3)
    .lineWidth(0.8)
    .strokeColor(RULE)
    .stroke();
  doc.moveDown(0.7);
}

function body(doc: PDFKit.PDFDocument, text: string, size = 10): void {
  doc
    .font("Helvetica")
    .fontSize(size)
    .fillColor(BODY)
    .text(text, { width: CONTENT_WIDTH, lineGap: 2 });
}

function scoreBar(
  doc: PDFKit.PDFDocument,
  label: string,
  score: number,
  measured = true,
): void {
  ensureSpace(doc, 32);
  const y = doc.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(INK)
    .text(label, MARGIN, y, { width: CONTENT_WIDTH - 70 });
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(measured ? scoreColor(score) : MUTED)
    .text(measured ? `${Math.round(score)}/100` : "n/a", PAGE_WIDTH - MARGIN - 70, y, {
      width: 70,
      align: "right",
    });

  const barY = y + 15;
  doc.roundedRect(MARGIN, barY, CONTENT_WIDTH, 5, 2.5).fill("#e5e7eb");

  if (measured) {
    const filled = Math.max(0, Math.min(100, score)) / 100;
    if (filled > 0) {
      doc
        .roundedRect(MARGIN, barY, CONTENT_WIDTH * filled, 5, 2.5)
        .fill(scoreColor(score));
    }
  }

  doc.y = barY + 13;
}

function renderFindings(
  doc: PDFKit.PDFDocument,
  analysis: CategoryAnalysis,
): void {
  const findings = analysis.findings.slice(0, 8);
  if (findings.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(MUTED).text("No findings.");
    doc.moveDown(0.4);
    return;
  }

  for (const finding of findings) {
    ensureSpace(doc, 64);
    const color = SEVERITY_COLOR[finding.severity] ?? MUTED;

    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(color)
      .text(finding.severity.toUpperCase());
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(INK)
      .text(finding.issue, { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(BODY)
      .text(finding.detail, { width: CONTENT_WIDTH, lineGap: 1.5 });
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor(ACCENT)
      .text(`Fix: ${finding.recommendation}`, {
        width: CONTENT_WIDTH,
        lineGap: 1.5,
      });
    doc.moveDown(0.6);
  }
}

function renderCover(doc: PDFKit.PDFDocument, report: FinalReport): void {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(ACCENT).text("ROSTIFY");
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor(INK)
    .text("Website Audit Report", { width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(report.meta.url, {
    width: CONTENT_WIDTH,
  });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Audited ${new Date(report.meta.audited_at).toUTCString()}`, {
      width: CONTENT_WIDTH,
    });

  doc.moveDown(1.6);

  const boxY = doc.y;
  doc.roundedRect(MARGIN, boxY, CONTENT_WIDTH, 120, 10).fill("#f5f3ff");

  doc
    .font("Helvetica-Bold")
    .fontSize(56)
    .fillColor(scoreColor(report.overall_score))
    .text(String(Math.round(report.overall_score)), MARGIN + 24, boxY + 20, {
      width: 140,
    });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(MUTED)
    .text("out of 100", MARGIN + 26, boxY + 84, { width: 140 });

  doc
    .font("Helvetica-Bold")
    .fontSize(40)
    .fillColor(gradeColor(report.grade))
    .text(report.grade, MARGIN + 190, boxY + 34, { width: 100, align: "center" });
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(MUTED)
    .text("GRADE", MARGIN + 190, boxY + 80, { width: 100, align: "center" });

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(BODY)
    .text(
      `${report.competitors.length} competitor(s) analysed · ${Math.round(
        report.meta.duration_ms / 1000,
      )}s runtime`,
      MARGIN + 320,
      boxY + 40,
      { width: CONTENT_WIDTH - 344, lineGap: 2 },
    );

  doc.y = boxY + 140;
}

function renderKeywords(doc: PDFKit.PDFDocument, report: FinalReport): void {
  const research = report.keywords;
  if (research === null || research.keywords.length === 0) return;

  sectionTitle(doc, `Keyword demand (${research.country.toUpperCase()})`);

  const rows = [...research.keywords]
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, 12);

  for (const row of rows) {
    ensureSpace(doc, 16);
    const y = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(INK).text(row.keyword, MARGIN, y, {
      width: CONTENT_WIDTH - 160,
      lineBreak: false,
      ellipsis: true,
    });
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        `${row.volume === null ? "—" : row.volume.toLocaleString("en-US")}/mo` +
          `${row.cpc === null ? "" : ` · $${row.cpc.toFixed(2)} CPC`}`,
        PAGE_WIDTH - MARGIN - 160,
        y,
        { width: 160, align: "right" },
      );
    doc.y = y + 14;
  }

  doc.moveDown(0.4);
}

function renderCompetitors(doc: PDFKit.PDFDocument, report: FinalReport): void {
  if (report.competitors.length === 0) return;

  sectionTitle(doc, "Competitors");
  for (const competitor of report.competitors) {
    ensureSpace(doc, 26);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(competitor.title, {
      width: CONTENT_WIDTH - 60,
    });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(competitor.url, { width: CONTENT_WIDTH - 60 });
    if (competitor.da !== null) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text(`Domain authority ${competitor.da}`, { width: CONTENT_WIDTH - 60 });
    }
    doc.moveDown(0.5);
  }
}

function renderFooter(
  doc: PDFKit.PDFDocument,
  report: FinalReport,
): void {
  const range = doc.bufferedPageRange();
  const total = range.count;

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);

    const previousBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .moveTo(MARGIN, PAGE_HEIGHT - MARGIN + 2)
      .lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN + 2)
      .lineWidth(0.6)
      .strokeColor(RULE)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Rostify — ${report.meta.url} — page ${index - range.start + 1} of ${total}`,
        MARGIN,
        PAGE_HEIGHT - MARGIN + 8,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false },
      );

    doc.page.margins.bottom = previousBottom;
  }
}

export function buildReportPdf(report: FinalReport): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN + 16, left: MARGIN },
      bufferPages: true,
      info: {
        Title: `Rostify audit — ${report.meta.url}`,
        Author: "Rostify",
        Subject: "Website audit report",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      renderCover(doc, report);

      sectionTitle(doc, "Executive summary");
      body(doc, report.executive_summary);

      if (report.top_priorities.length > 0) {
        sectionTitle(doc, "Top priorities");
        report.top_priorities.slice(0, 6).forEach((priority, index) => {
          ensureSpace(doc, 40);
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor(INK)
            .text(`${index + 1}. ${priority.title}`, { width: CONTENT_WIDTH });
          doc
            .font("Helvetica")
            .fontSize(9.5)
            .fillColor(BODY)
            .text(priority.why, { width: CONTENT_WIDTH, lineGap: 1.5 });
          doc.moveDown(0.4);
        });
      }

      sectionTitle(doc, "Category scores");
      for (const key of CATEGORY_ORDER) {
        const analysis = report.category_scores[key];
        if (analysis === undefined) continue;
        scoreBar(
          doc,
          CATEGORY_LABEL[key] ?? key,
          analysis.score,
          analysis.measurement !== "unavailable",
        );
      }

      for (const key of CATEGORY_ORDER) {
        const analysis = report.category_scores[key];
        if (analysis === undefined) continue;

        sectionTitle(
          doc,
          `${CATEGORY_LABEL[key] ?? key} — ${
            analysis.measurement === "unavailable"
              ? "not measured"
              : `${Math.round(analysis.score)}/100`
          }`,
        );
        body(doc, analysis.summary);
        doc.moveDown(0.5);
        renderFindings(doc, analysis);
      }

      renderKeywords(doc, report);
      renderCompetitors(doc, report);

      renderFooter(doc, report);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Render the stored report for `auditId`, save it, and return its public URL. */
export async function renderReportPdfServer(auditId: string): Promise<string> {
  const row = await fetchAudit(auditId);
  if (row === null || row.final_report === null) {
    throw new Error(`audit ${auditId} has no report to render`);
  }

  const pdf = await buildReportPdf(row.final_report);
  return saveReportPdf(auditId, pdf);
}
