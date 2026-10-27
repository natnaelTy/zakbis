"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SignInSheet } from "@/components/auth/sign-in-sheet";
import { createClient } from "@/lib/supabase/client";
import { afterSignIn, type Side } from "@/lib/sides";

/**
 * requireAuth(then) runs `then` right away for a signed-in user with a side; otherwise opens the sign-in sheet and,
 * once it finishes, runs it or moves to the chosen side's start (see afterSignIn). `needs` is the side `then` belongs to.
 */
export function useRequireAuth(heading: string, needs?: Side) {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const router = useRouter();

  async function requireAuth(then: () => void) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("active_side").eq("id", data.user.id).maybeSingle();
      // The wrong side is left to SideGate, which offers the switch.
      if (profile?.active_side) return profile.active_side === (needs ?? profile.active_side) ? then() : undefined;
    }
    pending.current = then;
    setOpen(true);
  }

  const sheet = (
    <SignInSheet
      open={open}
      onOpenChange={setOpen}
      heading={heading}
      onDone={(side, isNew) => {
        setOpen(false);
        const next = afterSignIn(needs, side, isNew);
        if (next === "run") pending.current?.();
        else router.push(next.push);
        pending.current = null;
      }}
    />
  );

  return { requireAuth, sheet };
}
