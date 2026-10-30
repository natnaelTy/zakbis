"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, invalidProps } from "@/components/request/item-fields";
import { TakeHomeLine, useFeePct } from "@/components/orders/take-home";
import { PersonReviews } from "@/components/reviews/person-reviews";
import { VerificationStatus } from "@/components/traveler/verification-status";
import { createClient } from "@/lib/supabase/client";
import { etb, parseEtb } from "@/lib/money";
import { countryLabel } from "@/lib/open-requests";
import { cn } from "@/lib/utils";
import { loadTravelerView } from "../traveler-data";

type View = Awaited<ReturnType<typeof loadTravelerView>>;

export function MakeOffer({ id }: { id: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>();
  const [failed, setFailed] = useState(false);
  const [tripId, setTripId] = useState<string>();
  const [reward, setReward] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const feePct = useFeePct();
  useEffect(() => void loadTravelerView(id).then(setView, () => setFailed(true)), [id]);

  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load this request. Please reload.
      </p>
    );
  if (!view) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (!view.ready) return <div className="mt-4"><VerificationStatus verification={view.verification} /></div>;
  if (view.alreadyOffered)
    return (
      <p className="mt-6 text-base">
        You already offered on this request.{" "}
        <Link href={`/orders/requests/${id}`} className="font-semibold text-brand-text underline-offset-4 hover:underline">
          See your offer
        </Link>
      </p>
    );
  const r = view.requests[0];
  if (!r) return <p className="mt-6 text-base text-muted-foreground">This request is no longer open for your trips.</p>;

  const trips = view.tripsFor(r);
  const chosen = tripId ?? trips[0]?.id;
  const thumb = r.screenshot_path ? createClient().storage.from("screenshots").getPublicUrl(r.screenshot_path).data.publicUrl : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const p_reward = parseEtb(reward);
    if (!p_reward) return setError("Enter a reward in ETB");
    setBusy(true);
    const { error: err } = await createClient().rpc("make_offer", { p_request: id, p_trip: chosen, p_reward });
    setBusy(false);
    if (!err) return router.push(`/orders/requests/${id}`);
    setError(err.message.includes("already") ? "You already offered on this request" : err.message.includes("not open") ? "This request just closed." : "Couldn't send. Please try again.");
  }

  return (
    <>
      <div className="flex gap-3 pt-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- public product screenshot */}
        {thumb && <img src={thumb} alt="" className="size-16 shrink-0 rounded-lg border object-cover" />}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">
            {r.item_name}
            {r.quantity > 1 && ` × ${r.quantity}`}
          </h1>
          <p className="text-base text-muted-foreground">For {r.receiverName}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        <dt className="text-muted-foreground">Item</dt>
        <dd>≈ {etb(r.item_etb)}</dd>
        <dt className="text-muted-foreground">From</dt>
        <dd>{r.countries.map((c) => countryLabel[c]).join(", ")}</dd>
        <dt className="text-muted-foreground">Needed by</dt>
        <dd>{format(parseISO(r.needed_by), "d MMM yyyy")}</dd>
        {r.item_url && (
          <>
            <dt className="text-muted-foreground">Link</dt>
            <dd>
              <a href={r.item_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-text underline-offset-4 hover:underline">
                View item
              </a>
            </dd>
          </>
        )}
        {r.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="break-words">{r.notes}</dd>
          </>
        )}
      </dl>

      <form onSubmit={send} noValidate className="mt-6 space-y-4 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-bold">Make an offer</h2>
        {trips.length > 1 && (
          <div role="radiogroup" aria-label="Your trip" className="flex flex-wrap gap-2">
            {trips.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={chosen === t.id}
                onClick={() => setTripId(t.id)}
                className={cn("rounded-full border bg-card px-4 py-2 text-base", chosen === t.id && "border-foreground bg-foreground text-background")}
              >
                {countryLabel[t.origin_country]} · lands {format(parseISO(t.arrival_date), "d MMM")}
              </button>
            ))}
          </div>
        )}
        <Field id="reward" label="Your reward (ETB)" error={error}>
          <Input id="reward" inputMode="numeric" value={reward} onChange={(e) => setReward(e.target.value)} {...invalidProps(error, "reward")} />
        </Field>
        <TakeHomeLine raw={reward} pct={feePct} />
        <Button type="submit" disabled={busy || !chosen} className="h-12 w-full rounded-lg text-base font-bold">
          Send offer
        </Button>
      </form>
      <PersonReviews personId={r.receiver_id} side="receiver" name={r.receiverName} />
    </>
  );
}
