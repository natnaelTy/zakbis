import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section className="py-24 md:py-32 bg-slate-50 border-t border-black/5 text-center px-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-black mb-6">
          Ready to get started?
        </h2>
        <p className="text-xl text-slate-600 mb-10">
          Join thousands of travelers and senders delivering the world.
        </p>
        
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="w-full sm:w-auto bg-black text-white px-8 py-4 rounded-xl text-sm font-semibold hover:bg-black/80 transition-colors flex items-center justify-center gap-2 group">
            Get Started
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button className="w-full sm:w-auto bg-white text-black px-8 py-4 rounded-xl text-sm font-semibold border border-black/10 hover:bg-slate-50 transition-colors">
            Contact Sales
          </button>
        </div>
      </div>
    </section>
  );
}
