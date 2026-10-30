"use client";

import { useState } from "react";
import { Star } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { CONTACT_ERROR, type Side } from "@/lib/negotiation";
import { RECEIVER_TAGS, TRAVELER_TAGS } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { btn } from "@/components/orders/offer-card";

/** Stars (required), tags from the fixed list for the person's side, optional comment and private note. */
export function ReviewForm({ requestId, subjectSide, other, onDone }: { requestId: string; subjectSide: Side; other: string; onDone: () => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const list = subjectSide === "traveler" ? TRAVELER_TAGS : RECEIVER_TAGS;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Choose 1 to 5 stars");
    setBusy(true);
    setError(undefined);
    const { error: err } = await createClient().rpc("submit_review", { p_request: requestId, p_rating: rating, p_tags: tags, p_text: text, p_private: note });
    setBusy(false);
    if (err) {
      const m = err.message;
      setError(m.includes("please remove") ? CONTACT_ERROR : m.includes("1,000") ? "Keep it under 1,000 characters" : m.includes("time is up") ? "The review time has ended." : "Couldn't send. Please try again.");
      if (!m.includes("please remove") && !m.includes("1,000")) await onDone();
      return;
    }
    await onDone();
  }

  return (
    <form onSubmit={send} noValidate className="space-y-4">
      <h2 className="text-lg font-bold">How was {other}?</h2>
      <p id="rating-label" className="text-base font-semibold">Rating</p>
      {/* Radio pattern: one tab stop, arrow keys move and select. */}
      <div role="radiogroup" aria-labelledby="rating-label" aria-describedby={error ? "review-error" : undefined} className="-mt-3 flex gap-1"
        onKeyDown={(e) => {
          const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = Math.min(5, Math.max(1, (rating || (step > 0 ? 0 : 6)) + step));
          setRating(next);
          setError(undefined);
          e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next - 1]?.focus();
        }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
            tabIndex={rating ? (rating === n ? 0 : -1) : n === 1 ? 0 : -1}
            onClick={() => (setRating(n), setError(undefined))} className="rounded-md p-1 focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none">
            <Star aria-hidden className={cn("size-8", n <= rating ? "fill-current text-foreground" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <p id="tags-label" className="text-base font-semibold">What went well? (optional)</p>
      <div role="group" aria-labelledby="tags-label" className="-mt-3 flex flex-wrap gap-2">
        {list.map((t) => {
          const on = tags.includes(t.key);
          return (
            <button key={t.key} type="button" aria-pressed={on} onClick={() => setTags((x) => (on ? x.filter((k) => k !== t.key) : [...x, t.key]))}
              className={cn("rounded-full border bg-card px-4 py-2 text-base", on && "border-foreground bg-foreground text-background")}>
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="space-y-1">
        <label htmlFor="review-text" className="text-base font-semibold">Comment (optional)</label>
        <Textarea id="review-text" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label htmlFor="review-note" className="text-base font-semibold">Private note to Zakbis (optional)</label>
        <p id="review-note-hint" className="text-[13px] text-muted-foreground">Only Zakbis sees this.</p>
        <Textarea id="review-note" aria-describedby="review-note-hint" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {error && <p id="review-error" role="alert" className="text-base text-destructive">{error}</p>}
      <Button type="submit" className={`${btn} w-full`} disabled={busy}>
        Send review
      </Button>
    </form>
  );
}
