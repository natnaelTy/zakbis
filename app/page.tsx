import { SiteHeader } from "@/components/landing/site-header";
import { HeroSection } from "@/components/landing/hero";
import { HowItWorksSection } from "@/components/landing/how-it-works";
import { TrustSection } from "@/components/landing/trust-section";
import { FaqSection } from "@/components/landing/faq";
import { CtaSection } from "@/components/landing/cta-section";
import { SiteFooter } from "@/components/landing/site-footer";
import Hero from "@/components/waitlist/Hero";
import Corridors from "@/components/waitlist/Corridors";
import HowItWorks from "@/components/waitlist/HowItWorks";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Corridors />
        <HowItWorks />
      </main>
      <SiteFooter />
    </>
  );
}
