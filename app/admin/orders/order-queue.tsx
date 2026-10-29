"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { etb } from "@/lib/money";

type Row = {
  request_id: string; item_name: string; quantity: number; kind: "hold" | "refund" | "payout"; hold: string | null; held_at: string;
  amount_etb: number; receiver_name: string; traveler_name: string; payout_method: string | null; payout_account_name: string | null;
  payout_account_number: string | null; payout_bank_name: string | null; refund_method: string | null; delivered_by_timeout: boolean;
};

const HOLDS: Record<string, { label: string; actions: [string, string][] }> = {
  not_bought: { label: "Not marked bought in time", actions: [["refund", "Refund the receiver"], ["extend", "Give 2 more days"]] },
  cant_reach: { label: "Receiver can't reach the traveler", actions: [["refund", "Refund the receiver"], ["restart", "Restart the week"]] },
  item_problem: { label: "Problem with the item", actions: [["refund", "Refund the receiver"], ["pay", "Pay the traveler"]] },
  no_receiver_phone: { label: "Receiver never confirmed their number", actions: [["refund", "Refund the receiver"], ["pay", "Pay the traveler"]] },
};
const SECTIONS = [
  { kind: "hold", title: "On hold" },
  { kind: "refund", title: "Refunds to send" },
  { kind: "payout", title: "Payouts to send" },
] as const;

/** Holds to decide, refunds and payouts to send by hand. */
export function OrderQueue() {
  const [rows, setRows] = useState<Row[]>();
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("orders_to_act");
    if (error) return setFailed(true);
    setRows((data as Row[] | null) ?? []);
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) return <p className="mt-4 text-base text-destructive">Couldn&apos;t load orders. Please reload.</p>;
  if (!rows) return <p className="mt-4 text-base text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="mt-4 text-base text-muted-foreground">Nothing to act on</p>;
  return (
    <div className="space-y-6 pb-8">
      {SECTIONS.map(({ kind, title }) => {
        const list = rows.filter((r) => r.kind === kind);
        return list.length ? (
          <section key={kind} className="mt-4">
            <h2 className="text-lg font-bold">{title}</h2>
            <ul className="mt-2 space-y-3">
              {list.map((r) => (
                <li key={r.request_id}>
                  <OrderCard row={r} onDone={load} />
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
    </div>
  );
}

function OrderCard({ row: r, onDone }: { row: Row; onDone: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<[string, string, Record<string, unknown>]>();
  const [copied, setCopied] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    const { error: err } = await createClient().rpc(confirm[1], confirm[2]);
    setBusy(false);
    setConfirm(undefined);
    if (err) setError("This order changed. Here's the latest.");
    await onDone();
  }
  const copy = (v: string) => void navigator.clipboard.writeText(v).catch(() => {}).then(() => setCopied(v));

  const actions: [string, string, Record<string, unknown>][] =
    r.kind === "hold" && r.hold
      ? HOLDS[r.hold].actions.map(([a, label]) => [label, "resolve_hold", { p_request: r.request_id, p_action: a }])
      : r.kind === "refund"
        ? [["Mark refunded", "mark_order_refunded", { p_request: r.request_id }]]
        : [["Mark paid out", "mark_paid_out", { p_request: r.request_id }]];
  const account =
    r.kind === "payout" && r.payout_account_number
      ? [["Method", r.payout_method === "bank" ? r.payout_bank_name ?? "Bank" : "Telebirr"], ["Name", r.payout_account_name ?? ""], ["Number", r.payout_account_number]]
      : [];

  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/orders/requests/${r.request_id}`} className="text-base font-bold underline-offset-4 hover:underline">
          {r.item_name}
          {r.quantity > 1 && ` × ${r.quantity}`}
        </Link>
        <span className="shrink-0 text-base font-bold tabular-nums">{etb(r.amount_etb)}</span>
      </div>
      <p className="text-base text-muted-foreground">
        {r.receiver_name} → {r.traveler_name} · {formatDistanceToNowStrict(parseISO(r.held_at))}
      </p>
      {r.hold && <p className="text-base font-semibold">{HOLDS[r.hold].label}</p>}
      {r.kind === "refund" && <p className="text-base">Paid by {r.refund_method === "bank" ? "CBE" : "Telebirr"}. Send it back to the account on their screenshot.</p>}
      {r.delivered_by_timeout && <p className="text-base">The receiver didn&apos;t show within a week.</p>}
      {r.kind === "payout" && !r.payout_account_number && <p className="text-base text-destructive">No payout account yet</p>}
      {account.length > 0 && (
        <dl className="space-y-2 text-base">
          {account.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-[13px] text-muted-foreground">{label}</dt>
                <dd className="truncate font-semibold">{value}</dd>
              </div>
              <Button type="button" variant="outline" className="h-9 shrink-0 rounded-lg px-3 text-sm" onClick={() => copy(value)}>
                {copied === value ? "Copied" : "Copy"}
              </Button>
            </div>
          ))}
        </dl>
      )}
      {confirm ? (
        <div role="alertdialog" aria-label={`${confirm[0]}?`} className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{confirm[0]}?</span>
          <Button className="h-11 rounded-lg px-5 text-base font-semibold" disabled={busy} onClick={() => void run()}>
            Yes
          </Button>
          <Button variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold" onClick={() => setConfirm(undefined)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button key={a[0]} variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold" onClick={() => (setError(undefined), setConfirm(a))}>
              {a[0]}
            </Button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-base text-destructive">{error}</p>}
    </article>
  );
}
