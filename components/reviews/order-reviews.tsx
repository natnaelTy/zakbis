"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { REPORT_REASONS, reviewWindowLeft } from "@/lib/reviews";
import type { Side } from "@/lib/negotiation";
import { ReasonPicker } from "@/components/orders/offer-card";
import { ReviewForm } from "./review-form";
import { ReviewList } from "./review-list";

type Row = { id: string; author_id: string; rating: number; tags: string[]; text: string | null; created_at: string; visible_at: string | null; reported_at: string | null };

/** On an order whose review window opened: the viewer's review form or thanks, and the other side's review once both show. */
export function OrderReviews({ requestId, openAt, uid, viewer, other, now }: { requestId: string; openAt: string; uid: string; viewer: Side; other: string; now: Date }) {
  const [rows, setRows] = useState<Row[]>();
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const load = useCallback(async () => {
    const { data } = await createClient().from("reviews").select("id, author_id, rating, tags, text, created_at, visible_at, reported_at").eq("request_id", requestId);
    setRows((data as Row[] | null) ?? []);
  }, [requestId]);
  useEffect(() => void load(), [load]);
  if (!rows) return null;

  const mine = rows.find((r) => r.author_id === uid);
  const theirs = rows.find((r) => r.author_id !== uid && r.visible_at);
  const left = reviewWindowLeft(openAt, now);

  async function report(reason: string) {
    if (!theirs) return;
    setBusy(true);
    const { error: err } = await createClient().rpc("report_review", { p_review: theirs.id, p_reason: reason });
    setBusy(false);
    setReporting(false);
    if (err) setError("Couldn't report. Please try again.");
    await load();
  }

  return (
    <>
      {!mine && left && (
        <section className="mt-5 rounded-xl border bg-card p-4">
          <ReviewForm requestId={requestId} subjectSide={viewer === "receiver" ? "traveler" : "receiver"} other={other} onDone={load} />
          <p className="mt-2 text-[13px] text-muted-foreground">{left}</p>
        </section>
      )}
      {mine && !mine.visible_at && (
        <p className="mt-5 rounded-xl border bg-card p-4 text-base">Thanks. Your review shows once {other} reviews too, or when the review time ends.</p>
      )}
      {theirs && (
        <section className="mt-5" aria-labelledby="their-review">
          <h2 id="their-review" className="text-lg font-bold">{other}&apos;s review of you</h2>
          <ReviewList reviews={[{ id: theirs.id, author: other, rating: theirs.rating, tags: theirs.tags, text: theirs.text, date: theirs.created_at }]} />
          {theirs.reported_at ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Reported</p>
          ) : reporting ? (
            <div className="mt-3">
              <ReasonPicker label="Report review" reasons={REPORT_REASONS} busy={busy} onBack={() => setReporting(false)} onConfirm={(r) => void report(r)} />
            </div>
          ) : (
            <button type="button" className="mt-2 text-base font-medium text-destructive underline-offset-4 hover:underline" onClick={() => setReporting(true)}>
              Report
            </button>
          )}
          {error && <p role="alert" className="mt-2 text-base text-destructive">{error}</p>}
        </section>
      )}
    </>
  );
}
