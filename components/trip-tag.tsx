import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { Trip } from "@/lib/sample-data";


const day = (iso: string) => format(parseISO(iso), "d MMM"); // parseISO keeps date-only strings local, no timezone day shift

const tagClass = "group relative block overflow-hidden rounded-t-2xl rounded-b-md border bg-card shadow-[0_1px_2px_rgb(20_36_29/0.06)]";

/** `static` renders the tag as plain content (on the trip page) instead of a link to it. */
export function TripTag({ trip, static: isStatic = false }: { trip: Trip; static?: boolean }) {
  const body = (
    <>
      <div className="flex items-center gap-3 bg-primary px-4 py-2.5 text-primary-foreground">
        <span className="truncate text-sm font-semibold tracking-[0.06em] uppercase">
          {trip.travelerName} · {trip.freeKg} kg free
        </span>
        <span className="ml-auto shrink-0 text-sm font-medium">
          {trip.deliveries > 0
            ? `${trip.deliveries} ${trip.deliveries === 1 ? "delivery" : "deliveries"}`
            : "New traveler"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 px-4 pt-4">
        <div>
          <p className="text-[44px] leading-none font-black tracking-[-0.03em]">{trip.originAirport}</p>
          <p className="mt-1.5 truncate text-base text-muted-foreground">{trip.originCity}</p>
        </div>
        <ArrowRight aria-hidden className="mb-8 size-5 text-muted-foreground" />
        <div className="text-right">
          <p className="text-[44px] leading-none font-black tracking-[-0.03em] text-brand-text">ADD</p>
          <p className="mt-1.5 text-base text-muted-foreground">Addis Ababa</p>
        </div>
      </div>

      {/* Tear line between tag and stub; notches are cut-outs showing the page ground. */}
      <div aria-hidden className="relative mt-4 border-t-2 border-dashed">
        <span className="absolute -top-[11px] -left-[11px] size-5 rounded-full border bg-background" />
        <span className="absolute -top-[11px] -right-[11px] size-5 rounded-full border bg-background" />
      </div>

      <div className="flex items-center gap-6 px-4 py-3 text-base">
        <p className="flex flex-col leading-tight whitespace-nowrap">
          <span className="text-[13px] text-muted-foreground">Shop by</span>
          <span className="font-semibold">{day(trip.shopBy)}</span>
        </p>
        <p className="flex flex-col leading-tight whitespace-nowrap">
          <span className="text-[13px] text-muted-foreground">Lands</span>
          <span className="font-semibold">{day(trip.arrivalDate)}</span>
        </p>
        {!isStatic && (
          <span className="ml-auto flex items-center font-semibold text-brand-text">
            Request
            <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  );

  if (isStatic) return <div className={tagClass}>{body}</div>;

  return (
    <Link
      href={`/trips/${trip.id}`}
      aria-label={`${trip.travelerName}, ${trip.originCity} to Addis Ababa, lands ${day(trip.arrivalDate)}, ${trip.freeKg} kg free. Request an item.`}
      className={`${tagClass} transition-[box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgb(20_36_29/0.10)]`}
    >
      {body}
    </Link>
  );
}
