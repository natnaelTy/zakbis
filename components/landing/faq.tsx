"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    q: "How does Zakbis work?",
    a: "Zakbis connects senders with international travelers heading to the destination. Senders post requests, travelers accept, items are exchanged, and funds are released securely from escrow."
  },
  {
    q: "Is it safe to send items with a stranger?",
    a: "Safety is our top priority. We verify traveler identities and hold payments in escrow. Both parties rate each other after every transaction."
  },
  {
    q: "What items can be sent through Zakbis?",
    a: "You can send most personal items including electronics, clothing, documents, and gifts. Illegal items, hazardous materials, liquids, and customs-prohibited goods are strictly forbidden."
  },
  {
    q: "How much does it cost?",
    a: "Pricing is set by travelers based on item weight and route. Costs typically range from $5 to $20 per kilogram, which is significantly cheaper than traditional logistics."
  },
  {
    q: "Which routes do you support?",
    a: "We currently focus on routes between the USA, UK, Dubai, China, and Ethiopia, but users can post a route for anywhere in the world."
  },
  {
    q: "How do travelers get paid?",
    a: "Once the receiver confirms delivery, funds are released from escrow directly to the traveler's connected payment method."
  }
];

function FaqItem({ q, a }: { q: string, a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-black/10">
      <button 
        onClick={() => setOpen(!open)} 
        className="w-full flex items-center justify-between py-6 text-left"
      >
        <span className="text-lg font-bold text-black pr-8">{q}</span>
        <span className="flex-shrink-0 text-black">
          {open ? <Minus size={20} /> : <Plus size={20} />}
        </span>
      </button>
      <div 
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? "300px" : "0", opacity: open ? 1 : 0 }}
      >
        <p className="text-slate-600 pb-6 text-base leading-relaxed">{a}</p>
      </div>
    </div>
  );
}

export function FaqSection() {
  return (
    <section id="faq" className="py-24 md:py-32 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-black">Common questions.</h2>
        </div>
        
        <div className="border-t border-black/10">
          {faqs.map(faq => (
            <FaqItem key={faq.q} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}
