"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { countryLabel, type Country } from "@/lib/open-requests";

type Row = {
  id: string;
  origin_country: Country;
  origin_city: string;
  origin_airport: string;
  shop_by: string;
  arrival_date: string;
  free_kg: number;
  note: string | null;
  proof_kind: "ticket" | "roster";
  proof_path: string;
  submitted_at: string;
  legal_name: string | null;
  given_name: string | null;
  url?: string;
};

const day = (d: string) => format(parseISO(d), "d MMM yyyy");

export function TripQueue() {
  const [rows, setRows] = useState<Row[]>();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("trips_to_check");
    if (error) return setFailed(true);
    const list = (data as Row[] | null) ?? [];
    // Private links that last an hour, long enough for a review session; tickets are never public.
    const signed = list.length ? await supabase.storage.from("tickets").createSignedUrls(list.map((r) => r.proof_path), 3600) : { data: [] };
    setRows(list.map((r) => ({ ...r, url: signed.data?.find((s) => s.path === r.proof_path)?.signedUrl ?? undefined })));
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) return <p className="mt-4 text-base text-destructive">Couldn&apos;t load trips. Please reload.</p>;
  if (!rows) return <p className="mt-4 text-base text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="mt-4 text-base text-muted-foreground">No trips to check</p>;
  return (
    <ul className="mt-4 space-y-4 pb-8">
      {rows.map((r) => (
        <li key={r.id}>
          <TripCard row={r} onDecided={() => setRows((rs) => rs?.filter((x) => x.id !== r.id))} />
        </li>
      ))}
    </ul>
  );
}

function TripCard({ row: r, onDecided }: { row: Row; onDecided: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const isPdf = r.proof_path.endsWith(".pdf");

  async function decide(approve: boolean) {
    if (!approve && !reason.trim()) return setError("Write a reason the traveler will see");
    setBusy(true);
    const { error } = await createClient().rpc("decide_trip", { p_trip: r.id, p_submitted_at: r.submitted_at, p_approve: approve, p_reason: approve ? null : reason.trim() });
    setBusy(false);
    // "changed since you opened it": the traveler resubmitted; reload to see the new version.
    if (error) return setError(error.message.includes("changed") ? "The traveler changed this trip. Reload to see the new version." : error.message);
    onDecided();
  }

  return (
    <article className="rounded-xl border bg-card p-4">
      {r.proof_kind === "roster" && <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-brand-text">Crew roster</p>}
      {!r.url ? (
        <p className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted px-4 text-center text-base text-muted-foreground">
          Couldn&apos;t load the ticket. Reload the page.
        </p>
      ) : isPdf ? (
        <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-lg border px-5 text-base font-semibold">
          Open ticket (PDF)
        </a>
      ) : (
        <a href={r.url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={r.url} alt={`Ticket of ${r.legal_name ?? "traveler"}`} className="max-h-[28rem] w-full rounded-lg bg-muted object-contain" />
        </a>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        <dt className="text-muted-foreground">Passport name</dt>
        <dd className="font-semibold">{r.legal_name ?? "—"}</dd>
        <dt className="text-muted-foreground">First name</dt>
        <dd>{r.given_name ?? "—"}</dd>
        <dt className="text-muted-foreground">From</dt>
        <dd>
          {r.origin_city}, {countryLabel[r.origin_country]} · {r.origin_airport}
        </dd>
        <dt className="text-muted-foreground">Lands in Addis</dt>
        <dd className="font-semibold">{day(r.arrival_date)}</dd>
        <dt className="text-muted-foreground">Shop by</dt>
        <dd>{day(r.shop_by)}</dd>
        <dt className="text-muted-foreground">Free space</dt>
        <dd>{r.free_kg} kg</dd>
        {r.note && (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="break-words">{r.note}</dd>
          </>
        )}
      </dl>

      {rejecting ? (
        <div className="mt-4 space-y-3">
          <Textarea aria-label="Reason for the traveler" placeholder="Reason for the traveler, e.g. the name on the ticket doesn't match" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-3">
            <Button variant="outline" className="h-11 flex-1 rounded-lg text-base" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={() => decide(false)}>
              Reject
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <Button variant="outline" className="h-11 flex-1 rounded-lg text-base font-semibold" onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Button disabled={busy} className="h-11 flex-1 rounded-lg text-base font-bold" onClick={() => decide(true)}>
            Approve
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
