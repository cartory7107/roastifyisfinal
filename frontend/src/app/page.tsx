import { AuditSimulator } from "@/components/landing/AuditSimulator";
import { Faq } from "@/components/landing/Faq";
import { FeatureBento } from "@/components/landing/FeatureBento";
import { FinalCta } from "@/components/landing/FinalCta";
import { Hero } from "@/components/landing/Hero";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { SocialProof } from "@/components/landing/SocialProof";
import { Steps } from "@/components/landing/Steps";

/**
 * Marketing landing page. The audit form lives in the #audit-preview section
 * and posts to the same API the report pages poll.
 */
export default function HomePage() {
  return (
    <main className="landing-page min-h-screen bg-ink text-bone">
      <SiteHeader />
      <Hero />
      <SocialProof />
      <FeatureBento />
      <Steps />
      <AuditSimulator />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
