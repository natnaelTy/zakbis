"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import WaitlistForm from "./WaitlistForm";

// Load canvas client-side only (no SSR)
const FlightMap = dynamic(() => import("./FlighMap"), { ssr: false });

const STATS = [
  { value: "520+", label: "Flights / month" },
  { value: "5",    label: "Corridors"       },
  { value: "$6B",  label: "ET remittances"  },
];

export default function Hero() {
  const [count, setCount] = useState(0);

  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-28 pb-20 overflow-hidden bg-white"
    >
      {/* Animated flight-path map */}
      <FlightMap />

      {/* Soft emerald radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(4,120,87,0.06)_0%,transparent_70%)]" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl w-full">

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-widest uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-[pulse_dot_2s_ease-in-out_infinite]" />
          Now building — join early access
        </div>

        {/* Headline */}
        <h1 className="font-bold text-[clamp(38px,6vw,68px)] leading-[1.08] tracking-tight text-gray-900 mb-5">
          Monetize Your Travel.
          <br />
          <em className="not-italic text-primary">Deliver the World.</em>
        </h1>

        {/* Sub */}
        <p className="text-[clamp(15px,2vw,17px)] text-gray-500 font-light leading-relaxed max-w-xl mx-auto mb-11">
          Zakbis connects travelers flying to Ethiopia with people who need items
          carried or bought. No DHL. No markups. Just trust, community, and
          unused luggage space.
        </p>

        {/* Waitlist form */}
        <WaitlistForm onSuccess={() => setCount((c) => c + 1)} />

      </div>
    </section>
  );
}
