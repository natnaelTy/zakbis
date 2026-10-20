import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TripTag } from "@/components/trip-tag";
import { getTrip } from "@/lib/sample-data";
import { RequestForm } from "./request-form";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = getTrip(id);
  if (!trip) notFound();

  return (
    <AppShell active="Trips">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ChevronLeft aria-hidden className="size-5" /> Trips
        </Link>
        <h1 className="sr-only">Request an item from {trip.travelerName}</h1>
        <div className="mt-3">
          <TripTag trip={trip} static />
        </div>
        <RequestForm trip={trip} />
      </main>
    </AppShell>
  );
}
