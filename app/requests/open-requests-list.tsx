"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, User } from "@/components/icons";
import { VerificationStatus } from "@/components/traveler/verification-status";
import { etb } from "@/lib/money";
import { countryLabel } from "@/lib/open-requests";
import { loadTravelerView } from "./traveler-data";

type View = Awaited<ReturnType<typeof loadTravelerView>>;

/** Open requests one of the traveler's live trips can serve, minus ones they already offered on. */
export function OpenRequestsList() {
  const [view, setView] = useState<View>();
  const [failed, setFailed] = useState(false);
  useEffect(() => void loadTravelerView().then(setView, () => setFailed(true)), []);

  if (failed)
    return (
      <p role="alert" className="mt-6 text-base text-destructive">
        Couldn&apos;t load open requests. Please reload.
      </p>
    );
  if (!view) return <p className="mt-6 text-base text-muted-foreground">Loading…</p>;
  if (!view.ready)
    return (
      <div className="mt-4">
        <VerificationStatus verification={view.verification} />
      </div>
    );
  if (!view.trips.length)
    return (
      <div className="mt-6 space-y-3">
        <p className="text-base text-muted-foreground">Post a trip to make offers</p>
        <Link href="/trips/new" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 text-base font-semibold">
          Post a trip
        </Link>
      </div>
    );
  if (!view.requests.length) return <p className="mt-6 text-base text-muted-foreground">No open requests for your trips yet</p>;

  return (
    <ul className="mt-4 divide-y border-y">
      {view.requests.map((r) => (
        <li key={r.id}>
          <Link href={`/requests/${r.id}`} className="flex min-h-16 items-center gap-3 py-3">
            <span className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- receiver photo, public by design */}
              {r.receiverPhoto ? <img src={r.receiverPhoto} alt="" className="size-full object-cover" /> : <User aria-hidden className="size-full p-2 text-muted-foreground" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold">
                {r.item_name}
                {r.quantity > 1 && ` × ${r.quantity}`}
              </span>
              <span className="block text-[13px] text-muted-foreground">
                {r.receiverName} · {r.countries.map((c) => countryLabel[c]).join(", ")} · by {format(parseISO(r.needed_by), "d MMM")}
              </span>
            </span>
            <span className="shrink-0 text-base font-semibold tabular-nums">≈ {etb(r.item_etb)}</span>
            <ArrowRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
