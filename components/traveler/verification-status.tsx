"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Clock, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type Verification = { status: "pending" | "approved" | "rejected"; rejection_reason: string | null; passport_expiry: string } | null;

export async function loadMyVerification(): Promise<Verification> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase.from("traveler_verifications").select("status, rejection_reason, passport_expiry").eq("user_id", auth.user.id).maybeSingle();
  return (data as Verification) ?? null;
}

const linkClass = "mt-3 inline-flex h-11 items-center rounded-lg border bg-card px-5 text-base font-semibold";

/** Traveler status on Profile (and in front of "Post a trip" later). */
export function VerificationStatus({ verification }: { verification?: Verification }) {
  const [v, setV] = useState<Verification | undefined>(verification);
  useEffect(() => {
    if (verification === undefined) loadMyVerification().then(setV);
  }, [verification]);
  if (v === undefined) return null;

  return (
    <section aria-labelledby="traveler-status" className="rounded-xl border bg-card p-4">
      <h2 id="traveler-status" className="text-lg font-bold">
        Traveler
      </h2>
      {!v && (
        <>
          <p className="mt-1 text-base text-muted-foreground">Carry items to Addis and earn a reward. A quick one-time check first.</p>
          <Link href="/traveler/verify" className={linkClass}>
            Become a traveler
          </Link>
        </>
      )}
      {v?.status === "pending" && (
        <p className="mt-1 flex gap-2 text-base">
          <Clock aria-hidden className="mt-1 size-4 shrink-0 text-warning" />
          We&apos;re checking your documents. You can prepare trips, but they&apos;ll stay hidden until you&apos;re approved.
        </p>
      )}
      {v?.status === "approved" && (
        <p className="mt-1 flex items-center gap-2 text-base text-brand-text">
          <BadgeCheck aria-hidden className="size-4 shrink-0" /> You&apos;re a verified traveler.
        </p>
      )}
      {v?.status === "rejected" && (
        <>
          <p className="mt-1 flex gap-2 text-base">
            <ShieldAlert aria-hidden className="mt-1 size-4 shrink-0 text-destructive" />
            We couldn&apos;t verify you: {v.rejection_reason}
          </p>
          <Link href="/traveler/verify" className={linkClass}>
            Fix and resubmit
          </Link>
        </>
      )}
    </section>
  );
}
