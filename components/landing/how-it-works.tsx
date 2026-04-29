"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Process1 } from "@/components/process1";

const roleFlows = {
  sender: {
    heading: "For Senders",
    description:
      "Post what you need to ship, match with a traveler, pay securely, and follow the handoff end-to-end.",
    ctaLabel: "Start a request",
    ctaHref: "/buy-me",
    steps: [
      {
        step: "01",
        title: "Create a delivery request",
        description: "Add your item details, route, budget, and what needs to be delivered.",
      },
      {
        step: "02",
        title: "Match with a traveler",
        description: "Review available trips and connect with the traveler who fits your route.",
      },
      {
        step: "03",
        title: "Track and receive",
        description: "Follow status updates, coordinate handoff, and confirm delivery safely.",
      },
    ],
  },
  traveler: {
    heading: "For Travelers",
    description:
      "Turn spare luggage space into income by matching requests along your route and delivering with confidence.",
    ctaLabel: "Add your trip",
    ctaHref: "/traveler/flight-entry",
    steps: [
      {
        step: "01",
        title: "List your flight or trip",
        description: "Share your route, dates, and available luggage capacity.",
      },
      {
        step: "02",
        title: "Accept the right requests",
        description: "Browse matching packages, review details, and confirm the ones you want to carry.",
      },
      {
        step: "03",
        title: "Deliver and earn",
        description: "Pick up the package, complete the handoff, and get paid once it arrives.",
      },
    ],
  },
  receiver: {
    heading: "For Receivers",
    description:
      "Stay updated on your package, coordinate with the traveler, and receive it when it arrives.",
    ctaLabel: "See your deliveries",
    ctaHref: "/dashboard",
    steps: [
      {
        step: "01",
        title: "Review the package status",
        description: "See where your delivery is, who is carrying it, and the latest updates.",
      },
      {
        step: "02",
        title: "Coordinate the handoff",
        description: "Use the chat to align on timing, pickup, and arrival details.",
      },
      {
        step: "03",
        title: "Receive and confirm",
        description: "Meet at the destination, collect the package, and mark it delivered.",
      },
    ],
  },
} as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 md:py-32">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-12 md:mb-16 max-w-3xl">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-black md:text-5xl">
            One flow, three role views.
          </h2>
          <p className="text-lg text-slate-600">
            Switch between sender, traveler, and receiver to see exactly how each role uses the platform.
          </p>
        </div>

        <Tabs defaultValue="sender" className="space-y-10">
          <TabsList className="h-auto flex flex-wrap justify-start gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5">
            <TabsTrigger value="sender" className="rounded-xl px-4 py-2 data-[state=active]:bg-black data-[state=active]:text-white">
              Sender
            </TabsTrigger>
            <TabsTrigger value="traveler" className="rounded-xl px-4 py-2 data-[state=active]:bg-black data-[state=active]:text-white">
              Traveler
            </TabsTrigger>
            <TabsTrigger value="receiver" className="rounded-xl px-4 py-2 data-[state=active]:bg-black data-[state=active]:text-white">
              Receiver
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sender" className="mt-0">
            <Process1
              heading={roleFlows.sender.heading}
              description={roleFlows.sender.description}
              ctaLabel={roleFlows.sender.ctaLabel}
              ctaHref={roleFlows.sender.ctaHref}
              steps={roleFlows.sender.steps}
              className="py-0"
            />
          </TabsContent>

          <TabsContent value="traveler" className="mt-0">
            <Process1
              heading={roleFlows.traveler.heading}
              description={roleFlows.traveler.description}
              ctaLabel={roleFlows.traveler.ctaLabel}
              ctaHref={roleFlows.traveler.ctaHref}
              steps={roleFlows.traveler.steps}
              className="py-0"
            />
          </TabsContent>

          <TabsContent value="receiver" className="mt-0">
            <Process1
              heading={roleFlows.receiver.heading}
              description={roleFlows.receiver.description}
              ctaLabel={roleFlows.receiver.ctaLabel}
              ctaHref={roleFlows.receiver.ctaHref}
              steps={roleFlows.receiver.steps}
              className="py-0"
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
