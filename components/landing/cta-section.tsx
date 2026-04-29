"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="relative isolate overflow-hidden bg-emerald-700 px-6 pt-14 shadow-2xl rounded-2xl sm:px-10 md:px-16 md:pt-10 lg:flex">
          <svg
            viewBox="0 0 1024 1024"
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 -z-10 size-256 -translate-y-1/2 mask-[radial-gradient(closest-side,white,transparent)] sm:left-full sm:-ml-80 lg:left-1/2 lg:ml-0 lg:-translate-x-1/2 lg:translate-y-0"
          >
            <circle
              r={512}
              cx={512}
              cy={512}
              fill="url(#759c1415-0410-454c-8f7c-9a820de03641)"
              fillOpacity="0.7"
            />
            <defs>
              <radialGradient id="759c1415-0410-454c-8f7c-9a820de03641">
                <stop stopColor="#13c25c" />
                <stop offset={1} stopColor="#157234" />
              </radialGradient>
            </defs>
          </svg>
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:flex-auto lg:py-32 lg:text-left">
            <h2 className="text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl md:text-5xl">
              Send smarter. Travel and earn with Zakbis.
            </h2>
            <p className="mt-5 text-base leading-7 text-pretty text-gray-300 sm:text-lg sm:leading-8">
              Post a request, match with trusted travelers, and track every handoff.
              Or list your trip and monetize your spare luggage space.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:gap-4 lg:justify-start">
              <Button asChild size="lg" className="w-full bg-white text-gray-900 hover:bg-gray-100 sm:w-auto">
                <Link href="/buy-me">Start a request</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="lg"
                className="w-full text-white hover:bg-white/10 hover:text-white sm:w-auto"
              >
                <Link href="#how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
          <div className="relative z-10 mt-12 -mx-6 sm:-mx-10 md:-mx-16 lg:absolute lg:bottom-0 lg:right-0 lg:mt-16 lg:mx-0 lg:h-[450px] p-2 md:p-0">
            <Image
              alt="App screenshot"
              src="/cta.png"
              width={1824}
              height={1080}
              loading="lazy"
              className="block h-auto w-full max-w-none rounded-lg bg-white/5 object-cover ring-1 ring-white/10 lg:h-full lg:max-w-[550px] lg:rounded-none lg:rounded-tl-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
