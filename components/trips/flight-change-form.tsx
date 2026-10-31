"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/request/item-fields";
import { createClient } from "@/lib/supabase/client";
import { PROOF_TYPES } from "@/lib/trip-post";
import { cn } from "@/lib/utils";
import { uploadTicket } from "./upload-ticket";

const action = "h-11 rounded-lg px-5 text-base font-semibold";

function friendly(m: string) {
  if (m.includes("dates")) return "Check the dates";
  if (m.includes("passport")) return "Your passport must be valid until you land";
  if (m.includes("upload your new ticket")) return "Upload your new ticket";
  if (m.includes("already")) return "Zakbis is already checking a change";
  if (m.includes("Contact support")) return "Someone is already meeting you in Addis. Contact support.";
  return "Couldn't send. Please try again.";
}

/** A traveler with paid orders asks Zakbis to move or cancel the trip; an admin decides and receivers are told. */
export function FlightChangeForm({ tripId, onDone, onBack }: { tripId: string; onDone: () => Promise<void>; onBack: () => void }) {
  const [kind, setKind] = useState<"moved" | "cancelled">("moved");
  const [shopBy, setShopBy] = useState("");
  const [arrival, setArrival] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "moved" && (!shopBy || !arrival)) return setError("Check the dates");
    if (kind === "moved" && !file) return setError("Upload your new ticket");
    setBusy(true);
    setError(undefined);
    let proof: string | null = null;
    if (file) {
      const up = await uploadTicket(file);
      if ("error" in up) return (setBusy(false), setError(up.error));
      proof = up.path;
    }
    const { error: err } = await createClient().rpc("request_flight_change", {
      p_trip: tripId, p_kind: kind, p_shop_by: kind === "moved" ? shopBy : null, p_arrival: kind === "moved" ? arrival : null, p_proof: proof,
    });
    setBusy(false);
    if (err) return setError(friendly(err.message));
    await onDone();
  }

  return (
    <form onSubmit={send} noValidate className="mt-4 space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-bold">My flight changed</h2>
      <div role="radiogroup" aria-label="What happened" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {([["moved", "Moved to a new date"], ["cancelled", "Cancelled"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => (setKind(k), setError(undefined))}
            className={cn("min-h-11 rounded-lg px-2 text-base font-semibold", kind === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {kind === "moved" && (
        <>
          <Field id="fc-shop" label="New shop-by date">
            <Input id="fc-shop" type="date" value={shopBy} onChange={(e) => setShopBy(e.target.value)} />
          </Field>
          <Field id="fc-arrival" label="New landing date">
            <Input id="fc-arrival" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </Field>
        </>
      )}
      <label className="flex h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed px-3 text-center text-base font-semibold focus-within:ring-3 focus-within:ring-ring/20">
        {file?.name ?? (kind === "moved" ? "New ticket" : "Airline notice (optional)")}
        <input type="file" accept={PROOF_TYPES.join(",")} className="sr-only" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setError(undefined))} />
      </label>
      <p className="text-[13px] text-muted-foreground">Zakbis checks it, then tells your receivers. They can keep their order or get a full refund.</p>
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className={action} disabled={busy}>
          Send to Zakbis
        </Button>
        <Button type="button" variant="outline" className={action} onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
