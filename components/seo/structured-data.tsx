"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Zakbis",
  url: "https://zakbis.com",
  logo: "https://zakbis.com/zakbislogo.png",
  sameAs: [
    "https://twitter.com/zakbis",
    "https://linkedin.com/company/zakbis",
    "https://facebook.com/zakbis",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+1-XXX-XXX-XXXX",
    contactType: "customer service",
    availableLanguage: ["English", "Amharic"],
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Zakbis",
  url: "https://zakbis.com",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://zakbis.com/triangular/search?from={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Zakbis P2P Logistics",
  description:
    "Peer-to-peer logistics platform connecting the Ethiopian diaspora. Buy items from USA, China and ship to Ethiopia. Travelers earn by renting spare luggage space.",
  brand: {
    "@type": "Brand",
    name: "Zakbis",
  },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "USD",
    lowPrice: "0",
    highPrice: "500",
    availability: "https://schema.org/InStock",
    seller: {
      "@type": "Organization",
      name: "Zakbis",
    },
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    reviewCount: "127",
  },
};

export function StructuredData() {
  const pathname = usePathname();

  const schemas: Record<string, unknown>[] = [organizationSchema, websiteSchema];

  if (pathname === "/") {
    schemas.push(productSchema);
  }

  return (
    <>
      {schemas.map((schema, index) => (
        <Script
          key={`ld-json-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}