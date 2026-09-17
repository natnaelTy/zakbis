import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Zakbis — Peer-to-Peer Logistics: USA & China to Ethiopia",
  description:
    "The peer-to-peer logistics network connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia affordably. Travelers earn by renting spare luggage space.",
  openGraph: {
    title: "Zakbis — Peer-to-Peer Logistics: USA & China to Ethiopia",
    description:
      "The peer-to-peer logistics network connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia affordably.",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Zakbis - Peer-to-Peer Logistics Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Zakbis — Peer-to-Peer Logistics: USA & China to Ethiopia",
    description:
      "The peer-to-peer logistics network connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia affordably.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

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