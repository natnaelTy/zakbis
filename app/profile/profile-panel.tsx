"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/request/item-fields";
import { TelegramButton } from "@/components/auth/telegram-button";
import { loadMyVerification, VerificationStatus } from "@/components/traveler/verification-status";
import { PhotoUpload } from "@/components/profile/photo-upload";
import { notifySideChanged, switchSide, useSide } from "@/components/auth/use-side";
import { addisToday } from "@/lib/open-requests";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { createClient } from "@/lib/supabase/client";
import { isInternalEmail, maskEmail } from "@/lib/auth-email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN_TELEGRAM = "This Telegram account already has its own Zakbis account. Sign in with it instead.";
const TAKEN_EMAIL = "This email already has its own Zakbis account. Sign in with it instead.";

export function ProfilePanel() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string>();
  const [givenName, setGivenName] = useState<string | null>(null);
  const [askName, setAskName] = useState(false); // traveler switching to receiving without a receiver name yet
  const { side } = useSide();
  const router = useRouter();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (data.user) {
      const [{ data: profile }, { data: v }] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", data.user.id).maybeSingle(),
        supabase.from("traveler_verifications").select("given_name, status").eq("user_id", data.user.id).maybeSingle(),
      ]);
      setName(profile?.first_name ?? "");
      setGivenName(v?.status === "approved" ? v.given_name : null);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (user === undefined || (user && side === undefined)) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;

  if (!user)
    return (
      <div className="mt-6 space-y-4">
        <p className="text-base text-muted-foreground">Sign in to send requests, post them, and see your activity.</p>
        <Button className="h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(load)}>
          Sign in
        </Button>
        {sheet}
      </div>
    );

  const hasTelegram = typeof user.app_metadata?.telegram_id === "number";
  const realEmail = user.email && !isInternalEmail(user.email) ? user.email : null;
  const hasGoogle = !!user.identities?.some((i) => i.provider === "google");

  async function connectGoogle() {
    // Redirects to Google and back to /auth/callback; fine here, there's no form to lose.
    const { error } = await createClient().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/profile` },
    });
    if (error) setMessage(/already|exists|linked/i.test(error.message) ? "This Google account already has its own Zakbis account. Sign in with it instead." : "Couldn't connect Google. Please try again.");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const first = name.trim();
    if (!first || first.length > 40) return setMessage("Enter your first name");
    // From the traveler side, saving the first receiver name is also the switch to receiving.
    const fields = askName ? { first_name: first, active_side: "receiver" } : { first_name: first };
    const { error } = await createClient().from("profiles").update(fields).eq("id", user!.id);
    setMessage(error ? "Couldn't save your name" : undefined);
    setSaved(!error);
    if (!error && askName) {
      notifySideChanged();
      router.push("/");
    }
  }

  async function switchTo(to: "receiver" | "traveler") {
    if (to === "receiver" && !name.trim()) return setAskName(true);
    if (!(await switchSide(to))) return setMessage("Couldn't switch. Please try again.");
    if (to === "receiver") return router.push("/");
    const v = await loadMyVerification();
    router.push(v?.status === "approved" && v.passport_expiry >= addisToday(new Date()) ? "/requests" : "/traveler/verify");
  }

  async function connectTelegram(data: Record<string, unknown>) {
    const res = await fetch("/api/auth/telegram/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setMessage(res.status === 409 ? TAKEN_TELEGRAM : res.ok ? undefined : "Couldn't connect Telegram. Please try again.");
    if (res.ok) {
      await createClient().auth.refreshSession(); // pick up the new telegram_id in app_metadata
      await load();
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.reload();
  }

  return (
    <div className="mt-6 space-y-8">
      <p className="text-base font-semibold text-brand-text">{side === "traveler" ? "You're traveling" : "You're receiving"}</p>

      {(side === "receiver" || askName) && (
        <form onSubmit={saveName} noValidate className="space-y-3">
          <Field id="profile-name" label="First name" hint={askName ? "Travelers see this name when you receive." : "Only your first name is shown to others."}>
            <Input id="profile-name" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} />
          </Field>
          <Button type="submit" variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold">
            {askName ? "Save and switch to receiving" : saved ? "Saved" : "Save"}
          </Button>
        </form>
      )}

      {side === "traveler" && (
        <div className="space-y-1.5">
          <p className="text-base font-semibold">Name</p>
          <p className="text-base">{givenName ?? <span className="text-muted-foreground">Shown once you&apos;re verified</span>}</p>
          {givenName && <p className="text-[13px] text-muted-foreground">From your passport</p>}
        </div>
      )}

      {side && <PhotoUpload key={side} side={side} />}

      {side === "traveler" && <VerificationStatus />}

      {side && !askName && (
        <Button variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold" onClick={() => switchTo(side === "traveler" ? "receiver" : "traveler")}>
          {side === "traveler" ? "Switch to receiving" : "Switch to traveling"}
        </Button>
      )}

      <section aria-labelledby="signin-methods" className="space-y-4">
        <h2 id="signin-methods" className="text-lg font-bold">
          Ways to sign in
        </h2>
        <p className="text-[13px] text-muted-foreground">Only you can see these.</p>

        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Telegram</p>
          {hasTelegram ? (
            <p className="mt-1 flex items-center gap-1.5 text-base text-brand-text">
              <Check aria-hidden className="size-4" /> Connected
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-base text-muted-foreground">Connect Telegram to sign in with it on any device.</p>
              <TelegramButton onAuth={connectTelegram} />
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Google</p>
          {hasGoogle ? (
            <p className="mt-1 flex items-center gap-1.5 text-base text-brand-text">
              <Check aria-hidden className="size-4" /> Connected
            </p>
          ) : (
            <Button variant="outline" className="mt-3 h-11 rounded-lg px-5 text-base font-semibold" onClick={connectGoogle}>
              Connect Google
            </Button>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Email</p>
          {realEmail ? <p className="mt-1 text-base">{realEmail}</p> : <AddEmail onAdded={load} onTaken={() => setMessage(TAKEN_EMAIL)} />}
        </div>

        {message && (
          <p role="alert" className="text-base text-destructive">
            {message}
          </p>
        )}
      </section>

      <p className="text-[13px] text-muted-foreground">
        Your account ID: <code className="select-all break-all">{user.id}</code>{" "}
        <button type="button" className="font-semibold text-brand-text" onClick={() => navigator.clipboard?.writeText(user.id)}>
          Copy
        </button>
      </p>

      <Button variant="ghost" className="h-11 px-0 text-base font-semibold text-destructive hover:bg-transparent" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}

/** Replaces a Telegram account's internal address with a real email, confirmed by a code sent to it. */
function AddEmail({ onAdded, onTaken }: { onAdded: () => void; onTaken: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value) || isInternalEmail(value)) return setError("Enter a valid email address");
    const { error } = await createClient().auth.updateUser({ email: value });
    if (error) return /already|registered|exists/i.test(error.message) ? (setError(undefined), onTaken()) : setError(error.message);
    setError(undefined);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email_change" });
    if (error) return setError("That code is wrong or has expired");
    onAdded();
  }

  if (!sent)
    return (
      <form onSubmit={send} noValidate className="mt-3 space-y-3">
        <Field id="add-email" label="Add an email" hint="Then you can also sign in with an email code." error={error}>
          <Input id="add-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold">
          Send code
        </Button>
      </form>
    );

  return (
    <form onSubmit={verify} noValidate className="mt-3 space-y-3">
      <Field id="add-email-code" label={`Code sent to ${maskEmail(email.trim())}`} error={error}>
        <Input
          id="add-email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="text-center text-xl tracking-[0.4em]"
        />
      </Field>
      <Button type="submit" disabled={code.length < 6} className="h-11 rounded-lg px-5 text-base font-bold">
        Confirm email
      </Button>
    </form>
  );
}
