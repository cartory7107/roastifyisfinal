import { ArrowLeftRight, BellRing, RefreshCw, ScanSearch } from "lucide-react";

import { Container, Eyebrow } from "./primitives";

const CRAWL_ROWS = [
  {
    path: "/blog/vector-indexing",
    status: "200 OK • Canonical valid",
    dot: "bg-emerald-400",
    tone: "text-emerald-400",
  },
  {
    path: "/docs/v1/auth-legacy",
    status: "301 loop detected (3 hops)",
    dot: "bg-red-400",
    tone: "text-red-400",
  },
  {
    path: "/pricing?ref=banner",
    status: "Missing rel canonical",
    dot: "bg-amber-400",
    tone: "text-amber-300",
  },
];

const INTENT_BARS = [
  {
    label: "Your domain (Rostify)",
    value: "92% intent match",
    width: "w-[92%]",
    bar: "bg-ember",
    labelTone: "text-bone",
    valueTone: "text-ember",
  },
  {
    label: "Competitor A",
    value: "74% intent match",
    width: "w-[74%]",
    bar: "bg-ink-highest",
    labelTone: "text-clay",
    valueTone: "text-clay",
  },
  {
    label: "Competitor B",
    value: "61% intent match",
    width: "w-[61%]",
    bar: "bg-ink-highest",
    labelTone: "text-clay",
    valueTone: "text-clay",
  },
];

const SENTRY_ROWS = [
  { label: "Sitemap validation", value: "Zero errors", tone: "text-emerald-400" },
  { label: "Core Web Vitals LCP", value: "1.1s (passed)", tone: "text-emerald-400" },
  { label: "Slack dispatch", value: "Synced #growth-seo", tone: "text-ember" },
];

export function FeatureBento() {
  return (
    <section id="features" className="w-full scroll-mt-24 py-14">
      <Container>
        <div className="mb-10 flex flex-col items-center text-center">
          <Eyebrow className="mb-1">Engineered for technical mastery</Eyebrow>
          <h2 className="max-w-2xl font-display text-[28px] leading-[36px] tracking-tight text-bone sm:text-[40px] sm:leading-[48px]">
            Everything required to turn search into your most compounding
            channel
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Card 1 — crawler */}
          <div className="flex flex-col justify-between rounded-2xl bg-ink-low p-6 shadow-md lg:col-span-7 sm:p-8">
            <div>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-ember/20 text-ember">
                <ScanSearch aria-hidden className="h-[22px] w-[22px]" />
              </div>
              <Eyebrow>Autonomous infrastructure</Eyebrow>
              <h3 className="mt-1 text-[22px] font-medium leading-[30px] tracking-tight text-bone sm:text-[28px] sm:leading-[36px]">
                Intelligent AI site crawler
              </h3>
              <p className="mb-6 mt-1 max-w-xl text-[15px] leading-relaxed text-clay">
                Detect hidden crawling anomalies before search bots downgrade
                your indexation. Identifies redirect chains, canonical loops,
                orphan pages, and dynamic JavaScript rendering faults in real
                time.
              </p>
            </div>

            <div className="space-y-1 rounded-xl bg-ink-card p-4">
              {CRAWL_ROWS.map((row) => (
                <div
                  key={row.path}
                  className="flex items-center justify-between gap-3 rounded-lg bg-ink-high px-2 py-2 text-[13px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${row.dot}`} />
                    <span className="truncate font-mono text-[12px] text-bone">
                      {row.path}
                    </span>
                  </div>
                  <span className={`shrink-0 text-[11px] font-medium ${row.tone}`}>
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2 — intent */}
          <div className="flex flex-col justify-between rounded-2xl bg-ink-low p-6 shadow-md lg:col-span-5 sm:p-8">
            <div>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-mist/20 text-mist">
                <ArrowLeftRight aria-hidden className="h-[22px] w-[22px]" />
              </div>
              <Eyebrow className="text-mist">Competitive SERP graph</Eyebrow>
              <h3 className="mt-1 text-[22px] font-medium leading-[30px] tracking-tight text-bone sm:text-[28px] sm:leading-[36px]">
                Semantic &amp; intent auditing
              </h3>
              <p className="mb-6 mt-1 text-[15px] leading-relaxed text-clay">
                Benchmark content architecture directly against top 10 ranking
                search rivals. Extract high-intent topic clusters and fill
                content gaps automatically.
              </p>
            </div>

            <div className="space-y-3 rounded-xl bg-ink-card p-4">
              {INTENT_BARS.map((bar) => (
                <div key={bar.label}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className={bar.labelTone}>{bar.label}</span>
                    <span className={`font-semibold ${bar.valueTone}`}>
                      {bar.value}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-lowest">
                    <div className={`h-full rounded-full ${bar.bar} ${bar.width}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3 — sentinel */}
          <div className="flex flex-col items-center justify-between gap-6 rounded-2xl bg-ink-low p-6 shadow-md md:flex-row sm:p-8 lg:col-span-12">
            <div className="max-w-xl">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <BellRing aria-hidden className="h-[22px] w-[22px]" />
              </div>
              <Eyebrow className="text-emerald-400">Always-on sentry</Eyebrow>
              <h3 className="mt-1 text-[22px] font-medium leading-[30px] tracking-tight text-bone sm:text-[28px] sm:leading-[36px]">
                Automated rank &amp; health sentinel
              </h3>
              <p className="mt-1 text-[15px] leading-relaxed text-clay">
                Never wake up to dropped impressions after a deployment. Rostify
                runs scheduled synthetic crawls and instantly notifies
                engineering teams via Slack, webhooks, or Discord when core tags
                or robots.txt change unexpectedly.
              </p>
            </div>

            <div className="w-full shrink-0 rounded-xl bg-ink-card p-4 md:w-80">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                <RefreshCw aria-hidden className="h-4 w-4" />
                Automated daily crawl check
              </div>
              <div className="space-y-1">
                {SENTRY_ROWS.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 rounded bg-ink-high px-2 py-2 text-[13px] text-bone"
                  >
                    <span>{row.label}</span>
                    <span className={`text-[11px] font-medium ${row.tone}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
