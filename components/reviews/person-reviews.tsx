"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { summaryLine, type TagCount } from "@/lib/reviews";
import type { Side } from "@/lib/negotiation";
import { ReviewList, type ReviewItem } from "./review-list";

/** A receiver's (or traveler's) rating line and five latest visible reviews, for the other side deciding whether to deal with them. */
export function PersonReviews({ personId, side, name }: { personId: string; side: Side; name: string }) {
  const [data, setData] = useState<{ line: string; reviews: ReviewItem[] }>();
  useEffect(() => {
    const supabase = createClient();
    const stats = side === "traveler"
      ? supabase.from("traveler_stats").select("rating, review_count").eq("traveler_id", personId).maybeSingle()
      : supabase.from("receiver_stats").select("rating, review_count").eq("receiver_id", personId).maybeSingle();
    void Promise.all([
      stats,
      supabase.from("review_tag_counts").select("tag, n").eq("subject_id", personId).eq("side", side),
      supabase.from("public_reviews").select("id, author_id, rating, tags, text, created_at").eq("subject_id", personId).eq("side", side)
        .order("visible_at", { ascending: false }).limit(5),
    ]).then(async ([s, t, r]) => {
      const rows = r.data ?? [];
      const authors = [...new Set(rows.map((x) => x.author_id as string))];
      // A receiver's reviewers are travelers (passport first names); a traveler's are receivers.
      const names = authors.length
        ? side === "receiver"
          ? (await supabase.from("traveler_names").select("traveler_id, given_name").in("traveler_id", authors)).data?.map((n) => [n.traveler_id, n.given_name]) ?? []
          : (await supabase.from("profiles").select("id, first_name").in("id", authors)).data?.map((n) => [n.id, n.first_name]) ?? []
        : [];
      const nameOf = Object.fromEntries(names) as Record<string, string>;
      setData({
        line: summaryLine({ rating: s.data?.rating == null ? null : Number(s.data.rating), count: Number(s.data?.review_count ?? 0), tags: (t.data as TagCount[] | null) ?? [] }, side),
        reviews: rows.map((x) => ({ id: x.id, author: nameOf[x.author_id] ?? (side === "receiver" ? "Traveler" : "Receiver"), rating: x.rating, tags: x.tags ?? [], text: x.text, date: x.created_at })),
      });
    });
  }, [personId, side]);
  if (!data) return null;
  return (
    <section aria-labelledby={`reviews-${personId}`} className="mt-6">
      <h2 id={`reviews-${personId}`} className="text-lg font-bold">Reviews of {name}</h2>
      <p className="text-sm text-muted-foreground">{data.line}</p>
      {data.reviews.length > 0 && <ReviewList reviews={data.reviews} />}
    </section>
  );
}
