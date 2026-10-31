"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: string; trip_id: string; kind: "moved" | "cancelled"; traveler_name: string; origin_city: string; old_shop_by: string; old_arrival: string;
  new_shop_by: string | null; new_arrival: string | null; proof_path: string | null; paid_orders: number; created_at: string;
};

const btn = "h-11 rounded-lg px-5 text-base font-semibold";
const day = (d: string) => format(parseISO(d), "d MMM");

/** Travelers with paid orders asking to move or cancel their trip; nothing renders when there are none. */
export function FlightChanges() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = useCallback(async () => {
    const { data } = await createClient().rpc("flight_changes_to_check");
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => void load(), [load]);
  if (!rows.length) return null;
  return (
    <section className="mt-4">
      <h2 className="text-lg font-bold">Flight changes</h2>
      <ul className="mt-2 space-y-3">
        {rows.map((r) => (
          <li key={r.id}>
            <ChangeCard row={r} onDone={load} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangeCard({ row: r, onDone }: { row: Row; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean) {
    if (!approve && !reason.trim()) return setError("Write a reason the traveler will see");
    setBusy(true);
    const { error: err } = await createClient().rpc("decide_flight_change", { p_change: r.id, p_approve: approve, p_reason: approve ? null : reason.trim() });
    setBusy(false);
    if (err) setError("This changed in the meantime. Here's the latest.");
    await onDone();
  }
  async function viewTicket() {
    if (!r.proof_path) return;
    const { data } = await createClient().storage.from("tickets").createSignedUrl(r.proof_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-base font-bold">
        {r.traveler_name} · {r.origin_city} <span className="font-normal text-muted-foreground">({r.kind === "moved" ? "Moved" : "Cancelled"})</span>
      </p>
      <p className="text-base">
        {r.kind === "moved" && r.new_shop_by && r.new_arrival
          ? `Shop by ${day(r.old_shop_by)} → ${day(r.new_shop_by)}, lands ${day(r.old_arrival)} → ${day(r.new_arrival)}`
          : `Was landing ${day(r.old_arrival)}. Every paid order will be refunded.`}
      </p>
      <p className="text-[13px] text-muted-foreground">
        {r.paid_orders} paid {r.paid_orders === 1 ? "order" : "orders"} affected
      </p>
      {r.proof_path && (
        <button type="button" className="text-base font-medium text-brand-text underline-offset-4 hover:underline" onClick={() => void viewTicket()}>
          {r.kind === "moved" ? "View new ticket" : "View airline notice"}
        </button>
      )}
      {mode === "reject" ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${r.id}`} className="text-base font-semibold">Reason for the traveler</label>
          <Textarea id={`reason-${r.id}`} value={reason} onChange={(e) => (setReason(e.target.value), setError(undefined))} />
          <div className="flex gap-2">
            <Button variant="destructive" className={btn} disabled={busy} onClick={() => void decide(false)}>Reject</Button>
            <Button variant="outline" className={btn} onClick={() => setMode(null)}>Back</Button>
          </div>
        </div>
      ) : mode === "approve" ? (
        <div role="alertdialog" aria-label="Approve?" className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{r.kind === "moved" ? "Move the trip and tell receivers?" : "Cancel the trip and refund every paid order?"}</span>
          <Button className={btn} disabled={busy} onClick={() => void decide(true)}>Yes</Button>
          <Button variant="outline" className={btn} onClick={() => setMode(null)}>Back</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button className={btn} onClick={() => (setError(undefined), setMode("approve"))}>Approve</Button>
          <Button variant="outline" className={btn} onClick={() => (setError(undefined), setMode("reject"))}>Reject</Button>
        </div>
      )}
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    </article>
  );
}
