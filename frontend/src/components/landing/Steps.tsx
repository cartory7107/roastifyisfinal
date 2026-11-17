import { ArrowRight, Brain, MousePointerClick, Rocket } from "lucide-react";

import { Container, Eyebrow } from "./primitives";

const STEPS = [
  {
    number: "01",
    icon: MousePointerClick,
    title: "Enter URL & keywords",
    body: "Simply submit your web application address. Rostify instantaneously dispatches multi-region crawlers simulating Googlebot and Bingbot.",
    footnote: "No tracking code install required",
  },
  {
    number: "02",
    icon: Brain,
    title: "AI runs 140+ deep checks",
    body: "Evaluates server response times, Core Web Vitals, JSON-LD schemas, orphan routing paths, and semantic relevance against top search peers.",
    footnote: "Comprehensive report in 60s",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Execute prioritized fixes",
    body: "Follow prioritized developer recipes and auto-generated copy enhancements. Track your organic traffic climb in real time.",
    footnote: "Accelerate search rankings",
  },
];

export function Steps() {
  return (
    <section id="how-it-works" className="w-full scroll-mt-24 py-14">
      <Container>
        <div className="mb-10 flex flex-col items-center text-center">
          <Eyebrow className="mb-1">Algorithmic simplicity</Eyebrow>
          <h2 className="max-w-2xl font-display text-[28px] leading-[36px] tracking-tight text-bone sm:text-[40px] sm:leading-[48px]">
            From URL submission to first-page dominance in 3 steps
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map(({ number, icon: Icon, title, body, footnote }) => (
            <div
              key={number}
              className="flex flex-col justify-between rounded-2xl bg-ink-low p-6 shadow-sm transition-colors hover:bg-ink-card sm:p-8"
            >
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-display text-[40px] font-bold leading-none text-ember">
                    {number}
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-high text-bone">
                    <Icon aria-hidden className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="mb-1 text-[22px] font-medium leading-[30px] text-bone">
                  {title}
                </h3>
                <p className="text-[15px] leading-relaxed text-clay">{body}</p>
              </div>
              <div className="mt-6 pt-4">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ember">
                  {footnote}
                  <ArrowRight aria-hidden className="h-3 w-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
