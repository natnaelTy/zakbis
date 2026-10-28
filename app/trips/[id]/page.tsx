import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ArrowLeft, EyeClosed, Star } from "@/components/icons";
import { AppShell } from "@/components/app-shell";
import { ratingLabel, TripTag } from "@/components/trip-tag";
import { createClient } from "@/lib/supabase/server";
import { loadRates, loadTripCards } from "@/lib/trips";
import { SideGate } from "@/components/auth/side-gate";
import { RequestForm } from "./request-form";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [[trip], rates] = await Promise.all([loadTripCards(supabase, { id }), loadRates(supabase)]);
  if (!trip) notFound();
  const { data: reviewRows } = await supabase
    .from("reviews")
    .select("rating, text, created_at, author:profiles!reviews_author_id_fkey(first_name)")
    .eq("subject_id", trip.travelerId)
    .order("created_at", { ascending: false })
    .limit(20);
  const reviews = (reviewRows ?? []).map((r) => ({
    author: (r.author as unknown as { first_name: string | null } | null)?.first_name ?? "Receiver",
    rating: r.rating as number,
    text: r.text as string,
    date: (r.created_at as string).slice(0, 10),
  }));

  return (
    <AppShell active="Explore">
      <main className="px-4 md:mx-auto md:max-w-xl md:px-0">
        <Link href="/" className="-ml-1 inline-flex items-center text-base font-medium text-brand-text">
          <ArrowLeft aria-hidden className="size-5" /> Trips
        </Link>
        <h1 className="sr-only">Request an item from {trip.travelerName}</h1>
        <div className="mt-3">
          <TripTag trip={trip} static />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <EyeClosed aria-hidden className="size-3.5" /> {trip.travelerName}&apos;s photo is shown once your request is accepted.
        </p>
        <section aria-labelledby="reviews" className="mt-6">
          <div>
            <h2 id="reviews" className="text-lg font-bold">Reviews</h2>
            <p className="text-sm text-muted-foreground">
              {trip.deliveries > 0 ? `${trip.deliveries} ${trip.deliveries === 1 ? "delivery" : "deliveries"}` : "New traveler"}
              {trip.reviewCount > 0 && ` · ${ratingLabel(trip)}`}
            </p>
          </div>
          {reviews.length > 0 ? (
            <ul className="mt-2 divide-y border-y">
              {reviews.map((r) => (
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
          <RequestForm trip={trip} rates={rates} />
        </SideGate>
      </main>
    </AppShell>
  );
}
