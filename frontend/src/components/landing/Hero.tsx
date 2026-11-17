import {
  ArrowRight,
  ArrowUpRight,
  Gauge,
  LineChart,
  Lock,
  Play,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import Image from "next/image";

import { Container } from "./primitives";

const TRUST = [
  { icon: Zap, label: "Instant 60-second crawl", accent: false },
  { icon: Star, label: "4.9/5 from 1,200+ founders", accent: true },
];

const METRICS = [
  {
    label: "Technical Foundation",
    score: "98/100",
    detail:
      "0 indexation blockers • Canonical tags verified • XML sitemap pristine",
    bar: "w-[98%] bg-emerald-400",
    chip: "text-emerald-400 bg-emerald-500/10",
  },
  {
    label: "On-Page Architecture",
    score: "91/100",
    detail: "H1–H3 structural coherence • OpenGraph & Twitter cards compliant",
    bar: "w-[91%] bg-ember",
    chip: "text-ember bg-ember/20",
  },
  {
    label: "Semantic Intent & AI Readability",
    score: "96/100",
    detail: "Deep topical coverage • Zero keyword cannibalization detected",
    bar: "w-[96%] bg-emerald-400",
    chip: "text-emerald-400 bg-emerald-500/10",
  },
  {
    label: "Backlink Authority & Domain Trust",
    score: "87/100",
    detail: "342 high-authority referring domains • Toxic anchor ratios < 0.4%",
    bar: "w-[87%] bg-mist/70",
    chip: "text-bone bg-ink-highest",
  },
];

const HIGHLIGHTS = [
  {
    icon: Timer,
    tone: "text-ember",
    title: "Instant SEO analysis",
    body: "Deep crawling and indexing audit delivered within 60 seconds with AI precision.",
  },
  {
    icon: LineChart,
    tone: "text-ember-soft",
    title: "Actionable insights",
    body: "Prioritized, high-leverage issues ranked systematically by revenue and rank impact.",
  },
  {
    icon: Wrench,
    tone: "text-mist",
    title: "Easy optimization",
    body: "Automated meta descriptions, structured schema snippets, and dev-ready fixes.",
  },
  {
    icon: TrendingUp,
    tone: "text-emerald-400",
    title: "Grow organically",
    body: "Build sustainable, compounding first-page keyword velocity backed by verified search data.",
  },
];

function DashboardMock() {
  return (
    <div className="relative mt-14 w-full max-w-5xl">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 rounded-full bg-ember/10 blur-3xl"
      />

      {/* Floating traffic card */}
      <div className="absolute -left-8 -top-6 z-20 hidden w-64 -rotate-2 flex-col rounded-xl bg-ink-high/90 p-4 text-left shadow-xl backdrop-blur-xl transition-transform duration-300 hover:rotate-0 lg:flex">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.12em] text-clay">
            Search velocity
          </span>
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-400">
            +142.8%
          </span>
        </div>
        <div className="mb-1 font-display text-[22px] leading-tight text-bone">
          48,910{" "}
          <span className="font-sans text-[13px] font-normal text-clay">
            clicks/mo
          </span>
        </div>
        <svg
          viewBox="0 0 200 40"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden
          className="h-10 w-full text-emerald-400"
        >
          <path
            d="M0,35 Q30,30 60,25 T120,15 T160,8 L200,4"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M0,35 Q30,30 60,25 T120,15 T160,8 L200,4 L200,40 L0,40 Z"
            fill="currentColor"
            fillOpacity="0.12"
          />
        </svg>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-clay">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          30-day algorithmic momentum
        </div>
      </div>

      {/* Floating crawl depth card */}
      <div className="absolute -right-6 top-1/3 z-20 hidden w-60 rotate-2 flex-col rounded-xl bg-ink-high/90 p-4 text-left shadow-xl backdrop-blur-xl transition-transform duration-300 hover:rotate-0 lg:flex">
        <div className="mb-1 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember/20 text-ember">
            <Gauge aria-hidden className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[11px] text-clay">Live crawl depth</div>
            <div className="text-sm font-semibold text-bone">12,480+ pages</div>
          </div>
        </div>
        <div className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-lowest">
          <div className="h-full w-[94%] rounded-full bg-ember" />
        </div>
        <div className="flex justify-between text-[11px] text-clay">
          <span>Latency: 4.2s</span>
          <span className="text-ember">100% inspected</span>
        </div>
      </div>

      {/* Main glass screen */}
      <div className="relative z-10 w-full rounded-2xl bg-ink-low/95 p-4 text-left shadow-2xl backdrop-blur-2xl sm:p-6">
        <div className="-mx-4 -mt-4 mb-4 flex items-center justify-between rounded-t-2xl bg-ink-card/40 px-4 pb-4 pt-2 sm:-mx-6 sm:-mt-6 sm:px-6">
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-red-900" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-ink-lowest px-4 py-1 text-[13px] text-clay sm:inline-flex">
            <Lock aria-hidden className="h-3.5 w-3.5 text-emerald-400" />
            https://rostify.dev/audit/report-09x8
          </div>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
            Audit complete
          </span>
        </div>

        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-12">
          <div className="flex flex-col items-center justify-center rounded-xl bg-ink-card p-4 text-center md:col-span-4">
            <span className="mb-1 text-[11px] uppercase tracking-[0.12em] text-clay">
              Global search health
            </span>
            <div className="relative my-2 flex h-36 w-36 items-center justify-center">
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke="#2a2a2a"
                  strokeWidth="9"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="transparent"
                  stroke="#f97316"
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray="314.159"
                  strokeDashoffset="18.8"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[40px] font-bold leading-none text-bone">
                  94
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-ember">
                  Grade A+
                </span>
              </div>
            </div>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-clay">
              Top 3% percentile for search architecture across SaaS benchmarks.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:col-span-8">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl bg-ink-card p-4 transition-colors hover:bg-ink-high"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-bone">
                    {metric.label}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${metric.chip}`}
                  >
                    {metric.score}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed text-clay">
                  {metric.detail}
                </div>
                <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-lowest">
                  <div className={`h-full ${metric.bar}`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start justify-between gap-2 rounded-xl bg-gradient-to-r from-ink-card via-ink-high to-ink-card p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ember/20 text-ember">
              <Sparkles aria-hidden className="h-4 w-4" />
            </span>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ember">
                AI high impact discovery
              </span>
              <p className="text-[13px] leading-relaxed text-bone">
                Add Schema{" "}
                <code className="rounded bg-ink-lowest px-1.5 py-0.5 font-mono text-[12px] text-ember">
                  SoftwareApplication
                </code>{" "}
                markup to pricing cards for estimated{" "}
                <span className="font-semibold text-emerald-400">
                  +18.4% SERP CTR
                </span>{" "}
                boost.
              </p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-ink-lowest px-4 py-1.5 text-[11px] text-bone">
            Apply fix
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <div id="top" className="relative isolate">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src="/hero-alpine.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="scale-[1.01] object-cover object-[center_top_15%] brightness-[0.92] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/90 via-ink/60 to-ink" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.12)_0%,transparent_65%)]"
          />
        </div>

        <Container className="relative z-10 flex flex-col items-center pb-20 pt-32 text-center sm:pb-28 sm:pt-40">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-ink-highest/80 px-4 py-1 shadow-sm backdrop-blur-md transition-colors hover:bg-ink-bright">
            <span className="h-2 w-2 animate-pulse rounded-full bg-ember shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-bone">
              AI-powered SEO audit tool
            </span>
            <span className="text-[11px] text-clay">•</span>
            <span className="text-[11px] font-medium text-ember">
              v2.4 live engine
            </span>
          </div>

          <h1 className="mb-4 max-w-4xl font-display text-[36px] leading-[44px] tracking-tight text-bone sm:text-[68px] sm:leading-[76px]">
            Get your website{" "}
            <span className="whitespace-nowrap italic text-ember drop-shadow-[0_0_24px_rgba(249,115,22,0.35)]">
              SEO-Ready
            </span>{" "}
            with Rostify
          </h1>

          <p className="mb-10 max-w-2xl text-[17px] leading-relaxed text-clay sm:text-lg">
            Analyze. Optimize. Grow. Rostify helps high-growth startups and
            product teams find deep indexation flaws, dominate SERPs, and unlock
            explosive organic velocity.
          </p>

          <div className="mb-4 flex w-full max-w-md flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#audit-preview"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ember px-10 py-4 text-sm font-semibold text-ember-ink shadow-[0_0_24px_rgba(249,115,22,0.35)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_36px_rgba(249,115,22,0.55)] active:scale-[0.98] sm:w-auto"
            >
              Run free SEO audit
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink-card/60 px-6 py-4 text-sm font-semibold text-bone shadow-sm backdrop-blur-md transition-colors hover:bg-ink-high sm:w-auto"
            >
              <Play aria-hidden className="h-4 w-4 fill-ember text-ember" />
              Watch 2-min demo
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-clay">
            {TRUST.map(({ icon: Icon, label, accent }, index) => (
              <span key={label} className="inline-flex items-center gap-2">
                {index === 0 ? null : <span className="text-ink-high">•</span>}
                <span
                  className={
                    accent
                      ? "inline-flex items-center gap-1 font-medium text-bone"
                      : "inline-flex items-center gap-1"
                  }
                >
                  <Icon
                    aria-hidden
                    className={
                      accent
                        ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                        : "h-3.5 w-3.5 text-ember"
                    }
                  />
                  {label}
                </span>
              </span>
            ))}
            <span className="inline-flex items-center gap-2">
              <span className="text-ink-high">•</span>
              No credit card required
            </span>
          </div>

          <DashboardMock />
        </Container>
      </section>

      {/* Highlight strip, overlapping the hero */}
      <section className="relative z-20 -mt-8 w-full sm:-mt-12">
        <Container>
          <div className="grid grid-cols-1 gap-4 rounded-2xl bg-ink-card/95 p-6 shadow-xl backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map(({ icon: Icon, tone, title, body }) => (
              <div key={title} className="flex items-start gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-high text-ember">
                  <Icon aria-hidden className={`h-[22px] w-[22px] ${tone}`} />
                </div>
                <div>
                  <div className="mb-0.5 text-sm font-semibold text-bone">
                    {title}
                  </div>
                  <div className="text-[13px] leading-relaxed text-clay">
                    {body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>
    </div>
  );
}
