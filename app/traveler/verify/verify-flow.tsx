"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addYears, format, parseISO } from "date-fns";
import { CalendarIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ImageUploadField } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, invalidProps } from "@/components/request/item-fields";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { VerificationStatus } from "@/components/traveler/verification-status";
import { createClient } from "@/lib/supabase/client";
import { addisToday } from "@/lib/open-requests";
import { payoutErrors, type Payout } from "@/lib/account";
import { PayoutFields } from "@/components/traveler/payout-fields";

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]; // what the identity bucket accepts
const HEADINGS = ["What you'll need", "Your passport", "Selfie with your passport", "Where to send your payouts", "Check and submit"];
const FIRST = ["ET", "US", "GB", "CN", "AE", "CA", "DE", "SE", "NO", "IT", "SA", "IL"];

/** Every region code Intl knows a name for (no hard-coded country list); common traveler countries first. */
function nationalities() {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && !/Unknown|Pseudo/i.test(name)) codes.push(code);
    }
  const rest = codes.filter((c) => !FIRST.includes(c)).sort((x, y) => names.of(x)!.localeCompare(names.of(y)!));
  return [...FIRST, ...rest].map((code) => ({ code, name: names.of(code)! }));
}

type Step = 0 | 1 | 2 | 3 | 4;

export function VerifyFlow() {
  const countries = useMemo(nationalities, []);
  const today = addisToday(new Date());
  const { requireAuth, sheet } = useRequireAuth("Sign in to become a traveler", "traveler");
  const [userId, setUserId] = useState<string | null>();
  const [locked, setLocked] = useState(false); // approved with a valid passport: nothing to do here
  const [step, setStep] = useState<Step>(0);
  const [passport, setPassport] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [legalName, setLegalName] = useState("");
  const [nationality, setNationality] = useState("ET");
  const [expiry, setExpiry] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [payout, setPayout] = useState<Payout>({ method: "telebirr", account_name: "", account_number: "", bank_name: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // Announce the new step to screen readers and keep keyboard users in place (skip the first render).
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setUserId(null);
    // No side yet (sheet closed early): the sign-in sheet's side question comes first; payouts need the profile row.
    const { data: profile } = await supabase.from("profiles").select("active_side").eq("id", data.user.id).maybeSingle();
    if (!profile?.active_side) return setUserId(null);
    setUserId(data.user.id);
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase.from("traveler_verifications").select("status, legal_name, nationality, passport_expiry").eq("user_id", data.user.id).maybeSingle(),
      supabase.from("payout_accounts").select("method, account_name, account_number, bank_name").eq("user_id", data.user.id).maybeSingle(),
    ]);
    if (v) {
      setLocked(v.status === "approved" && v.passport_expiry >= today);
      setLegalName(v.legal_name);
      setNationality(v.nationality);
      if (v.passport_expiry >= today) setExpiry(v.passport_expiry);
    }
    if (p) setPayout({ ...p, bank_name: p.bank_name ?? "" } as Payout);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (userId === null) void requireAuth(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function check(s: Step) {
    const e: Record<string, string> = {};
    if (s === 1) {
      if (!passport) e.passport = "Add a photo of your passport's photo page";
      if (legalName.trim().length < 2) e.legalName = "Enter your full name exactly as in your passport";
      if (!expiry || expiry < today) e.expiry = expiry ? "This passport has expired" : "Pick your passport's expiry date";
    }
    if (s === 2 && !selfie) e.selfie = "Add a selfie holding your open passport";
    if (s === 3) {
      Object.assign(e, payoutErrors(payout));
    }
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) document.getElementById(first)?.focus(); // uploaders carry the field id on their button
    return !first;
  }
  const next = () => {
    if (!check(step)) return;
    setFileError(undefined); // a rejected file on this step must not show on the next one
    setStep((step + 1) as Step);
  };

  async function submit() {
    if (!userId || !passport || !selfie) return;
    setBusy(true);
    setErrors({});
    const supabase = createClient();
    const ext = (f: File) => (f.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const stamp = Date.now();
    const passportPath = `${userId}/passport-${stamp}.${ext(passport)}`;
    const selfiePath = `${userId}/selfie-${stamp}.${ext(selfie)}`;
    const up1 = await supabase.storage.from("identity").upload(passportPath, passport, { contentType: passport.type });
    const up2 = up1.error ? up1 : await supabase.storage.from("identity").upload(selfiePath, selfie, { contentType: selfie.type });
    const pay = await supabase.from("payout_accounts").upsert({
      user_id: userId,
      method: payout.method,
      account_name: payout.account_name.trim(),
      account_number: payout.account_number.trim(),
      bank_name: payout.method === "bank" ? payout.bank_name.trim() : null,
    });
    const ver =
      up2.error || pay.error
        ? null
        : await supabase.from("traveler_verifications").upsert({
            user_id: userId,
            legal_name: legalName.trim(),
            nationality,
            passport_expiry: expiry,
            passport_path: passportPath,
            selfie_path: selfiePath,
          });
    setBusy(false);
    if (up2.error || pay.error || ver?.error) return setErrors({ submit: "Couldn't submit. Check your connection and try again." });
    setDone(true);
  }

  if (userId === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (userId === null) return <div className="mt-6">{sheet}</div>;
  if (locked || done)
    return (
      <div className="mt-6 space-y-4">
        <VerificationStatus />
        <Link href="/profile" className="inline-block font-semibold text-brand-text underline-offset-4 hover:underline">
          Back to profile
        </Link>
      </div>
    );

  const steps = ["Intro", "Passport", "Selfie", "Payout", "Review"];
  return (
    <div className="mt-4 space-y-6 pb-8">
      <ol aria-label="Steps" className="flex gap-1.5">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}>
            <span className="sr-only">
              {s}
              {i < step ? " (done)" : ""}
            </span>
          </li>
        ))}
      </ol>

      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {HEADINGS[step]}
      </h2>

      {step === 0 && (
        <section className="space-y-3 text-base">
          <p>So receivers know who&apos;s carrying their item. Only Zakbis staff see your documents.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>A photo of your passport&apos;s photo page</li>
            <li>A selfie holding your open passport</li>
            <li>Where to send your payouts (Telebirr or bank)</li>
          </ul>
        </section>
      )}

      {step === 1 && (
        <section className="space-y-4">
          <Field id="passport" label="Passport photo page" hint="All four corners visible, no glare." error={fileError ?? errors.passport}>
            <ImageUploadField id="passport" label="passport photo" acceptTypes={IMAGE_TYPES} aria-describedby={fileError ?? errors.passport ? "passport-error" : undefined} aspectRatio={1.42} maxSize={MAX_BYTES} value={passport} error={!!(fileError ?? errors.passport)} onChange={(f) => (setPassport(f instanceof File ? f : null), setFileError(undefined))} onReject={setFileError} />
          </Field>
          <Field id="legalName" label="Full name, exactly as in your passport" error={errors.legalName}>
            <Input id="legalName" autoComplete="name" value={legalName} onChange={(e) => setLegalName(e.target.value)} {...invalidProps(errors.legalName, "legalName")} />
          </Field>
          <Field id="nationality" label="Nationality">
            <Select value={nationality} onValueChange={setNationality}>
              <SelectTrigger id="nationality" aria-label="Nationality">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="expiry" label="Passport expiry date" error={errors.expiry}>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger
                id="expiry"
                {...invalidProps(errors.expiry, "expiry")}
                className="flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 aria-invalid:border-destructive"
              >
                <CalendarIcon aria-hidden className="size-4 text-muted-foreground" />
                {expiry ? format(parseISO(expiry), "d MMM yyyy") : <span className="text-muted-foreground">Pick a date</span>}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  className="[--cell-size:--spacing(10)]"
                  selected={expiry ? parseISO(expiry) : undefined}
                  defaultMonth={expiry ? parseISO(expiry) : addYears(parseISO(today), 1)}
                  startMonth={parseISO(today)}
                  endMonth={addYears(parseISO(today), 12)}
                  disabled={{ before: addDays(parseISO(today), 1) }}
                  onSelect={(d) => {
                    if (!d) return;
                    setExpiry(format(d, "yyyy-MM-dd"));
                    setDateOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>
        </section>
      )}

      {step === 2 && (
        <Field id="selfie" label="Selfie holding your open passport" error={fileError ?? errors.selfie}>
          <ImageUploadField id="selfie" label="selfie" acceptTypes={IMAGE_TYPES} aria-describedby={fileError ?? errors.selfie ? "selfie-error" : undefined} capture="user" aspectRatio={0.8} maxSize={MAX_BYTES} value={selfie} error={!!(fileError ?? errors.selfie)} onChange={(f) => (setSelfie(f instanceof File ? f : null), setFileError(undefined))} onReject={setFileError} />
        </Field>
      )}

      {step === 3 && <PayoutFields value={payout} onChange={setPayout} errors={errors} />}

      {step === 4 && (
        <section className="space-y-3 rounded-xl border bg-card p-4 text-base">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-semibold">{legalName.trim()}</dd>
            <dt className="text-muted-foreground">Nationality</dt>
            <dd>{countries.find((c) => c.code === nationality)?.name}</dd>
            <dt className="text-muted-foreground">Passport expires</dt>
            <dd>{expiry && format(parseISO(expiry), "d MMM yyyy")}</dd>
            <dt className="text-muted-foreground">Payouts</dt>
            <dd>
              {payout.method === "telebirr" ? "Telebirr" : payout.bank_name} · {payout.account_number}
            </dd>
          </dl>
        </section>
      )}

      {errors.submit && (
        <p role="alert" className="text-base text-destructive">
          {errors.submit}
        </p>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <Button type="button" variant="outline" className="h-12 flex-1 rounded-lg text-base font-semibold" onClick={() => setStep((step - 1) as Step)}>
            Back
          </Button>
        )}
        {step < 4 ? (
          <Button type="button" className="h-12 flex-[2] rounded-lg text-base font-bold" onClick={next}>
            {step === 0 ? "Start" : "Continue"}
          </Button>
        ) : (
          <Button type="button" disabled={busy} className="h-12 flex-[2] rounded-lg text-base font-bold" onClick={submit}>
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
        )}
      </div>
    </div>
  );
}
