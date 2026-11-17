import { Quote } from "lucide-react";

import { Container } from "./primitives";

const LOGOS = [
  { word: "VECTRA", className: "font-semibold tracking-wider" },
  { word: "SYNTHESIS", className: "font-bold tracking-tight" },
  { word: "KRONOS", className: "italic" },
  { word: "HYPERION", className: "font-medium tracking-widest" },
  { word: "NEXUS.IO", className: "font-bold tracking-tighter" },
  { word: "AURA LABS", className: "" },
];

/** Logo cloud plus a single testimonial pill. */
export function SocialProof() {
  return (
    <section className="w-full py-10">
      <Container className="flex flex-col items-center text-center">
        <p className="mb-6 max-w-xl text-[11px] uppercase tracking-widest text-clay">
          Trusted by technical search teams at rapid-growth startups
        </p>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
          {LOGOS.map((logo) => (
            <span
              key={logo.word}
              className={`font-display text-[22px] leading-tight text-bone ${logo.className}`}
            >
              {logo.word}
            </span>
          ))}
        </div>

        <figure className="flex max-w-2xl flex-col items-center gap-4 rounded-2xl bg-ink-low p-6 text-left shadow-sm sm:flex-row sm:p-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ember/20 text-ember">
            <Quote aria-hidden className="h-6 w-6" />
          </div>
          <div>
            <blockquote className="mb-2 text-[15px] italic leading-relaxed text-bone">
              “Rostify replaced three cumbersome SEO subscriptions and delivered
              10x more actionable crawl intelligence. We jumped 28 positions for
              high-intent SaaS keywords in under two weeks.”
            </blockquote>
            <figcaption className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold text-bone">Marcus Vance</span>
              <span className="text-clay">•</span>
              <span className="font-medium text-ember">
                Head of Growth, Synthesis AI
              </span>
            </figcaption>
          </div>
        </figure>
      </Container>
    </section>
  );
}
