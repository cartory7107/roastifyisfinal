import type {
  CategoryAnalysis,
  FinalReport,
  PageSnapshot,
} from "@rostify/shared";
import { ArrowLeft, CheckCircle2, FileText, Printer, ScanEye } from "lucide-react";
import Link from "next/link";

import {
  asNumber,
  asString,
  CATEGORY_META,
  CATEGORY_ORDER,
  CATEGORY_WEIGHT,
  countBySeverity,
  derivePriorities,
  formatAuditedAt,
  formatDuration,
  hostOf,
  pathOf,
  scoreBand,
  SEVERITY_META,
  sortFindings,
  totalFindings,
} from "@/lib/report";
import { cn } from "@/lib/utils";

import { CategoryDetail, Stat } from "./CategoryDetail";
import { DownloadPdfButton } from "./DownloadPdfButton";
import { CategoryScore } from "./CategoryScore";
import { FindingCard } from "./FindingCard";
import { PrioritiesList } from "./PrioritiesList";
import { GradeBadge, ScoreGauge } from "./ScoreGauge";
import { ScreenshotCompare } from "./ScreenshotCompare";
import { SectionCard } from "./SectionCard";

type ReportViewProps = {
  auditId: string;
  report: FinalReport;
  uiux: CategoryAnalysis | null;
  page: PageSnapshot | null;
  pdfUrl: string | null;
};

function verdict(report: FinalReport): { headline: string; subline: string } {
  const all = CATEGORY_ORDER.flatMap(
    (key) => report.category_scores[key].findings,
  );
  const counts = countBySeverity(all);
  const findings = all.length;

  const subline =
    findings === 0
      ? "No issues were detected across the six scored categories."
      : `${findings} finding${findings === 1 ? "" : "s"} across six categories — ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low.`;

  if (report.overall_score >= 80) {
    return {
      headline:
        "A well-built page. What follows are optimisations, not blockers.",
      subline,
    };
  }
  if (report.overall_score >= 60) {
    return {
      headline:
        "The foundation is sound, but a handful of issues are capping organic growth.",
      subline,
    };
  }
  return {
    headline:
      "Several issues on this page are actively working against its rankings.",
    subline,
  };
}

function CompetitorTable({ report }: { report: FinalReport }) {
  const domains = Array.isArray(report.competitors) ? report.competitors : [];
  if (domains.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
        No competitor pages could be captured for this run. Search data may have
        been unavailable, or the niche returned nothing comparable — the six
        category scores above are complete either way.
      </p>
    );
  }

  const maxDa = Math.max(1, ...domains.map((entry) => entry.da ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="py-2 pr-4 font-semibold">Ranking competitor</th>
            <th className="py-2 pr-4 font-semibold">Page title</th>
            <th className="py-2 text-right font-semibold">Domain authority</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((entry) => (
            <tr
              key={entry.url}
              className="border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/40"
            >
              <td className="py-3 pr-4 align-top">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {hostOf(entry.url)}
                </a>
                <p className="mt-0.5 max-w-xs truncate text-[11px] text-muted-foreground">
                  {entry.url}
                </p>
              </td>
              <td className="max-w-sm py-3 pr-4 align-top text-muted-foreground">
                {entry.title.trim() === "" ? "—" : entry.title}
              </td>
              <td className="py-3 align-top">
                <div className="flex items-center justify-end gap-2">
                  <span className="relative h-2 w-24 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-slate-400"
                      style={{
                        width: `${Math.min(100, ((entry.da ?? 0) / maxDa) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 text-xs font-semibold tabular-nums">
                    {entry.da ?? "—"}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "1,234" — keyword demand reads better with separators than raw integers. */
function formatCount(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString("en-US");
}

function formatMoney(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

function KeywordTable({ report }: { report: FinalReport }) {
  const research = report.keywords;
  const rows = research?.keywords ?? [];

  if (rows.length === 0) {
    const message =
      research?.error === "rate_limited"
        ? "The keyword research API's free allowance for today is used up, so no demand data was collected. Add a free SEOData.dev key to raise the limit to 50 lookups a day; the audit itself is complete either way."
        : "No keyword demand data was returned for this run — the keyword research API was unavailable or the niche returned nothing measurable. The audit itself is complete either way.";

    return (
      <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>
    );
  }

  const maxVolume = Math.max(1, ...rows.map((row) => row.volume ?? 0));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="py-2 pr-4 font-semibold">Keyword</th>
            <th className="py-2 pr-4 font-semibold">Monthly searches</th>
            <th className="py-2 pr-4 text-right font-semibold">CPC</th>
            <th className="py-2 text-right font-semibold">Competition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.keyword}
              className="border-b border-border/70 transition-colors last:border-0 hover:bg-secondary/40"
            >
              <td className="py-3 pr-4 align-top">
                <p className="font-medium">{row.keyword}</p>
                {row.similar.length > 0 ? (
                  <ul className="mt-1.5 flex max-w-sm flex-wrap gap-1.5">
                    {row.similar.slice(0, 5).map((suggestion) => (
                      <li
                        key={suggestion.keyword}
                        className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        title={
                          suggestion.volume === null
                            ? suggestion.keyword
                            : `${suggestion.keyword} — ${formatCount(suggestion.volume)}/mo`
                        }
                      >
                        {suggestion.keyword}
                        {suggestion.volume === null ? null : (
                          <span className="ml-1 tabular-nums text-foreground/70">
                            {formatCount(suggestion.volume)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
              <td className="py-3 pr-4 align-top">
                <div className="flex items-center gap-2">
                  <span className="relative h-2 w-24 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-slate-400"
                      style={{
                        width: `${Math.min(100, ((row.volume ?? 0) / maxVolume) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {formatCount(row.volume)}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-4 text-right align-top tabular-nums text-muted-foreground">
                {formatMoney(row.cpc)}
              </td>
              <td className="py-3 text-right align-top tabular-nums text-muted-foreground">
                {row.competition === null ? "—" : row.competition.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Monthly averages for {research?.country.toUpperCase() ?? "—"} from
        Google Ads data via seodata.dev. Competition is Google Ads competition
        (0–1), not keyword difficulty.
      </p>
    </div>
  );
}

function UiuxSection({ analysis }: { analysis: CategoryAnalysis }) {
  const findings = sortFindings(analysis.findings);
  const imagesSent = asNumber(analysis.metrics.imagesSent);
  const compared = asNumber(analysis.metrics.competitorsCompared);
  const llmScore = asNumber(analysis.metrics.llmScore);

  return (
    <SectionCard
      id="uiux"
      eyebrow="Visual review"
      title="UI/UX & mobile experience"
      description={
        asString(analysis.summary) ??
        "A screenshot-based review of the page against the competitors that outrank it."
      }
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          <ScanEye aria-hidden className="h-3.5 w-3.5" />
          Not weighted
        </span>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat
            label="Visual score (AI)"
            value={llmScore === null ? "—" : `${Math.round(llmScore)}/100`}
          />
          <Stat
            label="Screenshots compared"
            value={
              compared === null
                ? `${imagesSent ?? "—"}`
                : `${imagesSent ?? "—"} (you + ${compared} rivals)`
            }
          />
          <Stat label="Findings" value={`${findings.length}`} />
        </div>

        {findings.length > 0 ? (
          <div className="space-y-3">
            {findings.map((finding, index) => (
              <FindingCard key={`${finding.category}-${index}`} finding={finding} />
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
            <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
            No visual issues were flagged. The layout reads cleanly against the
            competitors.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

/**
 * The full audit report (spec §11). Rendered by both the polling page and the
 * print page, so every section here has to work with and without JS.
 */
export function ReportView({
  auditId,
  report,
  uiux,
  page,
  pdfUrl,
}: ReportViewProps) {
  const host = hostOf(report.meta.url);
  const priorities = derivePriorities(report);
  const total = totalFindings(report, uiux);
  const message = verdict(report);
  const overallBand = scoreBand(report.overall_score);

  const allFindings = [
    ...CATEGORY_ORDER.flatMap((key) => report.category_scores[key].findings),
    ...(uiux?.findings ?? []),
  ];
  const counts = countBySeverity(allFindings);
  const hasScreenshots =
    report.screenshots.target.desktop !== "" ||
    report.screenshots.target.mobile !== "";

  return (
    <article className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      {/* ---------- Header ---------- */}
      <header className="flex flex-wrap items-start justify-between gap-4 no-print">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Run another audit
          </Link>
          <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold tracking-tight">
            <span className="truncate">{host}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {pathOf(report.meta.url)}
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Audited {formatAuditedAt(report.meta.audited_at)} ·{" "}
            {formatDuration(report.meta.duration_ms)} · {total} findings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/audit/${auditId}/print`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Printer aria-hidden className="h-4 w-4" />
            Print view
          </Link>
          <DownloadPdfButton auditId={auditId} pdfUrl={pdfUrl} />
        </div>
      </header>

      {/* ---------- Score hero ---------- */}
      <section className="print-break overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-background to-secondary/50 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-3">
            <ScoreGauge score={report.overall_score} grade={report.grade} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <GradeBadge grade={report.grade} />
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  overallBand.bg,
                  overallBand.border,
                  overallBand.text,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", overallBand.bar)} />
                {overallBand.label}
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Executive summary
            </p>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug sm:text-xl">
              {message.headline}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {message.subline}
            </p>

            <div className="mt-4 rounded-xl border border-border bg-background/80 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {report.executive_summary}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(["critical", "high", "medium", "low"] as const).map(
                (severity) =>
                  counts[severity] > 0 ? (
                    <span
                      key={severity}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        SEVERITY_META[severity].badge,
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          SEVERITY_META[severity].dot,
                        )}
                      />
                      {counts[severity]} {SEVERITY_META[severity].label.toLowerCase()}
                    </span>
                  ) : null,
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Scorecard ---------- */}
      <SectionCard
        id="scorecard"
        eyebrow="Section 1"
        title="Scorecard"
        description="Each category is scored out of 100 from measured data, then weighted into the overall score. Click a row to jump to its findings."
      >
        <div className="space-y-1">
          {CATEGORY_ORDER.map((key) => {
            const analysis = report.category_scores[key];
            return (
              <CategoryScore
                key={key}
                label={CATEGORY_META[key].label}
                score={analysis.score}
                href={`#${CATEGORY_META[key].anchor}`}
                findingCount={analysis.findings.length}
                weight={CATEGORY_WEIGHT[key]}
              />
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> 80–100 good
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> 60–79 needs work
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> below 60 critical
          </span>
          <span className="ml-auto">Percentages are each category&apos;s weight.</span>
        </div>
      </SectionCard>

      {/* ---------- Priorities ---------- */}
      <SectionCard
        id="priorities"
        eyebrow="Section 2"
        title="What to fix first"
        description="Ordered by expected impact. Fixing these three items moves the overall score more than anything else in this report."
      >
        <PrioritiesList priorities={priorities} />
      </SectionCard>

      {/* ---------- Category detail ---------- */}
      {CATEGORY_ORDER.map((key, index) => {
        const analysis = report.category_scores[key];
        const meta = CATEGORY_META[key];
        return (
          <SectionCard
            key={key}
            id={meta.anchor}
            eyebrow={`Section ${index + 3} · ${Math.round(CATEGORY_WEIGHT[key] * 100)}% of overall`}
            title={meta.label}
            description={asString(analysis.summary) ?? meta.blurb}
            actions={
              <span className="inline-flex items-baseline gap-1 rounded-lg border border-border bg-background px-2.5 py-1 shadow-sm">
                <span className="text-lg font-semibold tabular-nums">
                  {Math.round(analysis.score)}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </span>
            }
          >
            <CategoryDetail categoryKey={key} analysis={analysis} page={page} />
          </SectionCard>
        );
      })}

      {/* ---------- UI/UX (unweighted) ---------- */}
      {uiux === null ? null : <UiuxSection analysis={uiux} />}

      {/* ---------- Keyword demand ---------- */}
      <SectionCard
        id="keywords"
        eyebrow="Benchmark"
        title="Keyword demand"
        description="How many people search for the terms this page is competing on, and what a click is worth."
      >
        <KeywordTable report={report} />
      </SectionCard>

      {/* ---------- Competitors ---------- */}
      <SectionCard
        id="competitors"
        eyebrow="Benchmark"
        title="Who outranks you"
        description="The pages currently taking the top results for your primary keyword, measured on the same axes as this audit."
      >
        <CompetitorTable report={report} />
      </SectionCard>

      {/* ---------- Screenshots ---------- */}
      <SectionCard
        id="screenshots"
        eyebrow="Visual comparison"
        title="Screenshots"
        description="What a visitor actually sees on mobile, next to the competition."
      >
        {hasScreenshots ? (
          <ScreenshotCompare screenshots={report.screenshots} siteHost={host} />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-sm leading-relaxed text-muted-foreground">
            Screenshots could not be captured for this page — usually a slow or
            blocked load in the headless browser. Run the audit again to retry
            the visual capture.
          </p>
        )}
      </SectionCard>

      {/* ---------- Methodology ---------- */}
      <SectionCard
        id="methodology"
        eyebrow="Appendix"
        title="How this report was produced"
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Deterministic, not generated</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                Category scores and the overall grade are calculated in code
                from the collected evidence — no model touches the numbers.
              </li>
              <li className="flex gap-2">
                <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                Core Web Vitals come from a fresh Lighthouse run; domain
                authority from Open PageRank; crawlability from live
                robots.txt, sitemap and link checks.
              </li>
              <li className="flex gap-2">
                <FileText aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                Only the E-E-A-T sub-score (30 of 100 content points), the
                executive summary and the screenshot review involve a language
                model.
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Weights</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {CATEGORY_ORDER.map((key) => (
                <li key={key} className="flex items-center justify-between gap-4">
                  <span>{CATEGORY_META[key].label}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {Math.round(CATEGORY_WEIGHT[key] * 100)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Weights follow the published methodology. UI/UX findings are
              advisory and are not part of the weighted score.
            </p>
          </div>
        </div>

        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          Generated by Rostify on {formatAuditedAt(report.meta.audited_at)} for{" "}
          {report.meta.url}
        </p>
      </SectionCard>
    </article>
  );
}
