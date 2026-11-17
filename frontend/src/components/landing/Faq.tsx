import { ChevronDown } from "lucide-react";

import { Container, Eyebrow } from "./primitives";

const FAQS = [
  {
    question: "How does Rostify’s crawler differ from Ahrefs or Semrush?",
    answer:
      "Traditional tools rely heavily on delayed static index caches. Rostify operates an on-demand, headless Chrome rendering cluster that executes client-side JavaScript, reacts to dynamic single-page applications (React, Next.js, Vue), and immediately unmasks rendering hurdles that Googlebot’s second-wave crawler experiences.",
  },
  {
    question: "Will the Rostify crawler stress my production server?",
    answer:
      "No. Rostify features intelligent adaptive throttling. Our bots respect robots.txt crawl delays, observe server latency feedback, and automatically scale down concurrency if TTFB exceeds 300ms, ensuring safety for live production traffic.",
  },
  {
    question: "How often are algorithms and Google Core updates updated?",
    answer:
      "Our intelligence ruleset updates weekly based on official Search Central documentation, patent disclosures, and real-time rank volatility tracking across 1.4 million tracked SERP queries.",
  },
  {
    question: "Can I invite my dev team and export white-label reports?",
    answer:
      "Yes. All Pro and Enterprise plans allow unlimited team member seats. Agency plans also include fully customizable PDF and web-based audits with your custom agency logo, colors, and vanity domain links.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="w-full scroll-mt-24 py-14">
      <Container className="max-w-4xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <Eyebrow className="mb-1">Answers &amp; technical clarifications</Eyebrow>
          <h2 className="font-display text-[28px] leading-[36px] tracking-tight text-bone sm:text-[40px] sm:leading-[48px]">
            Frequently asked questions
          </h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, index) => (
            <details
              key={faq.question}
              open={index === 0}
              className="group rounded-xl bg-ink-low p-4 transition-colors open:bg-ink-card"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-bone [&::-webkit-details-marker]:hidden">
                {faq.question}
                <ChevronDown
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-clay transition-transform group-open:rotate-180 group-open:text-ember"
                />
              </summary>
              <p className="mt-2 text-[15px] leading-relaxed text-clay">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
