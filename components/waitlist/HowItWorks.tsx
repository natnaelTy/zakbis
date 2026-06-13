const flows = [
  {
    icon: "🔺",
    name: "Triangular Delivery",
    desc: "You have a package. A traveler has the space. We connect the two — and your item arrives safely without the courier markup.",
    accent: "emerald",
    steps: [
      "Sender posts an item that needs delivering to Ethiopia",
      "Traveler with luggage space accepts and carries it",
      "Receiver confirms delivery, payment is released",
    ],
  },
  {
    icon: "🛒",
    name: '"Buy Me" Flow',
    desc: "A traveler posts their upcoming flight. Families in Ethiopia request items to be purchased abroad and brought back.",
    accent: "amber",
    steps: [
      "Traveler posts their flight route and available space",
      "Receiver requests specific items to be bought abroad",
      "Traveler shops, flies, delivers — and earns a fee",
    ],
  },
];

export default function HowItWorks() {
  return (
    <section className="py-24 px-6 max-w-5xl mx-auto">
      <span className="text-[11px] font-medium tracking-widest uppercase text-emerald-700 mb-4 block">
        How it works
      </span>
      <h2 className="font-bold text-[clamp(26px,4vw,42px)] text-gray-900 mb-14 leading-tight max-w-sm">
        Two flows. One community.
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {flows.map((flow) => (
          <div
            key={flow.name}
            className={`relative rounded-2xl p-8 border overflow-hidden bg-white transition-shadow hover:shadow-md ${
              flow.accent === "emerald"
                ? "border-emerald-200"
                : "border-amber-200"
            }`}
          >
            {/* Top accent bar */}
            <div
              className={`absolute top-0 left-0 right-0 h-0.5 ${
                flow.accent === "emerald"
                  ? "bg-gradient-to-r from-emerald-600 to-transparent"
                  : "bg-gradient-to-r from-amber-500 to-transparent"
              }`}
            />

            <span className="text-3xl mb-4 block">{flow.icon}</span>
            <h3 className="text-xl font-semibold text-gray-900 mb-3">
              {flow.name}
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed mb-6">
              {flow.desc}
            </p>

            <ol className="space-y-3">
              {flow.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5 ${
                      flow.accent === "emerald"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
