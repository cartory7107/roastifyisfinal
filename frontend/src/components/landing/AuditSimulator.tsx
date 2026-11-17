"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Globe,
  KeyRound,
  Loader2,
  Users,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { runAudit } from "@/lib/api";
import { cn } from "@/lib/utils";

import { Container, Eyebrow } from "./primitives";

type TabKey = "issues" | "perf" | "competitors" | "keywords";

const TABS: { key: TabKey; label: string; icon: typeof AlertTriangle }[] = [
  { key: "issues", label: "Issues detected (3)", icon: AlertTriangle },
  { key: "perf", label: "Performance (99ms)", icon: Gauge },
  { key: "competitors", label: "Top competitors", icon: Users },
  { key: "keywords", label: "Keyword opportunities", icon: KeyRound },
];

const ISSUES = [
  {
    icon: AlertCircle,
    tone: "text-ember",
    title: "Multiple <H1> tags detected on root hero template",
    body: "Search engines favor a single, definitive H1 entity for indexation parsing.",
    tag: "High impact",
    chip: "bg-ember/20 text-ember",
  },
  {
    icon: AlertTriangle,
    tone: "text-amber-400",
    title: "Uncompressed hero PNG banner creates 480ms LCP delay",
    body: "Compress to next-gen AVIF/WebP to gain +8 points in mobile page experience.",
    tag: "Medium",
    chip: "bg-amber-500/20 text-amber-300",
  },
  {
    icon: CheckCircle2,
    tone: "text-emerald-400",
    title: "Valid structured Schema.org JSON-LD graph",
    body: "Organization and breadcrumb nodes parse cleanly with no syntax faults.",
    tag: "Healthy",
    chip: "bg-emerald-500/20 text-emerald-400",
  },
];

const PERF = [
  { label: "TTFB (server response)", value: "99ms", note: "Edge cached globally" },
  { label: "Largest Contentful Paint", value: "1.2s", note: "Within Good (2.5s)" },
  { label: "Cumulative Layout Shift", value: "0.01", note: "Zero visual disruption" },
];

const COMPETITORS = [
  {
    rank: "#1",
    domain: "checkout-flow.com",
    detail: "Shared keywords: 1,420 • Domain authority: 74",
    overlap: "240 backlink overlap",
    tone: "text-ember",
  },
  {
    rank: "#2",
    domain: "payengine.dev",
    detail: "Shared keywords: 980 • Domain authority: 69",
    overlap: "180 backlink overlap",
    tone: "text-bone",
  },
];

const KEYWORDS = [
  {
    keyword: '"developer payment infrastructure"',
    detail: "Search volume: 14,200/mo • Difficulty: 44 (Medium)",
    gain: "+3.8k traffic potential",
  },
  {
    keyword: '"automated billing api python"',
    detail: "Search volume: 8,900/mo • Difficulty: 31 (Low)",
    gain: "+2.1k traffic potential",
  },
];

export function AuditSimulator() {
  const router = useRouter();
  const [tab, setTab] = React.useState<TabKey>("issues");
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    let normalized = url.trim();
    if (normalized === "") {
      setError("Enter a domain, e.g. acme.com");
      return;
    }
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

    try {
      new URL(normalized);
    } catch {
      setError("Enter a valid domain, e.g. acme.com");
      return;
    }

    setPending(true);
    try {
      const { auditId } = await runAudit(normalized);
      router.push(`/audit/${auditId}`);
    } catch (err) {
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : "Something went wrong. Try again.";
      setError(message);
      setPending(false);
    }
  }

  return (
    <section id="audit-preview" className="w-full scroll-mt-24 py-14">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-ink-low p-6 shadow-2xl sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-ember/10 blur-3xl"
          />

          <div className="relative mx-auto mb-10 max-w-3xl text-center">
            <Eyebrow className="mb-1">Interactive simulator</Eyebrow>
            <h2 className="mb-1 font-display text-[28px] leading-[36px] tracking-tight text-bone sm:text-[40px] sm:leading-[48px]">
              Test your domain in real time
            </h2>
            <p className="text-[15px] leading-relaxed text-clay">
              Experience Rostify’s algorithmic speed. Inspect sample results or
              test your domain right now.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-ink-high p-1.5 shadow-inner sm:flex-row sm:rounded-full"
            >
              <div className="flex w-full items-center gap-2 px-4">
                <Globe aria-hidden className="h-5 w-5 shrink-0 text-clay" />
                <input
                  type="text"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="Enter your domain (e.g. acme.com)"
                  aria-label="Website domain"
                  className="w-full bg-transparent py-2 text-[15px] text-bone placeholder:text-clay/50 focus:outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full bg-ember px-10 py-2.5 text-sm font-semibold text-ember-ink shadow-md transition-colors hover:bg-ember/90 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {pending ? (
                  <>
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  <>
                    Audit now
                    <Zap aria-hidden className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {error === null ? null : (
              <p className="mt-2 text-[13px] text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="relative mb-4 flex flex-wrap items-center justify-center gap-2">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[11px] transition-all",
                  tab === key
                    ? "bg-ink-highest font-semibold text-ember"
                    : "bg-ink-card font-medium text-clay hover:text-bone",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-h-[220px] rounded-2xl bg-ink-card p-6">
            {tab === "issues" ? (
              <div className="space-y-2">
                {ISSUES.map((issue) => (
                  <div
                    key={issue.title}
                    className="flex items-start justify-between gap-3 rounded-xl bg-ink-high p-4"
                  >
                    <div className="flex items-start gap-2">
                      <issue.icon
                        aria-hidden
                        className={cn("mt-0.5 h-5 w-5 shrink-0", issue.tone)}
                      />
                      <div>
                        <div className="text-xs font-semibold text-bone">
                          {issue.title}
                        </div>
                        <div className="text-[13px] leading-relaxed text-clay">
                          {issue.body}
                        </div>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-1 text-[11px] font-medium",
                        issue.chip,
                      )}
                    >
                      {issue.tag}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "perf" ? (
              <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                {PERF.map((metric) => (
                  <div key={metric.label} className="rounded-xl bg-ink-high p-4">
                    <div className="text-[11px] text-clay">{metric.label}</div>
                    <div className="my-1 font-display text-[28px] font-bold leading-tight text-emerald-400">
                      {metric.value}
                    </div>
                    <div className="text-[13px] text-clay">{metric.note}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "competitors" ? (
              <div className="space-y-2">
                {COMPETITORS.map((competitor) => (
                  <div
                    key={competitor.domain}
                    className="flex items-center justify-between gap-3 rounded-xl bg-ink-high p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full bg-ink-card font-bold",
                          competitor.tone,
                        )}
                      >
                        {competitor.rank}
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-bone">
                          {competitor.domain}
                        </div>
                        <div className="text-[13px] text-clay">
                          {competitor.detail}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-clay">
                      {competitor.overlap}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {tab === "keywords" ? (
              <div className="space-y-2">
                {KEYWORDS.map((row) => (
                  <div
                    key={row.keyword}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ink-high p-4"
                  >
                    <div>
                      <div className="font-mono text-xs font-semibold text-bone">
                        {row.keyword}
                      </div>
                      <div className="text-[13px] text-clay">{row.detail}</div>
                    </div>
                    <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400">
                      {row.gain}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
