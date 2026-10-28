import Link from "next/link";
import { ArrowLeft } from "@/components/icons";
import { AppShell } from "@/components/app-shell";
import { SideGate } from "@/components/auth/side-gate";
import { MakeOffer } from "./make-offer";

export default async function OpenRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell active="Explore">
      <main className="px-4 pb-24 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/requests" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ArrowLeft aria-hidden className="size-5" /> Open requests
        </Link>
        <SideGate side="traveler">
          <MakeOffer id={id} />
        </SideGate>
      </main>
    </AppShell>
  );
}
