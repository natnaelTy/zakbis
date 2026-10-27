"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentText } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, invalidProps } from "@/components/request/item-fields";
import { createClient } from "@/lib/supabase/client";
import { addisToday, countryLabel, type Country } from "@/lib/open-requests";
import { loadMyVerification } from "@/components/traveler/verification-status";
import { firstBadStep, isRecheck, needsNewProof as proofNeeded, PROOF_TYPES, proofError, STEP_FIELDS, tripErrors, type TripDraft, type TripStatus } from "@/lib/trip-post";
import { cn } from "@/lib/utils";

const HEADINGS = ["Your ticket", "Your trip", "Space and shopping"];
// trips_guard's messages, shown as written; anything else gets the generic error.
const KNOWN = ["verify before posting a trip", "your passport must be valid until you land", "upload your ticket", "agree to the customs rules", "cancelled trips are final"];
const blank: TripDraft = { origin_country: "", origin_city: "", origin_airport: "", arrival_date: "", shop_by: "", free_kg: "", note: "", customs: false, crew: false, proof_kind: "ticket" };

export type TripFormInitial = Partial<TripDraft> & { id: string; proof_path: string; status?: TripStatus };

/** Posting a trip in three steps; with `initial` it resubmits that trip (fix or change date), which sends it back to the admin. */
export function TripForm({ initial, onDone }: { initial?: TripFormInitial; onDone: (id: string) => void }) {
  const [d, setD] = useState<TripDraft>({ ...blank, ...initial, customs: !!initial, crew: initial?.proof_kind === "roster" });
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof TripDraft | "proof", string>>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();
  const [done, setDone] = useState<{ id: string; recheck: boolean }>();
  const [passportExpiry, setPassportExpiry] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const today = addisToday(new Date());
  useEffect(() => void loadMyVerification().then((v) => setPassportExpiry(v?.passport_expiry)), []);
  const set = <K extends keyof TripDraft>(k: K, v: TripDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const needsNewProof = proofNeeded(initial as TripDraft | undefined, d);

  async function pickFile(f: File | undefined) {
    setFile(null);
    if (!f) return;
    const bad = proofError(f) ?? (f.type !== "application/pdf" && !(await createImageBitmap(f).then(() => true, () => false)) ? "Please choose a PDF, JPG, PNG or WebP under 10 MB" : undefined);
    setErrors((e) => ({ ...e, proof: bad }));
    if (!bad) setFile(f);
  }

  const allErrors = () => ({ ...tripErrors(d, today, passportExpiry), ...(needsNewProof && !file ? { proof: errors.proof ?? `Add your ${d.proof_kind === "roster" ? "roster" : "ticket"}` } : {}) });

  function showStep(s: number, all: ReturnType<typeof allErrors>) {
    const e = Object.fromEntries(STEP_FIELDS[s].filter((k) => all[k]).map((k) => [k, all[k]]));
    setErrors(e);
    setStep(s);
    const first = Object.keys(e)[0];
    requestAnimationFrame(() => document.getElementById(first)?.focus());
  }

  function check(s: number) {
    const all = allErrors();
    if (!STEP_FIELDS[s].some((k) => all[k])) return true;
    showStep(s, all);
    return false;
  }

  function next() {
    if (!check(step)) return;
    setStep(step + 1);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function submit() {
    // Re-check every step: a landing date changed on step 2 can make the ticket from step 1 stale.
    const all = allErrors();
    const bad = firstBadStep(all);
    if (bad !== undefined) return showStep(bad, all);
    setBusy(true);
    setFailed(undefined);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return (setBusy(false), setFailed("Please sign in again."));
    let proof_path = initial?.proof_path ?? "";
    if (file) {
      const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1].replace("jpeg", "jpg");
      proof_path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("tickets").upload(proof_path, file, { contentType: file.type });
      if (up.error) return (setBusy(false), setFailed("Couldn't upload your ticket. Please try again."));
    }
    const row = {
      origin_country: d.origin_country as Country,
      origin_city: d.origin_city.trim(),
      origin_airport: d.origin_airport.trim().toUpperCase(),
      arrival_date: d.arrival_date,
      shop_by: d.shop_by,
      free_kg: Number(d.free_kg),
      note: d.note.trim() || null,
      proof_kind: d.proof_kind,
      proof_path,
    };
    const res = initial
      ? await supabase.from("trips").update(row).eq("id", initial.id).then(({ error }) => ({ error, id: initial.id }))
      : await supabase
          .from("trips")
          .insert({ ...row, customs_agreed_at: new Date().toISOString() }) // the database stamps the real time
          .select("id")
          .single()
          .then(({ data, error }) => ({ error, id: data?.id as string | undefined }));
    setBusy(false);
    if (res.error || !res.id) {
      const known = KNOWN.find((m) => res.error?.message.includes(m));
      return setFailed(known ? known[0].toUpperCase() + known.slice(1) + "." : "Couldn't post your trip. Please try again.");
    }
    setDone({ id: res.id, recheck: isRecheck(initial, d, !!file) });
  }

  if (done)
    return (
      <div className="mt-6 space-y-4">
        <p role="status" className="text-base">
          {done.recheck ? "We're checking your ticket. Your trip will show on Explore once it's approved." : "Saved. Your trip is still live."}
        </p>
        <Button className="h-12 rounded-lg px-5 text-base font-bold" onClick={() => onDone(done.id)}>
          {initial ? "Back to your trip" : "See your trip"}
        </Button>
      </div>
    );

  const tick = (id: "customs" | "crew", label: string) => (
    <div>
      <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-base">
        <input id={id} type="checkbox" checked={d[id]} onChange={(e) => set(id, e.target.checked)} className="mt-1 size-5 shrink-0 accent-primary" {...invalidProps(errors[id], id)} />
        {label}
      </label>
      {errors[id] && (
        <p id={`${id}-error`} className="mt-1 text-sm text-destructive">
          {errors[id]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mt-4 space-y-6 pb-8">
      <ol aria-label="Steps" className="flex gap-1.5">
        {HEADINGS.map((h, i) => (
          <li key={h} aria-current={i === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}>
            <span className="sr-only">
              {h}
              {i < step ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>

      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {HEADINGS[step]}
      </h2>

      {step === 0 && (
        <section className="space-y-4">
          <div role="group" aria-label="Proof" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["ticket", "roster"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={d.proof_kind === k}
                onClick={() => set("proof_kind", k)}
                className={cn("h-11 rounded-lg text-base font-semibold transition-colors", d.proof_kind === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {k === "ticket" ? "Ticket" : "Crew roster"}
              </button>
            ))}
          </div>
          <Field
            id="proof"
            label={d.proof_kind === "ticket" ? "E-ticket, booking screenshot or itinerary photo" : "Roster or duty schedule screenshot"}
            hint={!needsNewProof && !file ? "Your current file stays unless you choose a new one." : undefined}
            error={errors.proof}
          >
            <input id="proof" type="file" accept={PROOF_TYPES.join(",")} className="peer sr-only" onChange={(e) => pickFile(e.target.files?.[0])} {...invalidProps(errors.proof, "proof")} />
            <label
              htmlFor="proof"
              className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-dashed bg-card px-4 text-base peer-focus-visible:ring-3 peer-focus-visible:ring-ring/20", errors.proof && "border-destructive")}
            >
              <DocumentText aria-hidden className="size-5 shrink-0 text-brand-text" />
              <span className="truncate">{file ? file.name : "Choose a file"}</span>
            </label>
          </Field>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <Field id="origin_country" label="Flying from" error={errors.origin_country}>
            <Select value={d.origin_country} onValueChange={(v) => set("origin_country", v as Country)}>
              <SelectTrigger id="origin_country" aria-label="Flying from" {...invalidProps(errors.origin_country, "origin_country")}>
                <SelectValue placeholder="Choose a country" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(countryLabel) as Country[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {countryLabel[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="origin_city" label="City" error={errors.origin_city}>
            <Input id="origin_city" value={d.origin_city} onChange={(e) => set("origin_city", e.target.value)} {...invalidProps(errors.origin_city, "origin_city")} />
          </Field>
          <Field id="origin_airport" label="Airport code" error={errors.origin_airport}>
            <Input id="origin_airport" placeholder="DXB" maxLength={3} autoCapitalize="characters" value={d.origin_airport} onChange={(e) => set("origin_airport", e.target.value)} {...invalidProps(errors.origin_airport, "origin_airport")} />
          </Field>
          <Field id="arrival_date" label="Date you land in Addis" error={errors.arrival_date}>
            <Input id="arrival_date" type="date" min={today} value={d.arrival_date} onChange={(e) => set("arrival_date", e.target.value)} {...invalidProps(errors.arrival_date, "arrival_date")} />
          </Field>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <Field id="free_kg" label="Free space (kg)" error={errors.free_kg}>
            <Input id="free_kg" inputMode="decimal" value={d.free_kg} onChange={(e) => set("free_kg", e.target.value)} {...invalidProps(errors.free_kg, "free_kg")} />
          </Field>
          <Field id="shop_by" label="Last day you can shop" error={errors.shop_by}>
            <Input id="shop_by" type="date" min={today} max={d.arrival_date || undefined} value={d.shop_by} onChange={(e) => set("shop_by", e.target.value)} {...invalidProps(errors.shop_by, "shop_by")} />
          </Field>
          <Field id="note" label="Note (optional)">
            <Textarea id="note" maxLength={300} value={d.note} onChange={(e) => set("note", e.target.value)} />
          </Field>
          {tick("customs", "I'll only carry items allowed by my airline and Ethiopian customs and declare what's required")}
          {d.proof_kind === "roster" && tick("crew", "My airline allows me to carry items for others")}
        </section>
      )}

      {failed && (
        <p role="alert" className="text-base text-destructive">
          {failed}
        </p>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" className="h-12 rounded-lg px-5 text-base font-semibold" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" className="h-12 flex-1 rounded-lg text-base font-bold" onClick={next}>
            Next
          </Button>
        ) : (
          <Button type="button" disabled={busy} className="h-12 flex-1 rounded-lg text-base font-bold" onClick={submit}>
            {busy ? "Sending…" : initial ? "Send for checking" : "Post trip"}
          </Button>
        )}
      </div>
    </div>
  );
}
