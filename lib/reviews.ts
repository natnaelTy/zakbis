import type { Side } from "./sides.ts";

/** Ratings show from this many visible reviews; before that a person is "New". */
export const MIN_REVIEWS = 3;

// Same keys as review_tag_ok() in migration 0012.
export const TRAVELER_TAGS = [
  { key: "easy_to_reach", label: "Easy to reach" },
  { key: "on_time", label: "On time" },
  { key: "polite", label: "Polite" },
  { key: "as_described", label: "Item as described" },
];
export const RECEIVER_TAGS = [
  { key: "easy_to_reach", label: "Easy to reach" },
  { key: "on_time", label: "On time" },
  { key: "polite", label: "Polite" },
  { key: "clear_request", label: "Clear request" },
];
export const REPORT_REASONS = [
  { key: "contact", label: "Contact details" },
  { key: "abusive", label: "Abusive" },
  { key: "untrue", label: "Not true" },
];

export const tagLabel = (key: string) => [...TRAVELER_TAGS, ...RECEIVER_TAGS].find((t) => t.key === key)?.label ?? key;

export type TagCount = { tag: string; n: number };

/** "New traveler", or "4.6 · 12 reviews · Polite 9 · On time 7" (the two most common tags). */
export function summaryLine({ rating, count, tags }: { rating: number | null; count: number; tags: TagCount[] }, side: Side): string {
  if (count < MIN_REVIEWS || rating === null) return side === "traveler" ? "New traveler" : "New receiver";
  const top = [...tags].sort((a, b) => b.n - a.n).slice(0, 2).map((t) => `${tagLabel(t.tag)} ${t.n}`);
  return [`${rating.toFixed(1)}`, `${count} reviews`, ...top].join(" · ");
}

/** Days left in the 14-day review window, or null once it has closed. */
export function reviewWindowLeft(openAt: string, now: Date): string | null {
  const ms = Date.parse(openAt) + 14 * 86_400_000 - now.getTime();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / 86_400_000);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}
