"use client";

import { useRef, useState } from "react";
import { SignInSheet } from "@/components/auth/sign-in-sheet";
import { createClient } from "@/lib/supabase/client";

/** requireAuth(then) runs `then` right away for a signed-in user with a profile; otherwise opens the sign-in sheet and runs it after. */
export function useRequireAuth(heading: string) {
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  async function requireAuth(then: () => void) {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { data: profile } = await supabase.from("profiles").select("id, first_name").eq("id", data.user.id).maybeSingle();
      if (profile) return then();
    }
    pending.current = then;
    setOpen(true);
  }

  const sheet = (
    <SignInSheet
      open={open}
      onOpenChange={setOpen}
      heading={heading}
      onDone={() => {
        setOpen(false);
        pending.current?.();
        pending.current = null;
      }}
    />
  );

  return { requireAuth, sheet };
}
