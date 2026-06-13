const corridors = [
  { flag: "🇺🇸", city: "Washington D.C.", flights: "~30 flights/mo", highlight: false },
  { flag: "🇨🇦", city: "Toronto",          flights: "~30 flights/mo", highlight: false },
  { flag: "🇦🇪", city: "Dubai",            flights: "~130 flights/mo ★", highlight: true  },
  { flag: "🇬🇧", city: "London",           flights: "~30 flights/mo",  highlight: false },
  { flag: "🇨🇳", city: "China",            flights: "~152 flights/mo", highlight: false },
];

export default function Corridors() {
  return (
    <section className="bg-gray-50 border-y border-gray-100 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12">
          <div>
            <span className="text-[11px] font-medium tracking-widest uppercase text-emerald-700 mb-3 block">
              Active corridors
            </span>
            <h2 className="font-bold text-[clamp(22px,3vw,34px)] text-gray-900 leading-tight max-w-sm">
              Connecting Ethiopia to the world&apos;s biggest diaspora hubs.
            </h2>
          </div>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed sm:text-right">
            Every flight is a potential delivery. Every traveler earns. Every
            family receives.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {corridors.map((c) => (
            <div
              key={c.city}
              className={`rounded-xl p-5 text-center border transition-all duration-200 hover:-translate-y-1 ${
                c.highlight
                  ? "bg-[hsl(var(--primary)/0.06)] border-[hsl(var(--primary)/0.22)] text-white shadow-lg shadow-[hsl(var(--primary)/0.12)]"
                  : "bg-white border-[hsl(var(--border)/1)] text-gray-900 hover:border-[hsl(var(--primary)/0.28)] hover:shadow-sm"
              }`}
            >
              <span className="text-3xl mb-2.5 block">{c.flag}</span>
              <div className={`text-sm font-semibold mb-1 ${c.highlight ? "text-black" : "text-gray-800"}`}>
                {c.city}
              </div>
              <div className={`text-xs font-medium ${c.highlight ? "text-[hsl(var(--primary)/0.7)]" : "text-[hsl(var(--primary)/0.9)]"}`}>
                {c.flights}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-gray-400">★ Busiest corridor — 4+ flights per day</p>
      </div>
    </section>
  );
}
