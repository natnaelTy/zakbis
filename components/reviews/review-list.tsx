import { format, parseISO } from "date-fns";
import { Star } from "@/components/icons";
import { tagLabel } from "@/lib/reviews";

export type ReviewItem = { id: string; author: string; rating: number; tags: string[]; text: string | null; date: string };

/** Visible reviews about one person: stars, first name, month, tags, comment. */
export function ReviewList({ reviews }: { reviews: ReviewItem[] }) {
  return (
    <ul className="mt-2 divide-y border-y">
      {reviews.map((r) => (
        <li key={r.id} className="py-3">
          <p className="flex items-center gap-2 text-base">
            <span className="font-semibold">{r.author}</span>
            <span className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} aria-hidden className={n <= r.rating ? "size-4 fill-current" : "size-4 text-muted-foreground"} />
              ))}
              <span className="sr-only">Rated {r.rating} out of 5</span>
            </span>
            <span className="ml-auto text-[13px] text-muted-foreground">{format(parseISO(r.date), "MMM yyyy")}</span>
          </p>
          {r.tags.length > 0 && <p className="mt-1 text-[13px] text-muted-foreground">{r.tags.map(tagLabel).join(" · ")}</p>}
          {r.text && <p className="mt-1 text-base break-words">{r.text}</p>}
        </li>
      ))}
    </ul>
  );
}
