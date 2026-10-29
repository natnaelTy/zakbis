"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { btn, OfferCard, ReasonPicker, type Offer, type OfferEvent } from "@/components/orders/offer-card";
import { PaymentSection, type LatestPayment } from "@/components/orders/payment-section";
import { TakeHomeLine, useFeePct } from "@/components/orders/take-home";
import { createClient } from "@/lib/supabase/client";
import { etb, parseEtb } from "@/lib/money";
import { countryLabel, type Country } from "@/lib/open-requests";
import { reasonLabel, timeLeft, type Side } from "@/lib/negotiation";

export type Request = {
  id: string; kind: "trip" | "open"; receiver_id: string; traveler_id: string | null; trip_id: string | null; status: string;
  item_name: string; item_url: string | null; screenshot_path: string | null; quantity: number; notes: string | null;
  unit_price: number; currency: string; item_etb: number; reward_etb: number | null; total_etb: number | null;
  countries: Country[] | null; needed_by: string | null; answer_due_at: string | null; payment_due_at: string | null; decline_reason: string | null;
};

// Database messages a person can act on; anything else is a generic failure. The page reloads either way.
function friendly(m: string) {
  if (m.includes("time is up")) return "Time's up, so this has closed.";
  if (m.includes("no longer") || m.includes("not your turn")) return "This changed in the meantime. Here's the latest.";
  if (m.includes("please remove")) return "Please remove phone numbers, @handles, emails and links.";
  if (m.includes("already")) return "You already offered on this request.";
  return "Couldn't save. Please try again.";
}

/** One request seen by its receiver or by a traveler on it: details, offers with their history, and whatever the viewer can do now. */
export function OrderDetail({ id }: { id: string }) {
  const { requireAuth, sheet } = useRequireAuth("Sign in to see this order");
  const [uid, setUid] = useState<string | null>();
  const [req, setReq] = useState<Request | null>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [events, setEvents] = useState<OfferEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [receiverName, setReceiverName] = useState("Receiver");
  const [payment, setPayment] = useState<LatestPayment>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [mode, setMode] = useState<"price" | "decline" | "cancel" | null>(null);
  const [price, setPrice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const feePct = useFeePct();

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setUid(null);
    setUid(auth.user.id);
    const { data: r, error } = await supabase.from("requests").select("*").eq("id", id).maybeSingle();
    if (error) return setFailed(true);
    if (!r) return setReq(null);
    const { data: o } = await supabase.from("offers").select("*").eq("request_id", id).order("created_at");
    const list = (o as Offer[] | null) ?? [];
    const travelerIds = [...new Set([...list.map((x) => x.traveler_id), r.traveler_id].filter(Boolean))] as string[];
    const [ev, tn, rp, pay] = await Promise.all([
      list.length ? supabase.from("offer_events").select("*").in("offer_id", list.map((x) => x.id)).order("created_at") : Promise.resolve({ data: [] }),
      supabase.from("traveler_names").select("traveler_id, given_name").in("traveler_id", travelerIds),
      supabase.from("profiles").select("first_name").eq("id", r.receiver_id).maybeSingle(),
      supabase.from("payments").select("id, status, reject_reason").eq("request_id", id).eq("kind", "escrow").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setReq(r as Request);
    setOffers(list);
    setEvents((ev.data as OfferEvent[] | null) ?? []);
    setNames(Object.fromEntries((tn.data ?? []).map((n) => [n.traveler_id, n.given_name])));
    setReceiverName(rp.data?.first_name ?? "Receiver");
    setPayment((pay.data as LatestPayment) ?? null);
    setMode(null);
  }, [id]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (uid === null) void requireAuth(() => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open the sign-in sheet once when signed out
  }, [uid]);

  async function act(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setMessage(undefined);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    await load();
    if (error) setMessage(friendly(error.message));
  }

  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load this order. Please reload.
      </p>
    );
  if (uid === null)
    return (
      <div className="mt-6 space-y-4">
        <p className="text-base text-muted-foreground">Sign in to see this order.</p>
        <Button className="h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(() => void load())}>
          Sign in
        </Button>
        {sheet}
      </div>
    );
  if (req === undefined || uid === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (req === null) return <p className="mt-6 text-base text-muted-foreground">Order not found</p>;

  const r = req;
  const viewer: Side = uid === r.receiver_id ? "receiver" : "traveler";
  const travelerName = (tid: string | null) => (tid && names[tid]) || "Traveler";
  const mine = offers.find((o) => o.traveler_id === uid);
  const shownOffers = viewer === "receiver" ? offers.filter((o) => o.status === "pending" || o.status === "accepted" || r.kind === "trip") : mine ? [mine] : [];
  const priceless = r.kind === "trip" && offers.length === 0;
  const thumb = r.screenshot_path ? createClient().storage.from("screenshots").getPublicUrl(r.screenshot_path).data.publicUrl : null;
  const closed = ["declined", "expired", "cancelled"].includes(r.status);
  const canCancel = viewer === "receiver" && (r.status === "open" || (r.status === "awaiting_payment" && payment?.status !== "pending"));

  function closedLine() {
    if (viewer === "traveler" && mine && mine.status !== "accepted" && mine.status !== "pending") {
      // A closed offer: another traveler won, the receiver cancelled, or the traveler's own trip changed.
      const closedWhy = r.traveler_id && r.traveler_id !== uid ? "The receiver chose another traveler" : r.status === "cancelled" ? "The receiver cancelled" : "Your trip changed, so this offer closed";
      return { closed: closedWhy, rejected: `${receiverName} passed on your price`, withdrawn: "You withdrew your offer", expired: "Time ran out" }[mine.status];
    }
    if (r.status === "declined") return r.decline_reason ? `${viewer === "traveler" ? "You" : travelerName(r.traveler_id)} declined: ${reasonLabel(r.decline_reason)}` : "Declined";
    if (r.status === "expired") return "No answer in time";
    if (r.status === "cancelled") return "Cancelled";
  }
  const closedText = closed || (viewer === "traveler" && mine && mine.status !== "accepted" && mine.status !== "pending") ? closedLine() : undefined;

  function sendPrice(e: React.FormEvent) {
    e.preventDefault();
    const p_reward = parseEtb(price);
    if (!p_reward) return setMessage("Enter a reward in ETB");
    void act("make_offer", { p_request: r.id, p_trip: r.trip_id, p_reward });
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
          <p className="text-base text-muted-foreground">
            {viewer === "traveler" ? `For ${receiverName}` : r.kind === "open" ? "Open request" : `From ${travelerName(r.traveler_id)}`}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        <dt className="text-muted-foreground">Item</dt>
        <dd>
          {r.quantity} × {Number(r.unit_price).toLocaleString("en-US")} {r.currency} ≈ {etb(r.item_etb)}
        </dd>
        {r.item_url && (
          <>
            <dt className="text-muted-foreground">Link</dt>
            <dd className="truncate">
              <a href={r.item_url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-text underline-offset-4 hover:underline">
                View item
              </a>
            </dd>
          </>
        )}
        {r.kind === "open" && r.countries && r.needed_by && (
          <>
            <dt className="text-muted-foreground">From</dt>
            <dd>{r.countries.map((c) => countryLabel[c]).join(", ")}</dd>
            <dt className="text-muted-foreground">Needed by</dt>
            <dd>{format(parseISO(r.needed_by), "d MMM yyyy")}</dd>
          </>
        )}
        {r.notes && (
          <>
            <dt className="text-muted-foreground">Notes</dt>
            <dd className="break-words">{r.notes}</dd>
          </>
        )}
        {r.reward_etb && r.total_etb && (
          <>
            <dt className="text-muted-foreground">Reward</dt>
            <dd>{etb(r.reward_etb)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="font-bold">{etb(r.total_etb)}</dd>
          </>
        )}
      </dl>

      {closedText && <p className="mt-5 rounded-xl border bg-muted p-4 text-base font-semibold">Closed: {closedText}</p>}

      {viewer === "traveler" && priceless && r.status === "open" && r.answer_due_at && (
        <section className="mt-5 space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-bold">Your reward</h2>
            <span className="text-[13px] text-muted-foreground">Answer within {timeLeft(r.answer_due_at, now)}</span>
          </div>
          {mode === "decline" ? (
            <ReasonPicker label="Decline request" busy={busy} onBack={() => setMode(null)} onConfirm={(reason) => void act("decline_request", { p_request: r.id, p_reason: reason })} />
          ) : (
            <form onSubmit={sendPrice} noValidate className="space-y-3">
              <Input aria-label="Reward (ETB)" inputMode="numeric" placeholder="Reward in ETB" value={price} onChange={(e) => setPrice(e.target.value)} />
              <TakeHomeLine raw={price} pct={feePct} />
              <div className="flex gap-2">
                <Button type="submit" className={btn} disabled={busy}>
                  Send price
                </Button>
                <Button type="button" variant="outline" className={`${btn} text-destructive`} onClick={() => setMode("decline")}>
                  Decline
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {viewer === "receiver" && priceless && r.status === "open" && r.answer_due_at && (
        <p className="mt-5 text-base text-muted-foreground">
          Waiting for {travelerName(r.traveler_id)} to name a reward (answers within {timeLeft(r.answer_due_at, now)}).
        </p>
      )}
      {viewer === "receiver" && r.kind === "open" && r.status === "open" && shownOffers.length === 0 && (
        <p className="mt-5 text-base text-muted-foreground">No offers yet</p>
      )}

      {shownOffers.length > 0 && (
        <div className="mt-5 space-y-3">
          {shownOffers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              events={events.filter((e) => e.offer_id === o.id)}
              feePct={feePct}
              viewer={viewer}
              names={{ traveler: travelerName(o.traveler_id), receiver: receiverName }}
              itemEtb={r.item_etb}
              now={now}
              busy={busy}
              act={act}
            />
          ))}
        </div>
      )}

      {r.status === "awaiting_payment" && viewer === "receiver" && r.total_etb && (
        <PaymentSection requestId={r.id} total={r.total_etb} dueAt={r.payment_due_at} latest={payment} now={now} onDone={load} />
      )}
      {r.status === "awaiting_payment" && viewer === "traveler" && (
        <p className="mt-5 text-base text-muted-foreground">{payment?.status === "pending" ? "Payment sent. Zakbis is checking it." : `Waiting for ${receiverName} to pay`}</p>
      )}
      {["paid", "purchased", "landed", "delivered", "paid_out"].includes(r.status) && (
        <p className="mt-5 rounded-xl border bg-card p-4 text-base font-semibold">
          {viewer === "receiver" ? `Paid. ${travelerName(r.traveler_id)} will go shopping.` : `Paid. Go shopping for ${r.item_name}.`}
        </p>
      )}

      {canCancel &&
        (mode === "cancel" ? (
          <div role="alertdialog" aria-labelledby="cancel-q" className="mt-5 space-y-3 rounded-xl border bg-card p-4">
            <p id="cancel-q" className="text-base font-semibold">
              Cancel this request?
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" className={btn} disabled={busy} onClick={() => void act("cancel_request", { p_request: r.id })}>
                Cancel request
              </Button>
              <Button variant="outline" className={btn} onClick={() => setMode(null)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className={`${btn} mt-5 text-destructive`} onClick={() => setMode("cancel")}>
            Cancel request
          </Button>
        ))}

      {message && (
        <p role="alert" className="mt-3 text-base text-destructive">
          {message}
        </p>
      )}
    </>
  );
}
