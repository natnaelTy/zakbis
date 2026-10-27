"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, Key, Logout, QuestionCircle, User as UserIcon, VerifiedCheck, Wallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, invalidProps } from "@/components/request/item-fields";
import { SettingsRow } from "@/components/profile/settings-row";
import { SideToggle } from "@/components/profile/side-toggle";
import { saveProfile, switchSide, useSide } from "@/components/auth/use-side";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { createClient } from "@/lib/supabase/client";
import { addisToday } from "@/lib/open-requests";
import { receiverPhotoSrc } from "@/lib/photos";
import { needsVerifyForm, verificationLabel, verificationState, type VerificationState } from "@/lib/account";
import type { Side } from "@/lib/sides";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;

type Account = {
  firstName: string;
  receiverPhoto: string | null;
  travelerPhotoPath: string | null;
  givenName: string | null;
  verification: VerificationState;
  payout: string | null;
};

/** The Account page: side toggle, profile row, and one row per setting (each opens a page under /profile). */
export function ProfilePanel() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [account, setAccount] = useState<Account>();
  const [askName, setAskName] = useState(false); // switching to receiving without a receiver name yet
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const { side } = useSide();
  const router = useRouter();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");
  const [travelerPhoto, setTravelerPhoto] = useState<string | null>(null);
  const travelerPhotoPath = account?.travelerPhotoPath;

  // The real traveler photo needs a signed link; only make one when it's actually shown.
  useEffect(() => {
    if (side !== "traveler" || !travelerPhotoPath || travelerPhoto) return;
    createClient()
      .storage.from("photos")
      .createSignedUrl(travelerPhotoPath, 3600)
      .then(({ data }) => setTravelerPhoto(data?.signedUrl ?? null));
  }, [side, travelerPhotoPath, travelerPhoto]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (!data.user) return;
    const uid = data.user.id;
    // Never select photo_path: it's a private column and would fail the whole read (see my_photo_path).
    const [{ data: p }, { data: v }, { data: pay }, { data: photoPath }] = await Promise.all([
      supabase.from("profiles").select("first_name, receiver_photo_path").eq("id", uid).maybeSingle(),
      supabase.from("traveler_verifications").select("status, passport_expiry, given_name").eq("user_id", uid).maybeSingle(),
      supabase.from("payout_accounts").select("method, bank_name").eq("user_id", uid).maybeSingle(),
      supabase.rpc("my_photo_path"),
    ]);
    const state = verificationState(v, addisToday(new Date()));
    setAccount({
      firstName: p?.first_name ?? "",
      receiverPhoto: p?.receiver_photo_path ? receiverPhotoSrc(p.receiver_photo_path, (path) => supabase.storage.from("receiver-photos").getPublicUrl(path).data.publicUrl) : null,
      travelerPhotoPath: photoPath,
      givenName: v?.status === "approved" ? v.given_name : null,
      verification: state,
      payout: pay ? (pay.method === "telebirr" ? "Telebirr" : pay.bank_name) : null,
    });
  }, []);
  useEffect(() => void load(), [load]);

  if (user === undefined || (user && (side === undefined || !account))) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;

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

  const a = account!;

  async function pick(to: Side) {
    setMessage(undefined);
    if (to === "receiver" && !a.firstName.trim()) return setAskName(true);
    setBusy(true);
    const ok = await switchSide(to);
    setBusy(false);
    if (!ok) return setMessage("Couldn't switch. Please try again.");
    setAskName(false);
    if (to === "traveler" && needsVerifyForm(a.verification)) router.push("/traveler/verify");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const first = name.trim();
    if (!first || first.length > 40) return setMessage("Enter your first name");
    setBusy(true);
    // Saving the first receiver name is also the switch to receiving.
    const ok = await saveProfile({ first_name: first, active_side: "receiver" });
    setBusy(false);
    if (!ok) return setMessage("Couldn't save your name");
    setAskName(false);
    setAccount({ ...a, firstName: first });
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.reload();
  }

  const shownName = side === "traveler" ? (a.givenName ?? "Not verified yet") : a.firstName;
  const photo = side === "traveler" ? travelerPhoto : side === "receiver" ? a.receiverPhoto : null;
  const label = verificationLabel(a.verification);
  const initial = (side === "traveler" ? a.givenName : side === "receiver" ? a.firstName : null)?.trim()[0]?.toUpperCase();

  const avatar = (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xl font-bold text-brand-text">
      {/* eslint-disable-next-line @next/next/no-img-element -- storage, Telegram and Google hosts */}
      {photo ? <img src={photo} alt="" className="size-full object-cover" /> : (initial ?? <UserIcon aria-hidden className="size-6" />)}
    </span>
  );

  return (
    <div className="mt-5">
      <SideToggle side={side ?? null} onPick={pick} busy={busy} />

      {askName && (
        <form onSubmit={saveName} noValidate className="mt-4 space-y-3 rounded-xl border bg-card p-4">
          <Field id="receiver-name" label="Add the first name travelers will see" error={message}>
            <Input id="receiver-name" autoFocus autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} {...invalidProps(message, "receiver-name")} />
          </Field>
          <Button type="submit" disabled={busy} className="h-11 rounded-lg px-5 text-base font-bold">
            Save and switch to receiving
          </Button>
        </form>
      )}

      {message && !askName && (
        <p role="alert" className="mt-3 text-base text-destructive">
          {message}
        </p>
      )}

      {side ? (
        <Link href="/profile/edit" className="mt-5 flex items-center gap-4 border-b pb-5">
          {avatar}
          <span className="min-w-0 flex-1">
            <span className={`block truncate text-xl font-bold ${shownName === "Not verified yet" ? "text-muted-foreground" : ""}`}>{shownName}</span>
            <span className="text-sm font-medium text-brand-text">Edit profile</span>
          </span>
          <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
        </Link>
      ) : (
        <div className="mt-5 flex items-center gap-4 border-b pb-5">
          {avatar}
          <span className="text-base text-muted-foreground">Choose how you&apos;ll use Zakbis</span>
        </div>
      )}

      <nav aria-label="Account settings" className="mt-2">
        {side === "traveler" && (
          <>
            <SettingsRow href="/profile/verification" icon={VerifiedCheck} label="Verification" status={label?.text} tone={label?.tone} />
            <SettingsRow href="/profile/payout" icon={Wallet} label="Payout method" status={a.payout ?? undefined} />
          </>
        )}
        <SettingsRow href="/profile/sign-in" icon={Key} label="Ways to sign in" />
        {SUPPORT_EMAIL && <SettingsRow href={`mailto:${SUPPORT_EMAIL}`} icon={QuestionCircle} label="Help & support" />}
        <div className="mt-6">
          <SettingsRow onClick={signOut} icon={Logout} label="Sign out" destructive />
        </div>
      </nav>
    </div>
  );
}
