"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { etb, parseEtb, takeHome } from "@/lib/money";

/** Zakbis's current cut in percent, from the settings table; undefined while loading. */
export function useFeePct() {
  const [pct, setPct] = useState<number>();
  useEffect(() => void createClient().rpc("fee_pct").then(({ data }) => typeof data === "number" && setPct(data)), []);
  return pct;
}

/** "You get N ETB" under a traveler's price input, once the amount parses. Receivers never see it. */
export function TakeHomeLine({ raw, pct }: { raw: string; pct: number | undefined }) {
  const n = parseEtb(raw);
  if (!n || pct === undefined) return null;
  return <p className="text-[13px] text-muted-foreground">You get {etb(takeHome(n, pct))}</p>;
}
