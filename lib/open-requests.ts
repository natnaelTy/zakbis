import { addDays, format, parseISO } from "date-fns";
import { originCurrency, type Currency } from "./money.ts";

export type Country = "US" | "GB" | "CN" | "AE";
export type OpenRequest = { countries: Country[]; neededBy: string };

export const countryLabel: Record<Country, string> = { US: "USA", GB: "UK", CN: "China", AE: "Dubai" };
const inSentence: Record<Country, string> = { US: "the USA", GB: "the UK", CN: "China", AE: "Dubai" };

// All dates are ISO "yyyy-MM-dd", so plain string comparison orders them.
export function isVisibleToTrip(req: OpenRequest, trip: { originCountry: Country; arrivalDate: string; shopBy: string }, today: string) {
  return req.countries.includes(trip.originCountry) && trip.arrivalDate <= req.neededBy && trip.shopBy >= today && req.neededBy >= today;
}

export const addisToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

const plusDays = (today: string, n: number) => format(addDays(parseISO(today), n), "yyyy-MM-dd");

export const neededByRange = (today: string) => ({ min: plusDays(today, 3), max: plusDays(today, 60) });

export function inNeededByRange(date: string, today: string) {
  const { min, max } = neededByRange(today);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= min && date <= max;
}

export const defaultCurrency = (picked: Country[]): Currency => (picked.length ? originCurrency[picked[0]] : "USD");

export function countryList(picked: Country[]) {
  const names = picked.map((c) => inSentence[c]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : (names[0] ?? "");
}
