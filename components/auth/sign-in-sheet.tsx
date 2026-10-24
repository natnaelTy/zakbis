"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, invalidProps } from "@/components/request/item-fields";
import { TelegramButton } from "@/components/auth/telegram-button";
import { createClient } from "@/lib/supabase/client";
import { isInternalEmail, maskEmail } from "@/lib/auth-email";

type Step = "choose" | "code" | "name";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signs the user in (Telegram or email code), then makes sure a profile with a first name exists, then calls onDone. */
export function SignInSheet({ open, onOpenChange, heading, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; heading: string; onDone: () => void }) {
  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Reopening after an earlier sign-in without a name goes straight to the name step.
  useEffect(() => {
    if (!open) return;
    setError(undefined);
    createClient()
      .auth.getUser()
      .then(({ data }) => setStep(data.user ? "name" : "choose"));
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function afterSignIn(fallbackName = "") {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setError("Sign-in didn't complete. Please try again.");
    const { data: profile } = await supabase.from("profiles").select("id, first_name").eq("id", data.user.id).maybeSingle();
    if (profile) return onDone();
    setName(fallbackName);
    setStep("name");
  }

  async function onTelegram(user: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    // A dropped connection must not leave the sheet stuck on "busy".
    const res = await fetch("/api/auth/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(user) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Telegram sign-in failed. Please try again.");
    const { firstName } = (await res.json()) as { firstName: string };
    await afterSignIn(firstName);
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value) || isInternalEmail(value)) return setError("Enter a valid email address");
    setBusy(true);
    setError(undefined);
    const { error } = await createClient().auth.signInWithOtp({ email: value, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setError(error.message);
    setCode("");
    setResendIn(60);
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setError("That code is wrong or has expired");
    await afterSignIn();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const first = name.trim();
    if (!first || first.length > 40) return setError("Enter your first name");
    setBusy(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const { error } = data.user ? await supabase.from("profiles").insert({ id: data.user.id, first_name: first }) : { error: { message: "signed out" } };
    setBusy(false);
    if (error) return setError("Couldn't save your name. Please try again.");
    onDone();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="px-0">
          <SheetTitle className="text-xl font-bold">{step === "name" ? "What should travelers call you?" : heading}</SheetTitle>
          <SheetDescription className="text-base">
            {step === "choose" && "Use Telegram, or get a code by email."}
            {step === "code" && `We sent a code to ${maskEmail(email.trim())}`}
            {step === "name" && "Only your first name is shown to others."}
          </SheetDescription>
        </SheetHeader>

        {step === "choose" && (
          <div className="space-y-4">
            <TelegramButton onAuth={onTelegram} />
            <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>
            <form onSubmit={sendCode} noValidate className="space-y-3">
              <Field id="signin-email" label="Email" error={error}>
                <Input id="signin-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} {...invalidProps(error, "signin-email")} />
              </Field>
              <Button type="submit" variant="outline" disabled={busy} className="h-12 w-full rounded-lg text-base font-semibold">
                Email me a code
              </Button>
            </form>
          </div>
        )}

        {step === "code" && (
          <form onSubmit={verifyCode} noValidate className="space-y-3">
            <Field id="signin-code" label="Code" error={error}>
              <Input
                id="signin-code"
                autoFocus
                {...invalidProps(error, "signin-code")}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-xl tracking-[0.4em]"
              />
            </Field>
            <Button type="submit" disabled={busy || code.length < 6} className="h-12 w-full rounded-lg text-base font-bold">
              Continue
            </Button>
            <div className="flex justify-between text-base">
              <button type="button" className="font-medium text-brand-text disabled:text-muted-foreground" disabled={resendIn > 0 || busy} onClick={() => sendCode()}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
              <button type="button" className="font-medium text-brand-text" onClick={() => setStep("choose")}>
                Use a different email
              </button>
            </div>
          </form>
        )}

        {step === "name" && (
          <form onSubmit={saveName} noValidate className="space-y-3">
            <Field id="signin-name" label="First name" error={error}>
              <Input id="signin-name" autoFocus autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} {...invalidProps(error, "signin-name")} />
            </Field>
            <Button type="submit" disabled={busy} className="h-12 w-full rounded-lg text-base font-bold">
              Continue
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
