import type {
  CategoryAnalysis,
  CategoryKey,
  PageSnapshot,
} from "@rostify/shared";
import { Check, CheckCircle2, CircleSlash, Minus, X } from "lucide-react";

import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  humanize,
  sortFindings,
} from "@/lib/report";
import { cn } from "@/lib/utils";

import { CwvGauges } from "./CwvGauges";
import { FindingCard } from "./FindingCard";

/* ---------- Small building blocks ---------- */

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function CheckRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: boolean | null;
  detail?: string;
}) {
  const icon =
    state === null ? (
      <Minus aria-hidden className="h-4 w-4 text-muted-foreground" />
    ) : state ? (
      <Check aria-hidden className="h-4 w-4 text-emerald-600" />
    ) : (
      <X aria-hidden className="h-4 w-4 text-red-600" />
    );

  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{label}</p>
        {detail ? (
          <p className="mt-0.5 break-words text-[11px] leading-snug text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SubscoreBars({
  scores,
  parts,
}: {
  scores: Record<string, unknown>;
  parts: { key: string; label: string; max: number }[];
}) {
  return (
    <div className="space-y-2.5">
      {parts.map((part) => {
        const raw = asNumber(scores[part.key]);
        if (raw === null) return null;
        const pct = Math.max(0, Math.min(100, (raw / part.max) * 100));
        const bar =
          pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
        return (
          <div key={part.key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs text-muted-foreground">
              {part.label}
            </span>
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full", bar)}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {raw % 1 === 0 ? raw : raw.toFixed(1)}/{part.max}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Category-specific evidence blocks ---------- */

function TechnicalChecks({ metrics }: { metrics: Record<string, unknown> }) {
  const redirects = asNumber(metrics.redirectCount);
  const broken = asNumber(metrics.brokenLinksFound);
  const checked = asNumber(metrics.brokenLinksChecked);
  const ratio = asNumber(metrics.brokenRatio);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <CheckRow
        label="robots.txt found and crawlable"
        state={asBoolean(metrics.robotsExists)}
        detail={
          asBoolean(metrics.robotsValid)
            ? "File parses correctly."
            : "File is missing or blocks the crawler."
        }
      />
      <CheckRow
        label="XML sitemap present"
        state={asBoolean(metrics.sitemapExists)}
        detail={
          asBoolean(metrics.sitemapValid)
            ? "Sitemap is valid XML."
            : "No valid sitemap was found."
        }
      />
      <CheckRow
        label="Self-referencing canonical"
        state={asBoolean(metrics.canonicalIsSelf)}
        detail={
          asBoolean(metrics.canonicalIsSelf)
            ? "Canonical points at this URL."
            : "Canonical is missing or points elsewhere."
        }
      />
      <CheckRow
        label="Page is indexable"
        state={asBoolean(metrics.noindex) === null ? null : !asBoolean(metrics.noindex)}
        detail={
          asBoolean(metrics.noindex)
            ? "A noindex directive is blocking search engines."
            : "No noindex directive."
        }
      />
      <CheckRow
        label="Served over HTTPS"
        state={asBoolean(metrics.isHttps)}
        detail={asBoolean(metrics.isHttps) ? "Secure connection." : "Plain HTTP."}
      />
      <CheckRow
        label="No meta-refresh redirect"
        state={
          asBoolean(metrics.metaRefresh) === null
            ? null
            : !asBoolean(metrics.metaRefresh)
        }
        detail={
          asBoolean(metrics.metaRefresh)
            ? "A meta refresh will be treated as a soft redirect."
            : "None detected."
        }
      />
      <CheckRow
        label={`Redirect chain${redirects === 1 ? "" : "s"}: ${redirects ?? "—"}`}
        state={redirects === null ? null : redirects === 0}
        detail={
          redirects === 0
            ? "The URL resolves in a single hop."
            : "Every extra hop costs crawl budget and dilutes link equity."
        }
      />
      <CheckRow
        label={`Broken links: ${broken ?? 0} of ${checked ?? 0} checked`}
        state={broken === null || checked === null ? null : broken === 0}
        detail={
          ratio === null
            ? undefined
            : `${(ratio * 100).toFixed(1)}% of sampled links return an error.`
        }
      />
    </div>
  );
}

const ONPAGE_PARTS = [
  { key: "title", label: "Title tag", max: 25 },
  { key: "meta", label: "Meta description", max: 15 },
  { key: "h1", label: "H1", max: 20 },
  { key: "hierarchy", label: "Heading hierarchy", max: 15 },
  { key: "internalLinks", label: "Internal links", max: 15 },
  { key: "url", label: "URL structure", max: 10 },
];

function SerpPreview({ page }: { page: PageSnapshot | null }) {
  if (page === null) return null;

  const site = (() => {
    try {
      const url = new URL(page.url);
      return { host: url.host.replace(/^www\./, ""), path: url.pathname };
    } catch {
      return { host: page.url, path: "" };
    }
  })();

  const title = page.title.trim();
  const description = page.metaDescription.trim();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        How this page appears in a Google result
      </p>

      <div className="rounded-lg border border-border/70 bg-background p-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold uppercase text-muted-foreground"
          >
            {site.host.charAt(0) === "" ? "?" : site.host.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium leading-tight text-foreground/80">
              {site.host}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {site.host}
              <span className="text-muted-foreground/70">{site.path}</span>
            </p>
          </div>
        </div>

        <p className="mt-2.5 line-clamp-2 text-lg leading-snug text-[#1a0dab]">
          {title === "" ? "(no title tag)" : title}
        </p>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">
          {description === ""
            ? "(no meta description — Google will write its own snippet)"
            : description}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span
          className={title.length > 60 ? "text-amber-600" : "text-muted-foreground"}
        >
          Title {title.length} chars · target 50–60
        </span>
        <span
          className={
            description.length > 160 ? "text-amber-600" : "text-muted-foreground"
          }
        >
          Description {description.length} chars · target 150–160
        </span>
      </div>
    </div>
  );
}

const CONTENT_PARTS = [
  { key: "wordCount", label: "Content depth", max: 25 },
  { key: "keywordPlacement", label: "Keyword placement", max: 10 },
  { key: "duplicateAvoidance", label: "Originality", max: 10 },
  { key: "freshness", label: "Freshness", max: 10 },
  { key: "completeness", label: "Completeness", max: 15 },
];

function ContentComposition({ analysis }: { analysis: CategoryAnalysis }) {
  const subscores = asRecord(analysis.metrics.subscores) ?? {};
  const eeat = asNumber(analysis.metrics.eeatScore);
  const merged: Record<string, unknown> = { ...subscores };
  if (eeat !== null) merged.eeatScore = eeat;

  return (
    <SubscoreBars
      scores={merged}
      parts={[...CONTENT_PARTS, { key: "eeatScore", label: "E-E-A-T (AI)", max: 30 }]}
    />
  );
}

function ContentGaps({ metrics }: { metrics: Record<string, unknown> }) {
  const gaps = asArray(metrics.contentGaps)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  if (gaps.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Topics competitors cover that you do not
      </p>
      <ul className="space-y-3">
        {gaps.map((gap, index) => (
          <li key={`${asString(gap.topic) ?? index}`} className="text-sm">
            <p className="font-medium">{asString(gap.topic) ?? humanize(`gap ${index + 1}`)}</p>
            {asString(gap.why) ? (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {asString(gap.why)}
              </p>
            ) : null}
            {asStringArray(gap.seenOn).length > 0 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Seen on: {asStringArray(gap.seenOn).join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PerformanceExtras({ metrics }: { metrics: Record<string, unknown> }) {
  const stats: { label: string; value: string; hint?: string }[] = [];

  const fcp = asNumber(metrics.fcp_seconds);
  if (fcp !== null) stats.push({ label: "FCP", value: `${fcp.toFixed(2)}s`, hint: "First Contentful Paint" });
  const tbt = asNumber(metrics.tbt_ms);
  if (tbt !== null) stats.push({ label: "TBT", value: `${tbt}ms`, hint: "Total Blocking Time" });
  const si = asNumber(metrics.speed_index_seconds);
  if (si !== null) stats.push({ label: "Speed Index", value: `${si.toFixed(2)}s`, hint: "Visual load speed" });

  const source = asString(metrics.inp_source);
  if (source !== null) stats.push({ label: "INP source", value: source, hint: "Measured field or TBT proxy" });

  const reason = asString(metrics.reason);
  if (stats.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
        Lighthouse could not be measured for this run
        {reason ? `: ${reason}` : "."}
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {stats.map((stat) => (
        <Stat key={stat.label} {...stat} />
      ))}
    </div>
  );
}

function AuthorityBars({ metrics }: { metrics: Record<string, unknown> }) {
  const domains = asArray(metrics.domains)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);

  if (domains.length === 0) return null;
  const max = Math.max(10, ...domains.map((entry) => asNumber(entry.da) ?? 0));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Domain authority (Open PageRank, 0–10)
      </p>
      <div className="space-y-2.5">
        {domains.map((entry, index) => {
          const da = asNumber(entry.da) ?? 0;
          const isTarget = index === 0;
          return (
            <div key={`${asString(entry.url) ?? index}`} className="flex items-center gap-3">
              <span
                className={cn(
                  "w-44 shrink-0 truncate text-xs",
                  isTarget ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {asString(entry.url) ?? `domain ${index + 1}`}
                {isTarget ? " (you)" : ""}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    isTarget ? "bg-primary" : "bg-slate-300",
                  )}
                  style={{ width: `${Math.min(100, (da / max) * 100)}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
                {da}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AiChecklist({ metrics }: { metrics: Record<string, unknown> }) {
  const blockedBots = asStringArray(metrics.blockedBots);
  const schemaTypes = asStringArray(metrics.schemaTypes);
  const richTypes = asStringArray(metrics.richResultTypes);
  const llmsUrl = asString(metrics.llmsTxtUrl);

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <CheckRow
        label="JSON-LD structured data"
        state={asBoolean(metrics.hasJsonLd)}
        detail={
          schemaTypes.length > 0
            ? `Detected: ${schemaTypes.slice(0, 6).join(", ")}`
            : "No schema types could be parsed."
        }
      />
      <CheckRow
        label="Schema is valid"
        state={asBoolean(metrics.schemaValid)}
        detail="Valid schema is what earns rich results."
      />
      <CheckRow
        label="llms.txt published"
        state={asBoolean(metrics.hasLlmsTxt)}
        detail={llmsUrl ?? "A machine-readable summary for AI assistants."}
      />
      <CheckRow
        label="AI crawlers allowed in robots.txt"
        state={blockedBots.length === 0}
        detail={
          blockedBots.length === 0
            ? "No known AI crawler is blocked."
            : `Blocked: ${blockedBots.join(", ")}`
        }
      />
      <CheckRow
        label="Rich-result eligible"
        state={richTypes.length > 0}
        detail={
          richTypes.length > 0 ? richTypes.join(", ") : "None of the rich-result types were found."
        }
      />
    </div>
  );
}

/* ---------- Category body ---------- */

type CategoryDetailProps = {
  categoryKey: CategoryKey;
  analysis: CategoryAnalysis;
  page: PageSnapshot | null;
};

export function CategoryDetail({ categoryKey, analysis, page }: CategoryDetailProps) {
  const metrics = analysis.metrics;
  const findings = sortFindings(analysis.findings);

  return (
    <div className="space-y-5">
      {categoryKey === "technical" ? <TechnicalChecks metrics={metrics} /> : null}

      {categoryKey === "onpage" ? (
        <>
          <SerpPreview page={page} />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                What earned the points
              </p>
              <SubscoreBars
                scores={asRecord(metrics.subscores) ?? {}}
                parts={ONPAGE_PARTS}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat label="Primary keyword" value={asString(metrics.primaryKeyword) ?? "—"} />
              <Stat label="Title length" value={`${asNumber(metrics.titleLength) ?? 0} chars`} hint="Target 50–60" />
              <Stat label="Meta length" value={`${asNumber(metrics.metaLength) ?? 0} chars`} hint="Target 150–160" />
              <Stat
                label="Headings"
                value={`H1 ${asNumber(metrics.h1Count) ?? 0} · H2 ${asNumber(metrics.h2Count) ?? 0} · H3 ${asNumber(metrics.h3Count) ?? 0}`}
              />
              <Stat
                label="Internal links"
                value={`${asNumber(metrics.internalLinkCount) ?? 0}`}
                hint="Links to other pages on the site"
              />
              <Stat
                label="URL depth"
                value={`${asNumber(metrics.urlDepth) ?? 0}`}
                hint="Path segments below the domain"
              />
            </div>
          </div>
        </>
      ) : null}

      {categoryKey === "content" ? (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label="Word count" value={`${asNumber(metrics.wordCount) ?? 0}`} hint="Target 1,000+" />
            <Stat label="E-E-A-T (AI)" value={`${asNumber(metrics.eeatScore) ?? 0}/30`} />
            <Stat label="Max duplication" value={`${asNumber(metrics.maxJaccard) ?? 0}`} hint="Jaccard vs competitors" />
            <Stat
              label="Copyright year"
              value={`${asNumber(metrics.copyrightYear) ?? "—"}`}
              hint="Freshness signal"
            />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              How the 100 points are built
            </p>
            <ContentComposition analysis={analysis} />
          </div>
          <ContentGaps metrics={metrics} />
        </>
      ) : null}

      {categoryKey === "performance" ? (
        <>
          <CwvGauges metrics={metrics} />
          <PerformanceExtras metrics={metrics} />
        </>
      ) : null}

      {categoryKey === "offpage" ? <AuthorityBars metrics={metrics} /> : null}

      {categoryKey === "ai_readiness" ? <AiChecklist metrics={metrics} /> : null}

      {findings.length > 0 ? (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <CircleSlash aria-hidden className="h-4 w-4" />
            {findings.length} finding{findings.length === 1 ? "" : "s"}
          </h3>
          <div className="space-y-3">
            {findings.map((finding, index) => (
              <FindingCard
                key={`${finding.category}-${index}`}
                finding={finding}
                showCategory={false}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0" />
          No issues were detected in this category. Keep it this way.
        </p>
      )}
    </div>
  );
}
