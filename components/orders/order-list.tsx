"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { stageLabel, type Side, type Stage } from "@/lib/negotiation";
import { cn } from "@/lib/utils";

export type OrderRow = {
  id: string;
  kind: "trip" | "open";
  item_name: string;
  quantity: number;
  status: string;
  stage: Stage;
  due_at: string | null;
  counterpart: string | null;
  offers: number;
  created_at: string;
};

const needsYou = (s: Stage) => s === "answer" || s === "offers" || s === "pay";

/** The caller's requests (receiver) or the requests they answer and offer on (traveler); their turn first. */
export function OrderList({ side }: { side: Side }) {
  const [rows, setRows] = useState<OrderRow[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    createClient()
      .rpc("my_orders", { p_side: side })
      .then(({ data, error }) => {
        if (error) return setFailed(true);
        const list = (data as OrderRow[] | null) ?? [];
        // my_orders is newest first; a stable sort keeps that order within each group.
        setRows([...list].sort((a, b) => Number(needsYou(b.stage)) - Number(needsYou(a.stage))));
      });
  }, [side]);

  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load your orders. Please reload.
      </p>
    );
  if (!rows) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="mt-6 text-base text-muted-foreground">No orders yet</p>;

  const now = new Date();
  return (
    <ul className="mt-4 divide-y border-y">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/orders/requests/${r.id}`} className={cn("flex min-h-16 items-center gap-3 py-3", r.stage === "closed" && "opacity-60")}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">
                {r.item_name}
                {r.quantity > 1 && ` × ${r.quantity}`}
              </span>
              <span className="text-[13px] text-muted-foreground">{r.kind === "open" ? "Open request" : side === "receiver" ? `From ${r.counterpart ?? "a traveler"}` : `For ${r.counterpart}`}</span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[13px] font-semibold",
                needsYou(r.stage) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {stageLabel(r.stage, { counterpart: r.counterpart, offers: r.offers, dueAt: r.due_at, now })}
            </span>
            <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
