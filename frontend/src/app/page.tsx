import { BarChart3, Clock, FileDown, Search, ShieldCheck, Sparkles } from "lucide-react";

import { UrlForm } from "@/components/UrlForm";

const highlights = [
  {
    icon: Search,
    title: "Niche + competitors",
    body: "We detect what the site sells, then pull the two pages currently outranking it for the main keyword.",
  },
  {
    icon: BarChart3,
    title: "Six categories",
    body: "Technical, on-page, content, performance, off-page and AI readiness — each scored out of 100 with evidence.",
  },
  {
    icon: Sparkles,
    title: "One score, one PDF",
    body: "A weighted, deterministic score with an executive summary and three fixes worth doing first.",
  },
];

const facts = [
  { icon: Clock, label: "About 2 minutes" },
  { icon: ShieldCheck, label: "No signup" },
  { icon: FileDown, label: "PDF included" },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(243_75%_59%/0.12),transparent_70%)]"
      />

      <div className="container flex min-h-screen flex-col items-center justify-center py-16">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Autonomous multi-agent audit
        </span>

        <h1 className="max-w-3xl text-center text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Instant AI Website Audit
        </h1>
        <p className="mt-5 max-w-xl text-center text-base leading-relaxed text-muted-foreground sm:text-lg">
          A six-category audit and competitor comparison in about two minutes —
          scored from measured data, explained in plain English, ready to send.
        </p>

        <div className="mt-10 w-full max-w-2xl">
          <UrlForm />
        </div>

        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          {facts.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5">
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {label}
            </li>
          ))}
        </ul>

        <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-5 text-left shadow-sm"
            >
              <Icon aria-hidden className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-12 max-w-2xl border-t border-border pt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Scores and grades are computed in code from the collected evidence —
          robots.txt, sitemap, live Core Web Vitals, domain authority and
          structured data. A language model only writes the E-E-A-T judgement,
          the executive summary and the screenshot review.
        </p>
      </div>
    </main>
  );
}
