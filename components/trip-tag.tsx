import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, Plane, Star, User } from "@/components/icons";
import { AE, CN, ET, GB, US } from "country-flag-icons/react/3x2";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { TripCard as Trip } from "@/lib/trips";


const day = (iso: string) => format(parseISO(iso), "d MMM"); // parseISO keeps date-only strings local, no timezone day shift

const flags = { US, GB, CN, AE };
const flagClass = "h-8 w-12 shrink-0 rounded-[3px] ring-1 ring-border"; // ring keeps white flag edges visible on white stock

export const ratingLabel = (trip: Trip) =>
  trip.reviewCount > 0 ? `Rated ${trip.rating.toFixed(1)} out of 5, ${trip.reviewCount} ${trip.reviewCount === 1 ? "review" : "reviews"}` : "No reviews yet";

const tagClass = "group relative block overflow-hidden rounded-t-2xl rounded-b-md border bg-card shadow-[0_1px_2px_rgb(20_36_29/0.06)]";

/**
 * `static` renders the tag as plain content (on the trip page) instead of a link to it.
 * `revealPhoto` unblurs the traveler photo; pass it only once the receiver's request is accepted.
 */
export function TripTag({ trip, static: isStatic = false, revealPhoto = false }: { trip: Trip; static?: boolean; revealPhoto?: boolean }) {
  const Flag = flags[trip.originCountry];
  const body = (
    <>
      <div className="flex items-center gap-2.5 bg-primary py-2 pr-4 pl-3 text-primary-foreground">
        <Tooltip>
          {/* span, not the default button: the trigger sits inside the card link */}
          <TooltipTrigger render={<span />} className="size-7 shrink-0 overflow-hidden rounded-full bg-card ring-2 ring-primary-foreground/15">
            {/* shortcut: CSS blur only hides the face visually; serve a server-blurred image until acceptance once real photos exist. */}
            {trip.photoUrl ? (
              <img src={trip.photoUrl} alt="" className={revealPhoto ? "size-full object-cover" : "size-full scale-125 object-cover blur-md"} />
            ) : (
              <User aria-hidden className="size-full p-1 text-muted-foreground" />
            )}
          </TooltipTrigger>
          <TooltipContent className="text-sm">
            {revealPhoto ? trip.travelerName : `${trip.travelerName}'s photo is shown once your request is accepted`}
          </TooltipContent>
        </Tooltip>
        <span className="flex min-w-0 items-center gap-1 text-sm font-semibold tracking-[0.06em] uppercase">
          <span className="truncate">{trip.travelerName}</span>
          {/* Shimmer only on the single trip-page tag, not on every card in the list. */}
          {trip.verified && <VerifiedBadge size={16} variant={isStatic ? "shimmer" : "static"} />}
          <span className="shrink-0">· {trip.freeKg} kg free</span>
        </span>
        {trip.reviewCount > 0 ? (
          <span className="ml-auto flex shrink-0 items-center gap-1 text-sm">
            <Star aria-hidden className="size-3.5" />
            <span aria-hidden>
              <span className="font-semibold">{trip.rating.toFixed(1)}</span> · {trip.reviewCount} {trip.reviewCount === 1 ? "review" : "reviews"}
            </span>
            <span className="sr-only">{ratingLabel(trip)}</span>
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-sm font-medium">New traveler</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 px-4 pt-4">
        <div className="min-w-0">
          <Flag aria-hidden className={flagClass} />
          <p className="mt-2 text-lg leading-snug font-semibold [overflow-wrap:anywhere]">{trip.originCity}</p>
        </div>
        <Plane aria-hidden className="mb-1.5 size-6 rotate-45 text-brand-text" /> {/* Solar's plane points up-right; 45° makes it fly toward Addis */}
        <div className="flex min-w-0 flex-col items-end">
          <ET aria-hidden className={flagClass} />
          <p className="mt-2 text-right text-base leading-snug text-muted-foreground">Addis Ababa</p>
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
          <span className="text-lg leading-tight font-bold">{day(trip.arrivalDate)}</span>
        </p>
        {!isStatic && (
          <span className="ml-auto flex items-center font-semibold text-brand-text">
            Request
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </div>
    </>
  );

  if (isStatic) return <div className={tagClass}>{body}</div>;

  return (
    <Link
      href={`/trips/${trip.id}`}
      aria-label={`${trip.travelerName}${trip.verified ? " (verified)" : ""}, ${trip.originCity} to Addis Ababa, lands ${day(trip.arrivalDate)}, ${trip.freeKg} kg free. ${ratingLabel(trip)}. Request an item.`}
      className={`${tagClass} transition-[box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgb(20_36_29/0.10)]`}
    >
      {body}
    </Link>
  );
}
