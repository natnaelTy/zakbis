"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, MapPin, Clock, Headphones, Search, ArrowRightLeft
} from "lucide-react"
import { Globe } from "@/components/ui/cobe-globe";
import { Loader2 } from "lucide-react";
/* ── Animated counter ────────────────────────────────────────────── */
function AnimatedCounter({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 2000;
          const startTime = performance.now();
          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

/* ── Cities ──────────────────────────────────────────────────────── */
const CITIES = [
  "Addis Ababa",
  "Washington D.C.",
  "New York",
  "Los Angeles",
  "London",
  "Dubai",
  "Toronto",
  "Frankfurt",
  "Paris",
  "Beijing",
  "Shanghai",
  "Nairobi",
  "Johannesburg",
  "Seattle",
  "Dallas",
  "Minneapolis",
  "Atlanta",
];

/* ── City Input (autocomplete) ───────────────────────────────────── */
function CityInput({
  id,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  /* close dropdown on outside click */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = CITIES.filter(
    (c) =>
      c.toLowerCase().includes(query.toLowerCase()) &&
      c.toLowerCase() !== value.toLowerCase()
  );

  return (
    <div ref={wrapperRef} className="relative flex-1">
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          /* clear selected value when user types */
          if (e.target.value !== value) onChange("");
        }}
        className="w-full h-12 pl-9 pr-4 rounded-xl bg-slate-100 text-[15px] text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-black/10 caret-black transition"
      />

      {/* Dropdown */}
      {open && query.length > 0 && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
          {filtered.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => {
                onChange(city);
                setQuery(city);
                setOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm text-black hover:bg-slate-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <MapPin size={14} className="text-slate-400 shrink-0" />
              {city}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Trust badges ────────────────────────────────────────────────── */
const trustBadges = [
  { text: "Safe Escrow", icon: Shield },
  { text: "300+ Cities", icon: MapPin },
  { text: "Express Times", icon: Clock },
  { text: "24/7 Support", icon: Headphones },
];

/* ── Hero Section ────────────────────────────────────────────────── */
export function HeroSection() {
  const router = useRouter();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSwap = useCallback(() => {
    const oldFrom = from;
    const oldTo = to;
    setFrom(oldTo);
    setTo(oldFrom);
  }, [from, to]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    router.push(`/triangular/search?${params.toString()}`);
  }, [from, to, router]);

  return (
    <section className="pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">

          <div className="space-y-8 relative z-10">
            <h1 className="text-5xl md:text-6xl lg:text-[4rem] font-bold tracking-tight text-black leading-[1.1] animate-fade-in-up">
              Monetize Your Travel.{" "}
              <span className="text-emerald-700">Deliver the World.</span>
            </h1>

            <p className="text-lg text-slate-600 max-w-lg animate-fade-in-up delay-100 leading-relaxed">
              The peer-to-peer logistics network connecting the Ethiopian diaspora.
              Send packages affordably, or earn money by renting out your spare luggage space.
            </p>

            {/* ── From / To inputs ──────────────────────── */}
            <div className="animate-fade-in-up delay-200 max-w-lg space-y-3">
              <div className="flex items-stretch gap-2">
                {/* Vertical connector */}
                <div className="flex flex-col items-center pt-4 pb-4 w-5 shrink-0">
                  <div className="w-2 h-2 rounded-full bg-brand-green shrink-0 shadow-sm shadow-brand-green/50" />
                  <div className="w-px flex-1 bg-gradient-to-b from-brand-green/30 to-brand-rose/30 my-1" />
                  <div className="w-2 h-2 rounded-sm bg-brand-rose shrink-0 shadow-sm shadow-brand-rose/50" />
                </div>

                {/* Inputs */}
                <div className="flex-1 min-w-0 space-y-2">
                  <CityInput
                    id="hero-from"
                    placeholder="Enter pickup city"
                    value={from}
                    onChange={setFrom}
                  />
                  <CityInput
                    id="hero-to"
                    placeholder="Enter destination city"
                    value={to}
                    onChange={setTo}
                  />
                </div>

                {/* Swap button */}
                <div className="flex items-center shrink-0">
                  <button
                    type="button"
                    onClick={handleSwap}
                    className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors group"
                    aria-label="Swap cities"
                  >
                    <ArrowRightLeft size={14} className="text-slate-500 group-hover:text-black transition-colors rotate-90" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsSearching(true);
                  handleSearch();
                }}
                className="w-full h-12 bg-brand-green hover:bg-brand-greenLight text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2.5 shadow-sm transition-colors active:scale-[0.98]"
              >
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {isSearching ? "Entering..." : "Search Travelers"}
              </button>
            </div>

            <div className="pt-2 flex flex-wrap gap-6 items-center animate-fade-in-up delay-300">
              {trustBadges.map((badge, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <badge.icon size={16} className="text-black" />
                  {badge.text}
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-fade-in-up delay-200 lg:ml-auto w-full max-w-lg aspect-square">
            <Globe
              className="w-full h-full"
              dark={0}
              baseColor={[0.95, 0.95, 0.97]}
              glowColor={[0.85, 0.88, 0.95]}
              markerColor={[0.1, 0.1, 0.1]}
              arcColor={[0.2, 0.2, 0.2]}
              mapBrightness={8}
              diffuse={1.8}
              speed={0.004}
              theta={0.25}
              markers={[
                { id: "addis", location: [9.0, 38.7], label: "Addis Ababa" },
                { id: "dc", location: [38.9, -77.0], label: "Washington DC" },
                { id: "london", location: [51.5, -0.1], label: "London" },
                { id: "toronto", location: [43.7, -79.4], label: "Toronto" },
                { id: "dubai", location: [25.2, 55.3], label: "Dubai" },
              ]}
              arcs={[
                { id: "addis-dc", from: [9.0, 38.7], to: [38.9, -77.0], label: "Addis → DC" },
                { id: "addis-london", from: [9.0, 38.7], to: [51.5, -0.1], label: "Addis → London" },
                { id: "addis-toronto", from: [9.0, 38.7], to: [43.7, -79.4], label: "Addis → Toronto" },
                { id: "addis-dubai", from: [9.0, 38.7], to: [25.2, 55.3], label: "Addis → Dubai" },
              ]}
            />
          </div>

        </div>
      </div>
    </section>
  );
}
