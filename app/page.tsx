import Link from "next/link";
import { Plane } from "@/components/icons";
import { AppShell } from "@/components/app-shell";
import { TripTag } from "@/components/trip-tag";
import { createClient } from "@/lib/supabase/server";
import { loadTripCards } from "@/lib/trips";
import { cn } from "@/lib/utils";

const origins = [
  { code: undefined, label: "All" },
  { code: "US", label: "USA" },
  { code: "GB", label: "UK" },
  { code: "CN", label: "China" },
  { code: "AE", label: "Dubai" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const selected = origins.find((o) => o.code === from) ?? origins[0];
  const trips = await loadTripCards(await createClient());
  const shown = selected.code ? trips.filter((t) => t.originCountry === selected.code) : trips;

  return (
    <AppShell active="Explore">
      <main className="px-4 md:px-0">
        <div className="flex items-baseline justify-between pt-2">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">Trips to Addis</h1>
        </div>

        <nav aria-label="Filter by origin" className="-mx-4 mt-3 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
          <ul className="flex gap-2">
            {origins.map((o) => {
              const on = o === selected;
              return (
                <li key={o.label}>
                  <Link
                    href={o.code ? `/?from=${o.code}` : "/"}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "block rounded-full border bg-card px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:border-foreground/30",
                      on && "border-foreground bg-foreground text-background hover:border-foreground",
                    )}
                  >
                    {o.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {shown.length > 0 ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4">
            {shown.map((trip) => (
              <li key={trip.id}>
                <TripTag trip={trip} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-12 flex flex-col items-center px-6 text-center">
            <Plane aria-hidden className="size-10 text-muted-foreground" />
            <p className="mt-4 font-semibold">No trips from {selected.label} yet</p>
            <p className="mt-1 text-base text-muted-foreground">
              Post an open request and any traveler flying from {selected.label} can take it.
            </p>
            <Link href="/post" className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Post a request
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-base text-muted-foreground">
          Travelers only carry items allowed by their airline and Ethiopian customs.
        </p>
      </main>
    </AppShell>
  );
}
