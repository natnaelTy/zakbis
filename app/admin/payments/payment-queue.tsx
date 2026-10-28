"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { etb } from "@/lib/money";

type Row = {
  id: string;
  request_id: string;
  item_name: string;
  quantity: number;
  amount_etb: number;
  method: "telebirr" | "bank";
  proof_path: string;
  created_at: string;
  receiver_name: string;
  traveler_name: string;
  trip_changed: boolean;
  url?: string;
};

export function PaymentQueue() {
  const [rows, setRows] = useState<Row[]>();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("payments_to_check");
    if (error) return setFailed(true);
    const list = (data as Row[] | null) ?? [];
    // Private links that last an hour, long enough for a review session; screenshots are never public.
    const signed = list.length ? await supabase.storage.from("proofs").createSignedUrls(list.map((r) => r.proof_path), 3600) : { data: [] };
    setRows(list.map((r) => ({ ...r, url: signed.data?.find((s) => s.path === r.proof_path)?.signedUrl ?? undefined })));
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) return <p className="mt-4 text-base text-destructive">Couldn&apos;t load payments. Please reload.</p>;
  if (!rows) return <p className="mt-4 text-base text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="mt-4 text-base text-muted-foreground">No payments to check</p>;
  return (
    <ul className="mt-4 space-y-4 pb-8">
      {rows.map((r) => (
        <li key={r.id}>
          <PaymentCard row={r} onDecided={() => setRows((rs) => rs?.filter((x) => x.id !== r.id))} />
        </li>
      ))}
    </ul>
  );
}

function PaymentCard({ row: r, onDecided }: { row: Row; onDecided: () => void }) {
  const [mode, setMode] = useState<"reject" | "refund" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    const { error } = await createClient().rpc(fn, args);
    setBusy(false);
    // "not waiting": the receiver re-uploaded or another admin decided; reload to see the new version.
    if (error) return setError(error.message.includes("not waiting") ? "This payment changed. Reload to see the new version." : error.message);
    onDecided();
  }

  function reject() {
    if (!reason.trim()) return setError("Write a reason the receiver will see");
    void run("decide_payment", { p_payment: r.id, p_approve: false, p_reason: reason.trim() });
  }

  return (
    <article className="rounded-xl border bg-card p-4">
      {r.trip_changed && <p className="mb-3 rounded-lg bg-destructive/10 p-3 text-base font-semibold text-destructive">Trip changed: refund the receiver</p>}
      {r.url ? (
        <a href={r.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={r.url} alt={`Payment screenshot from ${r.receiver_name}`} className="max-h-[28rem] w-full rounded-lg bg-muted object-contain" />
        </a>
      ) : (
        <p className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted px-4 text-center text-base text-muted-foreground">
          Couldn&apos;t load the screenshot. Reload the page.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt className="text-muted-foreground">Amount owed</dt>
        <dd className="font-bold">{etb(r.amount_etb)}</dd>
        <dt className="text-muted-foreground">Method</dt>
        <dd>{r.method === "telebirr" ? "Telebirr" : "CBE"}</dd>
        <dt className="text-muted-foreground">Order</dt>
        <dd className="break-words">
          {r.item_name} × {r.quantity}
        </dd>
        <dt className="text-muted-foreground">People</dt>
        <dd>
          {r.receiver_name} → {r.traveler_name}
        </dd>
        <dt className="text-muted-foreground">Waiting</dt>
        <dd>{formatDistanceToNowStrict(parseISO(r.created_at))}</dd>
      </dl>

      {r.trip_changed ? (
        mode === "refund" ? (
          <div className="mt-4 space-y-3">
            <p className="text-base font-semibold">Sent {etb(r.amount_etb)} back to {r.receiver_name}?</p>
            <div className="flex gap-3">
              <Button variant="outline" className="h-11 flex-1 rounded-lg text-base" onClick={() => setMode(null)}>
                Not yet
              </Button>
              <Button disabled={busy} className="h-11 flex-1 rounded-lg text-base font-bold" onClick={() => void run("mark_refunded", { p_payment: r.id })}>
                Mark refunded
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-4 h-11 w-full rounded-lg text-base font-bold" onClick={() => setMode("refund")}>
            Mark refunded
          </Button>
        )
      ) : mode === "reject" ? (
        <div className="mt-4 space-y-3">
          <Textarea aria-label="Reason for the receiver" placeholder="Reason for the receiver, e.g. the amount doesn't match" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-3">
            <Button variant="outline" className="h-11 flex-1 rounded-lg text-base" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={reject}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={() => setMode("reject")}>
            Reject
          </Button>
          <Button disabled={busy} className="h-11 flex-1 rounded-lg text-base font-bold" onClick={() => void run("decide_payment", { p_payment: r.id, p_approve: true })}>
            Confirm
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-base text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
