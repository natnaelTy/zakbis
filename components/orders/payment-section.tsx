"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CloudUpload } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { etb } from "@/lib/money";
import { timeLeft } from "@/lib/negotiation";
import { paymentDetails, type PayMethod } from "@/lib/payment-details";
import { cn } from "@/lib/utils";
import { btn } from "./offer-card";
import { PROOF_TYPES, uploadProof } from "./upload-proof";

// Literal process.env reads so Next inlines them into the browser bundle.
const DETAILS = paymentDetails({
  NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER: process.env.NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER,
  NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME: process.env.NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME,
  NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT: process.env.NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT,
  NEXT_PUBLIC_ZAKBIS_CBE_NAME: process.env.NEXT_PUBLIC_ZAKBIS_CBE_NAME,
});

export type LatestPayment = { id: string; status: "pending" | "confirmed" | "rejected" | "refunded"; reject_reason: string | null } | null;

/** The receiver pays Zakbis by Telebirr or CBE and uploads a screenshot; an admin confirms it. */
export function PaymentSection({ requestId, total, dueAt, latest, now, onDone }: {
  requestId: string; total: number; dueAt: string | null; latest: LatestPayment; now: Date; onDone: () => Promise<void>;
}) {
  const methods = Object.keys(DETAILS) as PayMethod[];
  const [method, setMethod] = useState<PayMethod | undefined>(methods[0]);
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (latest?.status === "pending")
    return <p className="mt-5 rounded-xl border bg-card p-4 text-base font-semibold">We&apos;re checking your payment.</p>;
  if (!methods.length) return <p className="mt-5 rounded-xl border bg-card p-4 text-base">Payment opens soon.</p>;
  const d = method && DETAILS[method];

  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Add a screenshot of your transfer");
    if (!PROOF_TYPES.includes(file.type)) return setError("Use a JPG, PNG or WebP image");
    setBusy(true);
    setError(undefined);
    const up = await uploadProof(file);
    const res = "error" in up ? { error: { message: up.error } } : await createClient().rpc("submit_payment", { p_request: requestId, p_method: method, p_proof: up.path });
    setBusy(false);
    if (res.error) {
      const m = res.error.message;
      setError(m.includes("time is up") ? "Time's up for this payment." : m.includes("already") ? "We already have your screenshot." : "Couldn't send. Please try again.");
    }
    await onDone(); // reload either way: another tab may have paid, or the order may have closed
  }

  return (
    <form onSubmit={send} noValidate className="mt-5 space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">Pay {etb(total)}</h2>
        {dueAt && <span className="text-[13px] text-muted-foreground">Pay within {timeLeft(dueAt, now)}</span>}
      </div>
      {latest?.status === "rejected" && (
        <p role="alert" className="text-base text-destructive">
          We couldn&apos;t confirm your payment: {latest.reject_reason}
        </p>
      )}
      {methods.length > 1 && (
        <div role="radiogroup" aria-label="Pay with" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn("h-11 rounded-lg text-base font-semibold", method === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground")}
            >
              {DETAILS[m]?.label}
            </button>
          ))}
        </div>
      )}
      {d && (
        <dl className="space-y-2 text-base">
          {[
            [method === "telebirr" ? "Telebirr number" : "CBE account", d.account],
            ["Account name", d.name],
            ["Amount", String(total)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-[13px] text-muted-foreground">{label}</dt>
                <dd className="truncate font-semibold tabular-nums">{label === "Amount" ? etb(total) : value}</dd>
              </div>
              <Button type="button" variant="outline" className="h-9 shrink-0 rounded-lg px-3 text-sm" onClick={() => void copy(value)}>
                {copied === value ? "Copied" : "Copy"}
              </Button>
            </div>
          ))}
        </dl>
      )}
      <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed text-base font-semibold focus-within:ring-3 focus-within:ring-ring/20">
        <CloudUpload aria-hidden className="size-5" />
        {file ? file.name : "Add transfer screenshot"}
        <input type="file" accept={PROOF_TYPES.join(",")} className="sr-only" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setError(undefined))} />
      </label>
      {error && (
        <p role="alert" className="text-base text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className={`${btn} w-full`}>
        Send screenshot
      </Button>
    </form>
  );
}
