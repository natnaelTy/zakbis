import type { VerificationState } from "./account.ts";
import type { Country } from "./open-requests.ts";

export type TripStatus = "checking" | "live" | "needs_fix" | "cancelled";

const statusLabels = {
  checking: { text: "Checking ticket", tone: "muted" },
  live: { text: "Live", tone: "good" },
  needs_fix: { text: "Fix needed", tone: "bad" },
  cancelled: { text: "Cancelled", tone: "muted" },
} as const;

export const tripStatusLabel = (s: TripStatus) => statusLabels[s];

/** A row of my_trips(): the owner's full trip, private columns included. */
export type MyTrip = {
  id: string;
  origin_country: Country;
  origin_city: string;
  origin_airport: string;
  shop_by: string;
  arrival_date: string;
  free_kg: number;
  note: string | null;
  status: TripStatus;
  proof_kind: "ticket" | "roster";
  proof_path: string;
  rejection_reason: string | null;
};

export type TripDraft = {
  origin_country: Country | "";
  origin_city: string;
  origin_airport: string;
  arrival_date: string;
  shop_by: string;
  free_kg: string;
  note: string;
  customs: boolean;
  crew: boolean;
  proof_kind: "ticket" | "roster";
};

/** Mirrors the trips table checks and trips_guard; dates are ISO "yyyy-MM-dd", so strings compare in order. */
/** `passportExpiry`, when known, catches what trips_guard would refuse before the ticket is uploaded. */
export function tripErrors(d: TripDraft, today: string, passportExpiry?: string) {
  const e: Partial<Record<keyof TripDraft, string>> = {};
  if (!d.origin_country) e.origin_country = "Choose a country";
  if (!d.origin_city.trim()) e.origin_city = "Enter the city";
  if (!/^[A-Za-z]{3}$/.test(d.origin_airport.trim())) e.origin_airport = "Enter the 3-letter airport code";
  if (!d.arrival_date || d.arrival_date < today) e.arrival_date = "Choose your landing date";
  else if (passportExpiry && d.arrival_date > passportExpiry) e.arrival_date = "Your passport must be valid until you land";
  if (!d.shop_by || d.shop_by < today || (d.arrival_date && d.shop_by > d.arrival_date)) e.shop_by = "Shop-by must be on or before landing";
  const kg = Number(d.free_kg);
  if (!d.free_kg.trim() || !(kg >= 1 && kg <= 50)) e.free_kg = "Enter free kg between 1 and 50";
  if (!d.customs) e.customs = "Tick to continue";
  if (d.proof_kind === "roster" && !d.crew) e.crew = "Tick to continue";
  return e;
}

export const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Matches the tickets bucket limits; images are also decoded in the form. */
export const proofError = (f: { type: string; size: number }) =>
  PROOF_TYPES.includes(f.type) && f.size <= 10485760 ? undefined : "Please choose a PDF, JPG, PNG or WebP under 10 MB";

export function postGate(s: VerificationState): "form" | "pending" | "verify" | "expired" {
  if (s === "verified") return "form";
  if (s === "pending" || s === "expired") return s;
  return "verify";
}

/** A new landing date or proof type needs a new file; otherwise a resubmission may keep the old one. */
export const needsNewProof = (initial: Pick<TripDraft, "arrival_date" | "proof_kind"> | undefined, d: TripDraft) =>
  !initial || d.arrival_date !== initial.arrival_date || d.proof_kind !== initial.proof_kind;

export const STEP_FIELDS: (keyof TripDraft | "proof")[][] = [["proof"], ["origin_country", "origin_city", "origin_airport", "arrival_date"], ["shop_by", "free_kg", "customs", "crew"]];

export function firstBadStep(errors: Partial<Record<keyof TripDraft | "proof", string>>) {
  const i = STEP_FIELDS.findIndex((fields) => fields.some((k) => errors[k]));
  return i < 0 ? undefined : i;
}

const CHECKED: (keyof TripDraft)[] = ["origin_country", "origin_city", "origin_airport", "shop_by", "arrival_date", "proof_kind"];

/** Mirrors trips_guard: whether saving sends the trip back to the admin (kg and note alone don't). */
export const isRecheck = (initial: (Partial<TripDraft> & { status?: TripStatus }) | undefined, d: TripDraft, hasFile: boolean) =>
  !initial || hasFile || initial.status === "needs_fix" || CHECKED.some((k) => d[k] !== initial[k]);
