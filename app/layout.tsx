import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/sonner";
import { StructuredData } from "@/components/seo/structured-data";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const baseMetadata: Metadata = {
  title: {
    default: "Zakbis — Peer-to-Peer Logistics: USA & China to Ethiopia",
    template: "%s | Zakbis",
  },
  description:
    "The peer-to-peer logistics network connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia affordably. Travelers earn by renting spare luggage space.",
  keywords: [
    "peer-to-peer logistics",
    "P2P shipping",
    "Ethiopia shipping",
    "diaspora logistics",
    "luggage space rental",
    "package forwarding Ethiopia",
    "USA to Ethiopia shipping",
    "China to Ethiopia shipping",
    "international package delivery",
    "Zakbis",
  ],
  authors: [{ name: "Zakbis" }],
  creator: "Zakbis",
  publisher: "Zakbis",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://zakbis.com"),
  alternates: {
    canonical: "https://zakbis.com",
    types: {
      "application/rss+xml": "/rss.xml",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://zakbis.com",
    siteName: "Zakbis",
    title: "Zakbis — Peer-to-Peer Logistics: USA & China to Ethiopia",
    description:
      "The peer-to-peer logistics network connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia affordably.",
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
    creator: "@zakbis",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...baseMetadata,
    verification: {
      google: process.env.GOOGLE_SITE_VERIFICATION,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <head>
        <StructuredData />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}