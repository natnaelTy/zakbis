"use client";

import { useEffect, useRef, useState } from "react";
import { Shield, MapPin, Clock, Headphones } from "lucide-react";
import { Globe } from "@/components/ui/cobe-globe";

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

const trustBadges = [
  { text: "Safe Escrow", icon: Shield },
  { text: "300+ Cities", icon: MapPin },
  { text: "Express Times", icon: Clock },
  { text: "24/7 Support", icon: Headphones },
];

export function HeroSection() {
  return (
    <section className="pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          
          <div className="space-y-8 relative z-10">
            <h1 className="text-5xl md:text-6xl lg:text-[4rem] font-bold tracking-tight text-black leading-[1.1] animate-fade-in-up">
              Monetize Your Travel.{" "}
              <span className="text-slate-400">Deliver the World.</span>
            </h1>
            
            <p className="text-lg text-slate-600 max-w-lg animate-fade-in-up delay-100 leading-relaxed">
              The peer-to-peer logistics network connecting the Ethiopian diaspora. 
              Send packages affordably, or earn money by renting out your spare luggage space.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 animate-fade-in-up delay-200">
              <button className="bg-black text-white px-8 py-4 rounded-xl text-sm font-semibold hover:bg-black/80 transition-colors">
                Register as a Traveler
              </button>
              <button className="bg-slate-100 text-black px-8 py-4 rounded-xl text-sm font-semibold hover:bg-slate-200 transition-colors">
                Send a Package
              </button>
            </div>
            
            <div className="pt-8 flex flex-wrap gap-6 items-center animate-fade-in-up delay-300">
              {trustBadges.map((badge, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <badge.icon size={16} className="text-black" />
                  {badge.text}
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-fade-in-up delay-200 lg:ml-auto w-full max-w-lg">
            <div className="rounded-2xl overflow-hidden bg-slate-50 aspect-square relative shadow-xl border border-slate-200/60">
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
                  { id: "addis",   location: [9.0,  38.7],  label: "Addis Ababa" },
                  { id: "dc",      location: [38.9, -77.0], label: "Washington DC" },
                  { id: "london",  location: [51.5,  -0.1], label: "London" },
                  { id: "toronto", location: [43.7, -79.4], label: "Toronto" },
                  { id: "dubai",   location: [25.2,  55.3], label: "Dubai" },
                ]}
                arcs={[
                  { id: "addis-dc",      from: [9.0, 38.7], to: [38.9, -77.0], label: "Addis → DC" },
                  { id: "addis-london",  from: [9.0, 38.7], to: [51.5,  -0.1], label: "Addis → London" },
                  { id: "addis-toronto", from: [9.0, 38.7], to: [43.7, -79.4], label: "Addis → Toronto" },
                  { id: "addis-dubai",   from: [9.0, 38.7], to: [25.2,  55.3], label: "Addis → Dubai" },
                ]}
              />

              <div className="absolute bottom-6 left-6 right-6 bg-black/90 backdrop-blur-md rounded-xl p-5 border border-white/10 animate-float text-white shadow-2xl">
                <div className="flex justify-between items-end">
                  <div>
                    <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
                      Successful Deliveries
                    </div>
                    <div className="text-3xl font-bold">
                      <AnimatedCounter target={10000} />+
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                    <Shield className="text-white" size={20} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
}
