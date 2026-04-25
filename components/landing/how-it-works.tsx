"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

const senderSteps = [
  { id: "01", title: "Create Request", desc: "List your item, destination, and what you're willing to pay for delivery." },
  { id: "02", title: "Match & Pay", desc: "Connect with a verified traveler. Secure your payment in escrow." },
  { id: "03", title: "Track & Receive", desc: "Follow the journey and meet your traveler to receive your package." },
];

const travelerSteps = [
  { id: "01", title: "List Trip", desc: "Enter your flight details and how much spare luggage space you have." },
  { id: "02", title: "Accept & Pickup", desc: "Browse requests matching your route, accept them, and collect the items." },
  { id: "03", title: "Deliver & Earn", desc: "Hand over the item at the destination and get paid instantly from escrow." },
];

function StepItem({ num, title, desc, delay }: { num: string, title: string, desc: string, delay: number }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref} 
      className="flex gap-4 transition-all duration-700 ease-out"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transitionDelay: `${delay}ms` }}
    >
      <div className="text-sm font-bold text-slate-400 font-mono tracking-tighter pt-1">{num}</div>
      <div>
        <h3 className="text-lg font-bold text-black mb-1">{title}</h3>
        <p className="text-slate-600 text-sm leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 md:py-32 bg-slate-50 border-t border-b border-black/5">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16 md:mb-24">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-black mb-4">
            Two paths, one destination.
          </h2>
          <p className="text-lg text-slate-600">The easiest way to send pacakges globally.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-24">
          <div>
            <div className="mb-8">
              <span className="bg-black text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded inline-block">For Senders</span>
            </div>
            <div className="space-y-10">
              {senderSteps.map((step, i) => (
                <StepItem key={step.id} num={step.id} title={step.title} desc={step.desc} delay={i * 150} />
              ))}
            </div>
          </div>
          
          <Card>
            <CardContent className="p-8 md:p-10">
              <div className="mb-8">
                <span className="bg-slate-200 text-black text-xs font-bold uppercase tracking-wider px-3 py-1 rounded inline-block">For Travelers</span>
              </div>
              <div className="space-y-10">
                {travelerSteps.map((step, i) => (
                  <StepItem key={step.id} num={step.id} title={step.title} desc={step.desc} delay={i * 150 + 200} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
