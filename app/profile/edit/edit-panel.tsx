"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/request/item-fields";
import { PhotoUpload } from "@/components/profile/photo-upload";
import { useSide } from "@/components/auth/use-side";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { createClient } from "@/lib/supabase/client";

/** The active side's name and photo. The traveler name comes from the passport and can't be edited. */
export function EditPanel() {
  const { side } = useSide();
  const [name, setName] = useState("");
  const [givenName, setGivenName] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | string>();
  const [signedIn, setSignedIn] = useState<boolean>();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      setSignedIn(!!data.user);
      if (!data.user) return;
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", data.user.id).maybeSingle(),
        supabase.from("traveler_verifications").select("given_name, status").eq("user_id", data.user.id).maybeSingle(),
      ]);
      setName(p?.first_name ?? "");
      setGivenName(v?.status === "approved" ? v.given_name : null);
    })();
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const first = name.trim();
    if (!first || first.length > 40) return setStatus("Enter your first name");
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ first_name: first }).eq("id", data.user!.id);
    setStatus(error ? "Couldn't save your name" : "saved");
  }

  if (signedIn === false)
    return (
      <>
        <Button className="mt-6 h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(() => setSignedIn(true))}>
          Sign in
        </Button>
        {sheet}
      </>
    );
  if (side === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (!side)
    return (
      <Link href="/profile" className="mt-6 inline-block font-semibold text-brand-text">
        Choose how you&apos;ll use Zakbis first
      </Link>
    );

  return (
    <div className="mt-6 space-y-8">
      {side === "receiver" ? (
        <form onSubmit={saveName} noValidate className="space-y-3">
          <Field id="profile-name" label="First name" error={status === "saved" ? undefined : status}>
            <Input id="profile-name" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => (setName(e.target.value), setStatus(undefined))} />
          </Field>
          <Button type="submit" variant="outline" className="h-11 rounded-lg px-5 text-base font-semibold">
            {status === "saved" ? "Saved" : "Save"}
          </Button>
        </form>
      ) : (
        <div className="space-y-1.5">
          <p className="text-base font-semibold">Name</p>
          <p className="text-base">{givenName ?? <span className="text-muted-foreground">Shown once you&apos;re verified</span>}</p>
          {givenName && <p className="text-[13px] text-muted-foreground">From your passport</p>}
        </div>
      )}
      <PhotoUpload key={side} side={side} />
    </div>
  );
}
