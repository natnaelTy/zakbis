import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, EyeClosed } from "@/components/icons";
import { AppShell } from "@/components/app-shell";
import { TripTag } from "@/components/trip-tag";
import { createClient } from "@/lib/supabase/server";
import { loadRates, loadTripCards } from "@/lib/trips";
import { SideGate } from "@/components/auth/side-gate";
import { RequestForm } from "./request-form";
import { ReviewList, type ReviewItem } from "@/components/reviews/review-list";
import { summaryLine, type TagCount } from "@/lib/reviews";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [[trip], rates] = await Promise.all([loadTripCards(supabase, { id }), loadRates(supabase)]);
  if (!trip) notFound();
  const [{ data: reviewRows }, { data: tagRows }] = await Promise.all([
    supabase
      .from("public_reviews")
      .select("id, rating, tags, text, created_at, author_id")
      .eq("subject_id", trip.travelerId)
      .eq("side", "traveler")
      .order("visible_at", { ascending: false })
      .limit(20),
    supabase.from("review_tag_counts").select("tag, n").eq("subject_id", trip.travelerId).eq("side", "traveler"),
  ]);
  const authorIds = [...new Set((reviewRows ?? []).map((r) => r.author_id as string))];
  const { data: authors } = authorIds.length ? await supabase.from("profiles").select("id, first_name").in("id", authorIds) : { data: [] };
  const firstName = new Map((authors ?? []).map((a) => [a.id as string, a.first_name as string | null]));
  const reviews: ReviewItem[] = (reviewRows ?? []).map((r) => ({
    id: r.id as string,
    author: firstName.get(r.author_id as string) ?? "Receiver",
    rating: r.rating as number,
    tags: (r.tags as string[] | null) ?? [],
    text: r.text as string | null,
    date: r.created_at as string,
  }));
  const summary = summaryLine({ rating: trip.reviewCount ? trip.rating : null, count: trip.reviewCount, tags: (tagRows as TagCount[] | null) ?? [] }, "traveler");

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
              {trip.deliveries > 0 && `${trip.deliveries} ${trip.deliveries === 1 ? "delivery" : "deliveries"} · `}
              {summary}
            </p>
          </div>
          {reviews.length > 0 ? (
            <ReviewList reviews={reviews} />
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
