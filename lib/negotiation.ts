import type { Side } from "./sides.ts";
import { parseEtb } from "./money.ts";

export type { Side };

export type DeclineReason = "too_heavy" | "cant_find" | "no_space" | "price_low" | "other";
export const DECLINE_REASONS: { key: DeclineReason; label: string }[] = [
  { key: "too_heavy", label: "Too heavy" },
  { key: "cant_find", label: "Can't find it" },
  { key: "no_space", label: "Not enough space" },
  { key: "price_low", label: "Price too low" },
  { key: "other", label: "Other" },
];
export const reasonLabel = (key: string | null) => DECLINE_REASONS.find((r) => r.key === key)?.label;

// Same patterns as has_contact() in migration 0009: 7+ digits (separators allowed), @handles, emails, links.
const CONTACT = [
  /\+?\d(?:[\s.()-]*\d){6,}/,
  /(?:^|[^\w])@\w{3,}/,
  /[\w.+-]+@[\w-]+\.[a-z]+/i,
  /https?:\/\/|www\.|t\.me\/|wa\.me\//i,
];
export const hasContactDetails = (text: string) => CONTACT.some((re) => re.test(text));
export const CONTACT_ERROR = "Please remove phone numbers, @handles, emails and links";

export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "expired" | "closed";
export type OfferView = { status: OfferStatus; turn: Side; reward_etb: number; suggestion_etb: number | null; suggestions_used: number; due_at: string };
export type OfferAction = "accept" | "suggest" | "decline" | "accept_suggestion" | "counter" | "withdraw";

export const MAX_SUGGESTIONS = 3;

/** What the viewer may do now; mirrors the checks in the 0009 functions. */
export function offerActions(o: OfferView, viewer: Side, now: Date): OfferAction[] {
  if (o.status !== "pending" || Date.parse(o.due_at) <= now.getTime()) return [];
  if (viewer === "receiver")
    return o.turn === "receiver" ? ["accept", ...(o.suggestions_used < MAX_SUGGESTIONS ? (["suggest"] as const) : []), "decline"] : ["decline"];
  return o.turn === "traveler" ? ["accept_suggestion", "counter", "withdraw"] : ["withdraw"];
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function suggestionError(raw: string, lastPrice: number, used: number): string | undefined {
  if (used >= MAX_SUGGESTIONS) return "No suggestions left";
  const n = parseEtb(raw);
  if (!n) return "Enter a reward in ETB";
  if (n >= lastPrice) return `Suggest less than ${fmt(lastPrice)} ETB`;
}

export function counterError(raw: string, suggestion: number): string | undefined {
  const n = parseEtb(raw);
  if (!n || n <= suggestion) return `Name more than ${fmt(suggestion)} ETB, or accept ${fmt(suggestion)} ETB`;
}

export function timeLeft(dueIso: string, now: Date): string {
  const min = Math.floor((Date.parse(dueIso) - now.getTime()) / 60_000);
  if (min <= 0) return "Time's up";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h`;
}

export type Stage = "answer" | "waiting" | "offers" | "no_offers" | "pay" | "checking_payment" | "paid" | "closed";

export function stageLabel(stage: Stage, o: { counterpart: string | null; offers: number; dueAt: string | null; now: Date }): string {
  switch (stage) {
    case "answer": return "Your turn";
    case "waiting": return o.counterpart ? `Waiting for ${o.counterpart}` : "Waiting";
    case "offers": return `${o.offers} ${o.offers === 1 ? "offer" : "offers"}`;
    case "no_offers": return "No offers yet";
    case "pay": return o.dueAt ? `Pay within ${timeLeft(o.dueAt, o.now)}` : "Pay now";
    case "checking_payment": return "Checking payment";
    case "paid": return "Paid";
    case "closed": return "Closed";
  }
}
