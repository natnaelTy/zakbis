"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { btn } from "./offer-card";

const MESSAGES: Record<string, string> = {
  invalid_phone: "Enter an Ethiopian mobile number, like 0911 234 567",
  sms_off: "Phone check opens soon",
  too_soon: "Wait a minute before asking for another code",
  too_many: "Too many codes. Try again in 15 minutes",
  wrong_code: "That code isn't right",
  expired: "That code expired. Send a new one",
  locked: "Too many tries. Send a new code",
  phone_in_use: "This number is on another Zakbis account",
  not_allowed: "This order changed. Please reload.",
  sms_failed: "Couldn't send the SMS. Please try again",
};

async function post(url: string, body: object): Promise<string | null> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  return ((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "server";
}

/** Confirms an Ethiopian mobile by SMS code. With requestId the code also marks that order "I'm in Addis". */
export function PhoneCheck({ requestId, title, hint, onDone }: { requestId?: string; title: string; hint?: string; onDone: () => Promise<void> }) {
  const [available, setAvailable] = useState<boolean>();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/phone").then((r) => r.json()).then((d: { available?: boolean }) => setAvailable(!!d.available), () => setAvailable(false));
  }, []);

  if (available === undefined) return null;
  if (!available)
    return (
      <section className="space-y-1 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-base text-muted-foreground">Phone check opens soon.</p>
      </section>
    );

  async function run(e: React.FormEvent, step: "send" | "verify") {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const err = step === "send" ? await post("/api/phone/send", { phone, requestId }) : await post("/api/phone/verify", { code, requestId });
    setBusy(false);
    if (err) return setError(MESSAGES[err] ?? "Something went wrong. Please try again");
    if (step === "send") return setSent(true);
    await onDone();
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="text-base text-muted-foreground">{hint}</p>}
      {!sent ? (
        <form onSubmit={(e) => void run(e, "send")} noValidate className="space-y-3">
          <label htmlFor="phone" className="text-base font-semibold">
            Ethiopian phone number
          </label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "phone-error" : undefined} />
          {error && <p id="phone-error" role="alert" className="text-base text-destructive">{error}</p>}
          <Button type="submit" className={btn} disabled={busy || !phone.trim()}>
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void run(e, "verify")} noValidate className="space-y-3">
          <label htmlFor="code" className="text-base font-semibold">
            Code from the SMS
          </label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined} />
          {error && <p id="code-error" role="alert" className="text-base text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className={btn} disabled={busy || code.trim().length < 6}>
              Confirm
            </Button>
            <Button type="button" variant="outline" className={btn} onClick={() => (setSent(false), setCode(""), setError(undefined))}>
              Change number
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
