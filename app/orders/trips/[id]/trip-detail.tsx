"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, invalidProps } from "@/components/request/item-fields";
import { StatusPill } from "@/components/trips/status-pill";
import { TripForm } from "@/components/trips/trip-form";
import { createClient } from "@/lib/supabase/client";
import { countryLabel } from "@/lib/open-requests";
import type { MyTrip } from "@/lib/trip-post";

const day = (d: string) => format(parseISO(d), "d MMM yyyy");
const action = "h-11 rounded-lg px-5 text-base font-semibold";

/** The traveler's own trip: details, ticket, and what they can do in its current state. */
export function TripDetail({ id }: { id: string }) {
  const [trip, setTrip] = useState<MyTrip | null>();
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"view" | "resubmit" | "edit" | "cancel">("view");
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("my_trips");
    if (error) return setFailed(true);
    setTrip(((data as MyTrip[] | null) ?? []).find((t) => t.id === id) ?? null);
    setMode("view");
  }, [id]);
  useEffect(() => void load(), [load]);

  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load this trip. Please reload.
      </p>
    );
  if (trip === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (trip === null) return <p className="mt-6 text-base text-muted-foreground">Trip not found</p>;
  const t = trip;

  async function viewTicket() {
    const tab = window.open("", "_blank"); // opened before the await so phone browsers don't block it
    const { data } = await createClient().storage.from("tickets").createSignedUrl(t.proof_path, 300);
    if (data && tab) tab.location.href = data.signedUrl;
    else (tab?.close(), setMessage({ text: "Couldn't open your ticket. Please try again.", error: true }));
  }

  async function saveKg(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(kg);
    if (!kg.trim() || !(n >= 1 && n <= 50)) return setMessage({ text: "Enter free kg between 1 and 50", error: true });
    setBusy(true);
    const { error } = await createClient().from("trips").update({ free_kg: n, note: note.trim() || null }).eq("id", t.id);
    setBusy(false);
    if (error) return setMessage({ text: "Couldn't save. Please try again.", error: true });
    await load();
    setMessage({ text: "Saved" });
  }

  async function cancel() {
    setBusy(true);
    const { error } = await createClient().from("trips").update({ status: "cancelled" }).eq("id", t.id);
    setBusy(false);
    if (error) return setMessage({ text: "Couldn't cancel. Please try again.", error: true });
    await load();
  }

  if (mode === "resubmit")
    return (
      <>
        <h1 className="pt-2 text-2xl font-bold tracking-[-0.02em]">{t.status === "needs_fix" ? "Fix your trip" : "Change date"}</h1>
        <TripForm
          initial={{ ...t, id: t.id, free_kg: String(t.free_kg), note: t.note ?? "", origin_country: t.origin_country }}
          onDone={() => void load()}
        />
        <Button variant="outline" className={action} onClick={() => setMode("view")}>
          Back
        </Button>
      </>
    );

  const kgError = message?.error && mode === "edit" ? message.text : undefined;

  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          {countryLabel[t.origin_country]} · {t.origin_city}
        </h1>
        <StatusPill status={t.status} />
      </div>

      {t.status === "needs_fix" && (
        <p className="mt-4 flex gap-2 rounded-xl border bg-card p-4 text-base">
          <ShieldAlert aria-hidden className="mt-1 size-4 shrink-0 text-destructive" />
          We couldn&apos;t approve this trip: {t.rejection_reason}
        </p>
      )}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
        <dt className="text-muted-foreground">From</dt>
        <dd>{t.origin_airport}</dd>
        <dt className="text-muted-foreground">Lands in Addis</dt>
        <dd>{day(t.arrival_date)}</dd>
        <dt className="text-muted-foreground">Shop by</dt>
        <dd>{day(t.shop_by)}</dd>
        <dt className="text-muted-foreground">Free space</dt>
        <dd>{t.free_kg} kg</dd>
        {t.note && (
          <>
            <dt className="text-muted-foreground">Note</dt>
            <dd className="break-words">{t.note}</dd>
          </>
        )}
      </dl>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" className={action} onClick={viewTicket}>
          View {t.proof_kind === "roster" ? "roster" : "ticket"}
        </Button>
        {t.status === "needs_fix" && (
          <Button className={action} onClick={() => setMode("resubmit")}>
            Fix and resubmit
          </Button>
        )}
        {(t.status === "checking" || t.status === "live") && (
          <>
            <Button variant="outline" className={action} onClick={() => setMode("resubmit")}>
              Change date
            </Button>
            <Button
              variant="outline"
              className={action}
              onClick={() => (setKg(String(t.free_kg)), setNote(t.note ?? ""), setMessage(undefined), setMode("edit"))}
            >
              Edit kg and note
            </Button>
          </>
        )}
        {t.status !== "cancelled" && (
          <Button variant="outline" className={`${action} text-destructive`} onClick={() => setMode("cancel")}>
            Cancel trip
          </Button>
        )}
      </div>

      {mode === "edit" && (
        <form onSubmit={saveKg} noValidate className="mt-4 space-y-3 rounded-xl border bg-card p-4">
          <Field id="edit-kg" label="Free space (kg)" error={kgError}>
            <Input id="edit-kg" inputMode="decimal" autoFocus value={kg} onChange={(e) => setKg(e.target.value)} {...invalidProps(kgError, "edit-kg")} />
          </Field>
          <Field id="edit-note" label="Note (optional)">
            <Textarea id="edit-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy} className={action}>
            Save
          </Button>
        </form>
      )}

      {mode === "cancel" && (
        <div role="alertdialog" aria-labelledby="cancel-q" className="mt-4 space-y-3 rounded-xl border bg-card p-4">
          <p id="cancel-q" className="text-base font-semibold">
            Cancel this trip? Receivers won&apos;t see it any more.
          </p>
          <div className="flex gap-2">
            <Button disabled={busy} variant="destructive" className={action} onClick={cancel}>
              Cancel trip
            </Button>
            <Button variant="outline" className={action} onClick={() => setMode("view")}>
              Keep trip
            </Button>
          </div>
        </div>
      )}

      {message && !kgError && (
        <p role={message.error ? "alert" : "status"} className={`mt-3 text-base ${message.error ? "text-destructive" : "text-brand-text"}`}>
          {message.text}
        </p>
      )}
    </>
  );
}
