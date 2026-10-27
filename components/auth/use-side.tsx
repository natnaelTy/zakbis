"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Side } from "@/lib/sides";

const CHANGED = "zakbis:side";

/** Tells every useSide() on the page to reload, after sign-in or a switch. */
export const notifySideChanged = () => window.dispatchEvent(new Event(CHANGED));

/** The signed-in user's active side: undefined while loading, null when signed out or no side chosen yet. */
export function useSide() {
  const [side, setSide] = useState<Side | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return setSide(null);
    const { data: profile } = await supabase.from("profiles").select("active_side").eq("id", data.user.id).maybeSingle();
    setSide((profile?.active_side as Side | null) ?? null);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [refresh]);

  return { side, refresh };
}

export async function switchSide(to: Side): Promise<boolean> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return false;
  const { data: updated, error } = await supabase.from("profiles").update({ active_side: to }).eq("id", data.user.id).select("id");
  if (error || !updated?.length) return false;
  notifySideChanged();
  return true;
}
