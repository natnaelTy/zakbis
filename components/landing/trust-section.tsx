import Image from "next/image";
import { Lock, UserCheck, ShieldAlert } from "lucide-react";

const trustFeatures = [
  {
    icon: Lock,
    title: "Escrow Protection",
    desc: "Payments are held securely in escrow and only released to the traveler upon confirmed delivery."
  },
  {
    icon: UserCheck,
    title: "Verified Community",
    desc: "Every network participant must pass identity verification before performing their first transaction."
  },
  {
    icon: ShieldAlert,
    title: "Dispute Resolution",
    desc: "24/7 mediation. If issues arise, our team steps in to ensure fairness aligned with platform policies."
  }
];

export function TrustSection() {
  return (
    <section id="trust-and-safety" className="py-24 md:py-32 bg-black text-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          <div className="relative aspect-[4/5] rounded-3xl overflow-hidden order-last lg:order-first border border-slate-800">
            <Image 
              src="/trust-woman.png"
              alt="Trusted community"
              fill
              className="object-cover grayscale"
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            
            <div className="absolute bottom-10 left-10 text-xl font-bold italic font-serif">
              "We take the risk out of peer-to-peer delivery."
            </div>
            
            {/* Absolute badge */}
            <div className="absolute top-6 left-6 bg-white text-black px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-2xl">
              <UserCheck size={14} />
              Identity Checked
            </div>
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-6 leading-tight">
                Absolute Security.<br/>
                <span className="text-gray-500">Zero Compromise.</span>
              </h2>
              <p className="text-lg text-slate-400">
                You should never have to worry about your money or your item. Our robust safety protocols ensure an airtight, transparent exchange process.
              </p>
            </div>
            
            <div className="space-y-8">
              {trustFeatures.map((f, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-12 h-12 bg-[#1c1c1c] rounded-xl flex items-center justify-center flex-shrink-0 text-white">
                    <f.icon size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{f.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}
