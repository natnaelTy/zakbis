import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SideGate } from "@/components/auth/side-gate";
import { TripDetail } from "./trip-detail";

export default async function MyTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell active="Orders">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/orders" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ChevronLeft aria-hidden className="size-5" /> Orders
        </Link>
        <SideGate side="traveler">
          <TripDetail id={id} />
        </SideGate>
      </main>
    </AppShell>
  );
}
