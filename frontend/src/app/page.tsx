import { BarChart3, Search, Sparkles } from "lucide-react";
import { UrlForm } from "@/components/UrlForm";

const highlights = [
  {
    icon: Search,
    title: "Niche + competitors",
    body: "We detect what the site sells, then pull its two closest search rivals.",
  },
  {
    icon: BarChart3,
    title: "Six categories",
    body: "Technical, on-page, content, performance, off-page and AI readiness.",
  },
  {
    icon: Sparkles,
    title: "One score",
    body: "Weighted, deterministic scoring with an executive summary you can send.",
  },
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
        <p className="mt-5 max-w-xl text-center text-base text-muted-foreground sm:text-lg">
          6-category audit + competitor comparison in 2 minutes — scored,
          explained and ready as a PDF.
        </p>

        <div className="mt-10 w-full max-w-2xl">
          <UrlForm />
        </div>

        <div className="mt-16 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          {highlights.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-5 text-left shadow-sm"
            >
              <Icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-sm font-semibold">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
