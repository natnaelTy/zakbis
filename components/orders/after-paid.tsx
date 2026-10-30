"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { etb } from "@/lib/money";
import { buyHint, ITEM_REASONS, itemReasonLabel, timeLeft, type Side } from "@/lib/negotiation";
import { displayPhone } from "@/lib/phone";
import { btn, ReasonPicker, type Act } from "./offer-card";
import { PhoneCheck } from "./phone-check";
import { PROOF_TYPES, uploadProof } from "./upload-proof";

export type AfterPaidRequest = {
  id: string; status: string; trip_id: string | null; item_name: string; total_etb: number | null; payout_etb: number | null;
  receipt_path: string | null; item_photo_path: string | null; photo_status: "pending" | "ok" | "rejected" | null; photo_reason: string | null;
  photo_due_at: string | null; buy_due_at: string | null; hold: string | null; refund_decided_at: string | null;
};

type Extra = { shopBy?: string; arrival?: string; receipt?: string; photo?: string; phone?: string | null; code?: string; confirmed?: boolean; refunded?: boolean };

const card = "mt-5 space-y-3 rounded-xl border bg-card p-4";
const dayOf = (d?: string) => (d ? format(parseISO(d), "d MMM") : "");

/** Everything after payment, from either side: buying, the photo check, In Addis, the handover, payout or refund. */
export function AfterPaid({ req: r, viewer, travelerName, receiverName, now, busy, act, reload }: {
  req: AfterPaidRequest; viewer: Side; travelerName: string; receiverName: string; now: Date; busy: boolean; act: Act; reload: () => Promise<void>;
}) {
  const [x, setX] = useState<Extra>({});
  const [mode, setMode] = useState<"reject" | "cant_swap" | "problem" | null>(null);

  const loadExtra = useCallback(async () => {
    const supabase = createClient();
    const sign = (p: string | null) =>
      p ? supabase.storage.from("proofs").createSignedUrl(p, 3600).then(({ data }) => data?.signedUrl) : Promise.resolve(undefined);
    const landed = ["landed", "delivered", "paid_out"].includes(r.status);
    const [trip, receipt, photo, phone, code, confirmed, pay] = await Promise.all([
      r.trip_id ? supabase.from("trips").select("shop_by, arrival_date").eq("id", r.trip_id).maybeSingle() : Promise.resolve({ data: null }),
      sign(r.receipt_path),
      sign(r.item_photo_path),
      landed ? supabase.rpc("counterpart_phone", { p_request: r.id }) : Promise.resolve({ data: null }),
      viewer === "receiver" && r.status === "landed" ? supabase.from("handover_codes").select("code").eq("request_id", r.id).maybeSingle() : Promise.resolve({ data: null }),
      viewer === "receiver" ? supabase.rpc("my_phone_confirmed") : Promise.resolve({ data: true }),
      r.refund_decided_at ? supabase.from("payments").select("status").eq("request_id", r.id).eq("kind", "escrow").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setX({
      shopBy: trip.data?.shop_by, arrival: trip.data?.arrival_date, receipt, photo,
      phone: (phone.data as string | null) ?? null, code: (code.data as { code: string } | null)?.code,
      confirmed: !!confirmed.data, refunded: (pay.data as { status: string } | null)?.status === "refunded",
    });
  }, [r.id, r.status, r.trip_id, r.receipt_path, r.item_photo_path, r.refund_decided_at, viewer]);
  useEffect(() => void loadExtra(), [loadExtra]);
  const done = async () => (await reload(), await loadExtra());

  const isTraveler = viewer === "traveler";
  const other = isTraveler ? receiverName : travelerName;

  if (r.status === "cancelled")
    return (
      <p className={`${card} text-base font-semibold`}>
        {isTraveler ? "Cancelled" : x.refunded ? "Cancelled, refunded" : `Refund on its way: ${etb(r.total_etb ?? 0)}`}
      </p>
    );
  if (r.hold) return <p className={`${card} text-base font-semibold`}>Zakbis is checking this order. We&apos;ll be in touch.</p>;

  return (
    <>
      {r.status === "paid" &&
        (isTraveler ? (
          <BoughtForm title="Mark bought" hint={buyHint(r.buy_due_at, x.shopBy, now)} submit="Mark bought" busy={busy}
            onSend={(receipt, photo) => act("mark_bought", { p_request: r.id, p_receipt: receipt, p_photo: photo })} />
        ) : (
          <p className={`${card} text-base font-semibold`}>{travelerName} is shopping for {r.item_name}.</p>
        ))}

      {(r.receipt_path || r.item_photo_path) && r.status !== "paid" && (
        <section className={card} aria-label="Receipt and item photo">
          <div className="grid grid-cols-2 gap-3">
            {[["Item photo", x.photo], ["Receipt", x.receipt]].map(([label, url]) => (
              <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                {url ? <img src={url} alt={label} className="aspect-square w-full rounded-lg border object-cover" /> : <div className="aspect-square rounded-lg border bg-muted" />}
                <span className="text-[13px] text-muted-foreground">{label}</span>
              </a>
            ))}
          </div>

          {r.status === "purchased" && r.photo_status === "pending" &&
            (isTraveler ? (
              <p className="text-base text-muted-foreground">Waiting for {receiverName} to check the photo.</p>
            ) : mode === "reject" ? (
              <ReasonPicker label="Not right" reasons={ITEM_REASONS} busy={busy} onBack={() => setMode(null)}
                onConfirm={(reason) => void act("check_item", { p_request: r.id, p_ok: false, p_reason: reason })} />
            ) : (
              <>
                <p className="text-base font-semibold">
                  Is this right?{r.photo_due_at && <span className="font-normal text-muted-foreground"> Answer within {timeLeft(r.photo_due_at, now)}</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button className={btn} disabled={busy} onClick={() => void act("check_item", { p_request: r.id, p_ok: true })}>
                    Looks right
                  </Button>
                  <Button variant="outline" className={`${btn} text-destructive`} onClick={() => setMode("reject")}>
                    Not right
                  </Button>
                </div>
              </>
            ))}
          {r.status === "purchased" && r.photo_status === "rejected" && (
            <p className="text-base font-semibold">
              {isTraveler ? `${receiverName} says it isn't right` : "You said it isn't right"}: {itemReasonLabel(r.photo_reason)}
            </p>
          )}
        </section>
      )}

      {r.status === "purchased" && r.photo_status === "rejected" &&
        (isTraveler ? (
          mode === "cant_swap" ? (
            <div role="alertdialog" aria-labelledby="cant-swap-q" className={card}>
              <p id="cant-swap-q" className="text-base font-semibold">
                Cancel the order? {receiverName} gets a full refund and you keep the item.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" className={btn} disabled={busy} onClick={() => void act("cant_swap", { p_request: r.id })}>
                  Can&apos;t swap
                </Button>
                <Button variant="outline" className={btn} onClick={() => setMode(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <>
              <BoughtForm title="Swap it" hint={buyHint(r.buy_due_at, x.shopBy, now)} submit="Send swap" busy={busy}
                onSend={(receipt, photo) => act("swap_item", { p_request: r.id, p_receipt: receipt, p_photo: photo })} />
              <Button variant="outline" className={`${btn} mt-3 text-destructive`} onClick={() => setMode("cant_swap")}>
                Can&apos;t swap
              </Button>
            </>
          )
        ) : (
          <p className={`${card} text-base`}>Waiting for {travelerName} to swap it.</p>
        ))}

      {r.status === "purchased" && r.photo_status === "ok" &&
        (isTraveler ? (
          x.arrival && x.arrival > format(now, "yyyy-MM-dd") ? (
            <p className={`${card} text-base`}>Tap &quot;I&apos;m in Addis&quot; here from {dayOf(x.arrival)}.</p>
          ) : (
            <PhoneCheck requestId={r.id} title="I'm in Addis" onDone={done}
              hint="We'll text a code to your Ethiopian number. No Ethiopian SIM? Buy one at Bole arrivals with your passport." />
          )
        ) : (
          <p className={`${card} text-base`}>{travelerName} is bringing {r.item_name}{x.arrival && `, due ${dayOf(x.arrival)}`}.</p>
        ))}

      {viewer === "receiver" && !x.confirmed && ["paid", "purchased", "landed"].includes(r.status) && (
        <div className="mt-5">
          <PhoneCheck
            title="Confirm your number"
            hint={r.status === "landed" ? `${travelerName} is in Addis. Confirm yours to see their number.` : `You'll see ${travelerName}'s number once they're in Addis.`}
            onDone={done}
          />
        </div>
      )}

      {r.status === "landed" && (
        <section className={card} aria-label="Handover">
          <h2 className="text-lg font-bold">Meet {other}</h2>
          {x.phone ? (
            <p className="text-base">
              Call {other} on{" "}
              <a href={`tel:+${x.phone}`} className="font-semibold text-brand-text underline-offset-4 hover:underline">
                {displayPhone(x.phone)}
              </a>
              . Pick a public place to meet for safety.
            </p>
          ) : (
            <p className="text-base text-muted-foreground">
              {isTraveler ? `${receiverName} hasn't confirmed their number yet. We've asked them.` : "Confirm your number above to see theirs."}
            </p>
          )}
          {isTraveler ? (
            <HandoverInput requestId={r.id} onDone={done} />
          ) : (
            <>
              {x.code && (
                <div>
                  <p className="text-[13px] text-muted-foreground">Handover code</p>
                  <p className="text-3xl font-bold tracking-[0.3em] tabular-nums">{x.code}</p>
                  <p className="text-base text-muted-foreground">Give it to {travelerName} only once you have the item.</p>
                </div>
              )}
              {mode === "problem" ? (
                <div className="space-y-2">
                  <p className="text-base font-semibold">What&apos;s wrong?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" className={btn} disabled={busy} onClick={() => void act("report_problem", { p_request: r.id, p_kind: "item_problem" })}>
                      Problem with the item
                    </Button>
                    <Button variant="outline" className={btn} disabled={busy} onClick={() => void act("report_problem", { p_request: r.id, p_kind: "cant_reach" })}>
                      I can&apos;t reach {travelerName}
                    </Button>
                    <Button variant="ghost" className={btn} onClick={() => setMode(null)}>
                      Back
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className={`${btn} text-destructive`} onClick={() => setMode("problem")}>
                  Report a problem
                </Button>
              )}
            </>
          )}
        </section>
      )}

      {r.status === "delivered" && (
        <p className={`${card} text-base font-semibold`}>{isTraveler ? `Delivered. We'll send you ${etb(r.payout_etb ?? 0)}.` : "Delivered"}</p>
      )}
      {r.status === "paid_out" && (
        <p className={`${card} text-base font-semibold`}>{isTraveler ? `Paid out ${etb(r.payout_etb ?? 0)}` : "Delivered"}</p>
      )}
    </>
  );
}

/** Two required pictures, the receipt and the item, then one database action. */
function BoughtForm({ title, hint, submit, busy, onSend }: {
  title: string; hint?: string | false; submit: string; busy: boolean; onSend: (receipt: string, photo: string) => Promise<void>;
}) {
  const [files, setFiles] = useState<{ receipt?: File; photo?: File }>({});
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!files.receipt || !files.photo) return setError("Add the receipt and a photo of the item");
    setSending(true);
    setError(undefined);
    const [receipt, photo] = await Promise.all([uploadProof(files.receipt), uploadProof(files.photo)]);
    setSending(false);
    if ("error" in receipt) return setError(receipt.error);
    if ("error" in photo) return setError(photo.error);
    await onSend(receipt.path, photo.path);
  }

  return (
    <form onSubmit={send} noValidate className={card}>
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
      {(["receipt", "photo"] as const).map((k) => (
        <label key={k} className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed text-base font-semibold focus-within:ring-3 focus-within:ring-ring/20">
          {files[k]?.name ?? (k === "receipt" ? "Add receipt photo" : "Add item photo")}
          <input type="file" accept={PROOF_TYPES.join(",")} className="sr-only" onChange={(e) => (setFiles((f) => ({ ...f, [k]: e.target.files?.[0] })), setError(undefined))} />
        </label>
      ))}
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
      <Button type="submit" className={`${btn} w-full`} disabled={busy || sending}>
        {submit}
      </Button>
    </form>
  );
}

/** The traveler types the receiver's code; a wrong guess is counted by the database. */
function HandoverInput({ requestId, onDone }: { requestId: string; onDone: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<React.ReactNode>();
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(undefined);
    const { data, error } = await createClient().rpc("deliver", { p_id: requestId, p_code: code.trim() });
    setBusy(false);
    if (data === "delivered") return onDone();
    if (data === "wrong_code") return setMessage("That code isn't right");
    if (data === "locked") return setMessage("Too many tries. Zakbis will contact you.");
    if (error?.message.includes("payout account"))
      return setMessage(
        <>
          Add a payout account first.{" "}
          <Link href="/profile/payout" className="font-semibold underline-offset-4 hover:underline">
            Add it
          </Link>
        </>,
      );
    setMessage("Couldn't confirm. Please reload and try again.");
    await onDone();
  }

  return (
    <form onSubmit={send} noValidate className="space-y-2">
      <label htmlFor="handover" className="text-base font-semibold">
        Handover code
      </label>
      <Input id="handover" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} aria-describedby={message ? "handover-error" : undefined} />
      {message && <p id="handover-error" role="alert" className="text-base text-destructive">{message}</p>}
      <Button type="submit" className={btn} disabled={busy || code.trim().length < 6}>
        Confirm handover
      </Button>
    </form>
  );
}
