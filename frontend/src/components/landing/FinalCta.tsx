import { ArrowRight, ScanSearch } from "lucide-react";
import Image from "next/image";

import { Container } from "./primitives";

/** Final cinematic CTA banner over a desaturated alpine backdrop. */
export function FinalCta() {
  return (
    <section className="w-full pb-14 pt-6">
      <Container>
        <div className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-ink-low px-6 py-16 text-center shadow-2xl sm:p-24">
          <div aria-hidden className="absolute inset-0 z-0 opacity-20">
            <Image
              src="/hero-alpine.png"
              alt=""
              fill
              sizes="(min-width: 1280px) 1200px, 100vw"
              className="object-cover grayscale"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-low via-ink-low/80 to-transparent" />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-ember/20 blur-3xl"
          />

          <div className="relative z-10 flex max-w-3xl flex-col items-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ember/20 text-ember shadow-inner">
              <ScanSearch aria-hidden className="h-7 w-7" />
            </div>
            <h2 className="mb-2 font-display text-[36px] leading-[44px] tracking-tight text-bone sm:text-[54px] sm:leading-[62px]">
              Ready to dominate the{" "}
              <span className="italic text-ember">search rankings?</span>
            </h2>
            <p className="mb-10 max-w-xl text-[17px] leading-relaxed text-bone/80 sm:text-lg">
              Join 15,000+ modern engineering and growth teams turning technical
              SEO into their highest ROI acquisition engine.
            </p>
            <a
              href="#audit-preview"
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ember px-10 py-4 text-sm font-semibold text-ember-ink shadow-[0_0_32px_rgba(249,115,22,0.45)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_48px_rgba(249,115,22,0.65)] active:scale-[0.98]"
            >
              Start your free audit
              <ArrowRight aria-hidden className="h-4 w-4" />
            </a>
            <span className="mt-4 text-[13px] text-clay">
              No credit card needed • Free during the hackathon • 60-second setup
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}
