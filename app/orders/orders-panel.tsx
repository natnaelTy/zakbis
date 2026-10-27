"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/use-require-auth";
import { useSide } from "@/components/auth/use-side";
import { StatusPill } from "@/components/trips/status-pill";
import { createClient } from "@/lib/supabase/client";
import { addisToday, countryLabel } from "@/lib/open-requests";
import type { MyTrip } from "@/lib/trip-post";
import { cn } from "@/lib/utils";

const empty = <p className="mt-6 text-base text-muted-foreground">No orders yet</p>;

/** Receivers: their orders (none yet). Travelers: Trips | Orders, trips first. */
export function OrdersPanel() {
  const { side } = useSide();
  const { requireAuth, sheet } = useRequireAuth("Sign in to Zakbis");
  const [tab, setTab] = useState<"trips" | "orders">("trips");
  const [trips, setTrips] = useState<MyTrip[]>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (side !== "traveler") return;
    createClient()
      .rpc("my_trips")
      .then(({ data, error }) => (error ? setFailed(true) : setTrips((data as MyTrip[] | null) ?? [])));
  }, [side]);

  if (side === undefined) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (side === null)
    return (
      <div className="mt-6 space-y-4">
        <p className="text-base text-muted-foreground">Sign in to see your orders.</p>
        <Button className="h-12 w-full rounded-lg text-base font-bold" onClick={() => requireAuth(() => {})}>
          Sign in
        </Button>
        {sheet}
      </div>
    );
  if (side === "receiver") return empty;

  const today = addisToday(new Date());
  const upcoming = (t: MyTrip) => t.status !== "cancelled" && t.arrival_date >= today;
  // my_trips is newest landing first; show upcoming trips soonest first, then past and cancelled ones.
  const shown = trips && [...trips.filter(upcoming).reverse(), ...trips.filter((t) => !upcoming(t))];

  return (
    <div className="mt-4">
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
        {(["trips", "orders"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={cn("h-11 rounded-lg text-base font-semibold transition-colors", tab === k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {k === "trips" ? "Trips" : "Orders"}
          </button>
        ))}
      </div>

      {tab === "orders" ? (
        empty
      ) : failed ? (
        <p role="alert" className="mt-6 text-base text-destructive">
          Couldn&apos;t load your trips. Please reload.
        </p>
      ) : !shown ? (
        <p className="mt-6 text-base text-muted-foreground">Loading…</p>
      ) : !shown.length ? (
        <div className="mt-6 space-y-3">
          <p className="text-base text-muted-foreground">No trips yet</p>
          <Link href="/trips/new" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 text-base font-semibold">
            Post a trip
          </Link>
        </div>
      ) : (
        <ul className="mt-4 divide-y border-y">
          {shown.map((t) => (
            <li key={t.id}>
              <Link href={`/orders/trips/${t.id}`} className={cn("flex min-h-16 items-center gap-3 py-3", !upcoming(t) && "opacity-60")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {countryLabel[t.origin_country]} · {t.origin_city}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    Lands {format(parseISO(t.arrival_date), "d MMM")} · {t.free_kg} kg free
                  </span>
                </span>
                <StatusPill status={t.status} />
                <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
