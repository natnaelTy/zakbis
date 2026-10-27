"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

const REASONS = ["Photo unclear", "Name doesn't match", "Passport expired", "Selfie doesn't match", "Other"];

type Row = {
  user_id: string;
  legal_name: string;
  given_name: string | null;
  nationality: string;
  passport_expiry: string;
  passport_path: string;
  selfie_path: string;
  submitted_at: string;
  payout: { method: string; account_name: string; account_number: string; bank_name: string | null } | null;
  passportUrl?: string;
  selfieUrl?: string;
};

export function ReviewList() {
  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const [rows, setRows] = useState<Row[]>();
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setRows(undefined);
    const supabase = createClient();
    const { data: v } = await supabase
      .from("traveler_verifications")
      .select("user_id, legal_name, given_name, nationality, passport_expiry, passport_path, selfie_path, submitted_at")
      .eq("status", tab)
      .order("submitted_at", { ascending: true });
    const list = v ?? [];
    const ids = list.map((r) => r.user_id);
    const [{ data: payouts }, signed] = await Promise.all([
      supabase.from("payout_accounts").select("user_id, method, account_name, account_number, bank_name").in("user_id", ids),
      // Short-lived links: identity images are never public.
      list.length ? supabase.storage.from("identity").createSignedUrls(list.flatMap((r) => [r.passport_path, r.selfie_path]), 300) : { data: [] },
    ]);
    const url = (path: string) => signed.data?.find((s) => s.path === path)?.signedUrl ?? undefined;
    setRows(
      list.map((r) => ({
        ...r,
        payout: payouts?.find((p) => p.user_id === r.user_id) ?? null,
        passportUrl: url(r.passport_path),
        selfieUrl: url(r.selfie_path),
      })),
    );
  }, [tab]);
  useEffect(() => void load(), [load]);

  const shown = rows?.filter((r) => !search.trim() || `${r.legal_name} ${r.given_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mt-4 space-y-4 pb-8">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "approved")}>
        <TabsList>
          {/* Dark active label: bright brand green on white is too faint for text (DESIGN.md). */}
          <TabsTrigger value="pending" className="data-[state=active]:text-foreground">Pending</TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:text-foreground">Approved</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "approved" && <Input aria-label="Search by name" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />}
      {!shown && <p className="text-base text-muted-foreground">Loading…</p>}
      {shown?.length === 0 && <p className="text-base text-muted-foreground">{tab === "pending" ? "Nothing to review." : "No approved travelers yet."}</p>}
      <ul className="space-y-4">
        {shown?.map((r) => (
          <li key={r.user_id}>
            <ReviewCard row={r} approved={tab === "approved"} onDecided={load} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({ row: r, approved, onDecided }: { row: Row; approved: boolean; onDecided: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [givenName, setGivenName] = useState(r.given_name ?? "");
  const nationality = new Intl.DisplayNames(["en"], { type: "region" }).of(r.nationality) ?? r.nationality;

  async function decide(approve: boolean) {
    const p_reason = approve ? null : note.trim() ? `${reason}: ${note.trim()}` : reason;
    if (approve && !givenName.trim()) return setError("Enter the first name as printed in the passport");
    const p_given_name = approve ? givenName.trim() : null;
    const { error } = await createClient().rpc("decide_verification", { p_user: r.user_id, p_approve: approve, p_reason, p_given_name });
    if (error) return setError(error.message);
    onDecided();
  }

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Passport", r.passportUrl],
          ["Selfie", r.selfieUrl],
        ].map(([label, src]) => (
          <figure key={label}>
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
            {src ? <img src={src} alt={`${label} of ${r.legal_name}`} className="aspect-[4/3] w-full rounded-lg bg-muted object-contain" /> : <div className="aspect-[4/3] rounded-lg bg-muted" />}
            <figcaption className="mt-1 text-[13px] text-muted-foreground">{label}</figcaption>
          </figure>
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt className="text-muted-foreground">Passport name</dt>
        <dd className="font-semibold">{r.legal_name}</dd>
        <dt className="text-muted-foreground">
          <label htmlFor={`given-${r.user_id}`}>First name (shown publicly)</label>
        </dt>
        <dd>
          {approved ? (
            r.given_name ?? "—"
          ) : (
            // Prefilled with the first word of the passport name; fix it for surname-first passports.
            <Input id={`given-${r.user_id}`} maxLength={40} value={givenName} onChange={(e) => setGivenName(e.target.value)} className="h-9 max-w-48 text-base" />
          )}
        </dd>
        <dt className="text-muted-foreground">Nationality</dt>
        <dd>{nationality}</dd>
        <dt className="text-muted-foreground">Expires</dt>
        <dd>{format(parseISO(r.passport_expiry), "d MMM yyyy")}</dd>
        <dt className="text-muted-foreground">Payout</dt>
        <dd>{r.payout ? `${r.payout.method === "bank" ? r.payout.bank_name : "Telebirr"} · ${r.payout.account_name} · ${r.payout.account_number}` : "None"}</dd>
        <dt className="text-muted-foreground">Submitted</dt>
        <dd>{r.submitted_at ? format(parseISO(r.submitted_at), "d MMM yyyy, HH:mm") : "—"}</dd>
      </dl>

      {rejecting ? (
        <div className="mt-4 space-y-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger aria-label="Reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((x) => (
                <SelectItem key={x} value={x}>
                  {x}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input aria-label="Note for the traveler (optional)" placeholder="Note for the traveler (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-3">
            <Button variant="outline" className="h-11 flex-1 rounded-lg text-base" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={() => decide(false)}>
              {approved ? "Revoke" : "Reject"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={() => setRejecting(true)}>
            {approved ? "Revoke" : "Reject"}
          </Button>
          {!approved && (
            <Button className="h-11 flex-1 rounded-lg text-base font-bold" onClick={() => decide(true)}>
              Approve
            </Button>
          )}
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
