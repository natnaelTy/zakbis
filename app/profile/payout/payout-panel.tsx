"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PayoutFields } from "@/components/traveler/payout-fields";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { createClient } from "@/lib/supabase/client";
import { payoutErrors, type Payout } from "@/lib/account";

export function PayoutPanel() {
  const [userId, setUserId] = useState<string | null>();
  const [payout, setPayout] = useState<Payout>({ method: "telebirr", account_name: "", account_number: "", bank_name: "" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [status, setStatus] = useState<"saved" | "failed">();
  const [busy, setBusy] = useState(false);
  const [hasSide, setHasSide] = useState(true); // payout rows need the profile row a side creates
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
    if (!data.user) return;
    const [{ data: p }, { data: profile }] = await Promise.all([
      supabase.from("payout_accounts").select("method, account_name, account_number, bank_name").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("profiles").select("active_side").eq("id", data.user.id).maybeSingle(),
    ]);
    setHasSide(!!profile?.active_side);
    if (p) setPayout({ ...p, bank_name: p.bank_name ?? "" } as Payout);
  }, []);
  useEffect(() => void load(), [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found = payoutErrors(payout);
    setErrors(found);
    setStatus(undefined);
    const first = Object.keys(found)[0];
    if (first) return document.getElementById(first)?.focus();
    setBusy(true);
    const { error } = await createClient()
      .from("payout_accounts")
      .upsert({
        user_id: userId!,
        method: payout.method,
        account_name: payout.account_name.trim(),
        account_number: payout.account_number.trim(),
        bank_name: payout.method === "bank" ? payout.bank_name.trim() : null,
      });
    setBusy(false);
    setStatus(error ? "failed" : "saved");
  }

  if (userId === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (userId === null)
    return (
      <>
        <Button className="mt-6 h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(load)}>
          Sign in
        </Button>
        {sheet}
      </>
    );

  if (!hasSide)
    return (
      <Link href="/profile" className="mt-6 inline-block font-semibold text-brand-text">
        Choose how you&apos;ll use Zakbis first
      </Link>
    );

  return (
    <form onSubmit={save} noValidate className="mt-6 space-y-5">
      <PayoutFields value={payout} onChange={(p) => (setPayout(p), setStatus(undefined))} errors={errors} />
      <Button type="submit" disabled={busy} className="h-12 w-full rounded-lg text-base font-bold">
        {status === "saved" ? "Saved" : "Save"}
      </Button>
      {status === "failed" && (
        <p role="alert" className="text-base text-destructive">
          Couldn&apos;t save. Please try again.
        </p>
      )}
    </form>
  );
}
