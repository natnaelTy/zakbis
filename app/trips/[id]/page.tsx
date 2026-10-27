import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronLeft, EyeOff, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ratingLabel, TripTag } from "@/components/trip-tag";
import { getTrip } from "@/lib/sample-data";
import { SideGate } from "@/components/auth/side-gate";
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
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <EyeOff aria-hidden className="size-3.5" /> {trip.travelerName}&apos;s photo is shown once your request is accepted.
        </p>
        <section aria-labelledby="reviews" className="mt-6">
          <div>
            <h2 id="reviews" className="text-lg font-bold">Reviews</h2>
            <p className="text-sm text-muted-foreground">
              {trip.deliveries > 0 ? `${trip.deliveries} ${trip.deliveries === 1 ? "delivery" : "deliveries"}` : "New traveler"}
              {trip.reviewCount > 0 && ` · ${ratingLabel(trip)}`} · sample
            </p>
          </div>
          {trip.reviews.length > 0 ? (
            <ul className="mt-2 divide-y border-y">
              {trip.reviews.map((r) => (
                <li key={r.author + r.date} className="py-3">
                  <p className="flex items-center gap-2 text-base">
                    <span className="font-semibold">{r.author}</span>
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} aria-hidden className={n <= r.rating ? "size-4 fill-current" : "size-4 text-muted-foreground"} />
                      ))}
                      <span className="sr-only">Rated {r.rating} out of 5</span>
                    </span>
                    <span className="ml-auto text-[13px] text-muted-foreground">{format(parseISO(r.date), "d MMM yyyy")}</span>
                  </p>
                  <p className="mt-1 text-base">{r.text}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-base text-muted-foreground">
              {trip.travelerName} has no reviews yet. Reviews appear after completed deliveries.
            </p>
          )}
        </section>
        <SideGate side="receiver">
          <RequestForm trip={trip} />
        </SideGate>
      </main>
    </AppShell>
  );
}
