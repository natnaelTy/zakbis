"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { etb, parseEtb } from "@/lib/money";
import { counterError, DECLINE_REASONS, MAX_SUGGESTIONS, offerActions, suggestionError, timeLeft, type OfferView, type Side } from "@/lib/negotiation";
import { cn } from "@/lib/utils";

export type Offer = OfferView & { id: string; traveler_id: string; trip_id: string; request_id: string };
export type OfferEvent = { offer_id: string; actor: Side | null; kind: string; reward_etb: number | null; created_at: string };
/** Runs one database action; resolves to an error message or nothing. */
export type Act = (fn: string, args: Record<string, unknown>) => Promise<void>;

export const btn = "h-11 rounded-lg px-5 text-base font-semibold";

function historyLine(e: OfferEvent, viewer: Side, names: Record<Side, string>) {
  const who = e.actor === viewer ? "You" : e.actor ? names[e.actor] : "";
  const amount = e.reward_etb ? etb(e.reward_etb) : "";
  switch (e.kind) {
    case "price": return `${who}: ${amount}`;
    case "suggest": return `${who} suggested ${amount}`;
    case "accept": return `${who} accepted ${amount}`;
    case "decline": return `${who} passed`;
    case "withdraw": return `${who} withdrew`;
    case "expire": return "Time ran out";
    default: return "Closed";
  }
}

/** Reason chips, then a confirm button: declining never takes free text (keeps contact details off the platform). */
export function ReasonPicker({ label, busy, onConfirm, onBack }: { label: string; busy: boolean; onConfirm: (reason: string) => void; onBack: () => void }) {
  const [reason, setReason] = useState<string>();
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold">Why?</p>
      <div role="radiogroup" aria-label="Reason" className="flex flex-wrap gap-2">
        {DECLINE_REASONS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={reason === r.key}
            onClick={() => setReason(r.key)}
            className={cn("rounded-full border bg-card px-4 py-2 text-base", reason === r.key && "border-foreground bg-foreground text-background")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="destructive" className={btn} disabled={!reason || busy} onClick={() => reason && onConfirm(reason)}>
          {label}
        </Button>
        <Button variant="outline" className={btn} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

export function OfferCard({
  offer, events, viewer, names, itemEtb, now, busy, act,
}: {
  offer: Offer; events: OfferEvent[]; viewer: Side; names: Record<Side, string>; itemEtb: number; now: Date; busy: boolean; act: Act;
}) {
  const [mode, setMode] = useState<"suggest" | "counter" | "decline" | "withdraw" | null>(null);
  const [amount, setAmount] = useState("");
  const [tried, setTried] = useState(false);
  const actions = offerActions(offer, viewer, now);
  const has = (a: string) => actions.includes(a as never);
  const price = offer.status === "accepted" && offer.suggestion_etb ? offer.suggestion_etb : offer.reward_etb;

  const inputError = mode === "suggest" ? suggestionError(amount, offer.reward_etb, offer.suggestions_used) : mode === "counter" ? counterError(amount, offer.suggestion_etb ?? 0) : undefined;
  const shown = tried ? inputError : undefined;

  function sendAmount(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (inputError) return;
    const p_reward = parseEtb(amount);
    void act(mode === "suggest" ? "suggest_reward" : "counter_offer", { p_offer: offer.id, p_reward }).then(() => (setMode(null), setAmount(""), setTried(false)));
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label={`Offer from ${names.traveler}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold">{viewer === "receiver" ? names.traveler : "Your offer"}</h3>
        {offer.status === "pending" && (
          <span className="text-[13px] text-muted-foreground">
            {offer.turn === viewer ? "Answer" : `${names[offer.turn]} answers`} within {timeLeft(offer.due_at, now)}
          </span>
        )}
      </div>

      <ol className="space-y-1 text-base text-muted-foreground">
        {events.map((e, i) => (
          <li key={i}>{historyLine(e, viewer, names)}</li>
        ))}
      </ol>

      <dl className="flex justify-between gap-4 border-t border-dashed pt-2 text-base">
        <dt className="font-semibold">{offer.turn === "traveler" && offer.suggestion_etb && offer.status === "pending" ? "Total if accepted" : "Total"}</dt>
        <dd className="font-bold tabular-nums">{etb(itemEtb + (offer.status === "pending" && offer.turn === "traveler" && offer.suggestion_etb ? offer.suggestion_etb : price))}</dd>
      </dl>

      {mode === "suggest" || mode === "counter" ? (
        <form onSubmit={sendAmount} noValidate className="space-y-2">
          <label htmlFor={`amt-${offer.id}`} className="text-base font-semibold">
            {mode === "suggest" ? "Your reward (ETB)" : "Your new price (ETB)"}
          </label>
          <Input id={`amt-${offer.id}`} inputMode="numeric" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!!shown} aria-describedby={shown ? `amt-${offer.id}-error` : undefined} />
          {shown && (
            <p id={`amt-${offer.id}-error`} className="text-base text-destructive">
              {shown}
            </p>
          )}
          {mode === "suggest" && <p className="text-[13px] text-muted-foreground">{MAX_SUGGESTIONS - offer.suggestions_used} suggestions left</p>}
          <div className="flex gap-2">
            <Button type="submit" className={btn} disabled={busy}>
              Send
            </Button>
            <Button type="button" variant="outline" className={btn} onClick={() => (setMode(null), setTried(false))}>
              Back
            </Button>
          </div>
        </form>
      ) : mode === "decline" ? (
        <div className="flex gap-2">
          <Button variant="destructive" className={btn} disabled={busy} onClick={() => void act("decline_offer", { p_offer: offer.id })}>
            Decline {names.traveler}&apos;s offer
          </Button>
          <Button variant="outline" className={btn} onClick={() => setMode(null)}>
            Back
          </Button>
        </div>
      ) : mode === "withdraw" ? (
        <ReasonPicker label="Withdraw offer" busy={busy} onBack={() => setMode(null)} onConfirm={(r) => void act("withdraw_offer", { p_offer: offer.id, p_reason: r })} />
      ) : (
        actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {has("accept") && (
              <Button className={btn} disabled={busy} onClick={() => void act("accept_offer", { p_offer: offer.id })}>
                Accept {etb(offer.reward_etb)}
              </Button>
            )}
            {has("accept_suggestion") && offer.suggestion_etb && (
              <Button className={btn} disabled={busy} onClick={() => void act("accept_suggestion", { p_offer: offer.id })}>
                Accept {etb(offer.suggestion_etb)}
              </Button>
            )}
            {has("suggest") && (
              <Button variant="outline" className={btn} onClick={() => setMode("suggest")}>
                Suggest lower
              </Button>
            )}
            {has("counter") && (
              <Button variant="outline" className={btn} onClick={() => setMode("counter")}>
                Name a price
              </Button>
            )}
            {has("decline") && (
              <Button variant="outline" className={`${btn} text-destructive`} onClick={() => setMode("decline")}>
                Decline
              </Button>
            )}
            {has("withdraw") && (
              <Button variant="outline" className={`${btn} text-destructive`} onClick={() => setMode("withdraw")}>
                Withdraw
              </Button>
            )}
          </div>
        )
      )}
    </section>
  );
}
