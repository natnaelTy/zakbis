import type { Currency } from "./money";

export type Trip = {
  id: string;
  travelerName: string;
  deliveries: number;
  originCountry: "US" | "GB" | "CN" | "AE";
  originCity: string;
  originAirport: string;
  shopBy: string;
  arrivalDate: string;
  freeKg: number;
};

// shortcut: sample trips and rates until the Supabase migration is applied, then query `trips` and `fx_rates` instead.
export const trips: Trip[] = [
  { id: "t1", travelerName: "Hana", deliveries: 0, originCountry: "AE", originCity: "Dubai", originAirport: "DXB", shopBy: "2026-11-08", arrivalDate: "2026-11-12", freeKg: 6 },
  { id: "t2", travelerName: "Dawit", deliveries: 3, originCountry: "US", originCity: "Washington, DC", originAirport: "IAD", shopBy: "2026-11-10", arrivalDate: "2026-11-15", freeKg: 5 },
  { id: "t3", travelerName: "Yonas", deliveries: 0, originCountry: "GB", originCity: "London", originAirport: "LHR", shopBy: "2026-11-12", arrivalDate: "2026-11-18", freeKg: 8 },
  { id: "t4", travelerName: "Selam", deliveries: 1, originCountry: "AE", originCity: "Dubai", originAirport: "DXB", shopBy: "2026-11-16", arrivalDate: "2026-11-20", freeKg: 10 },
];

export const getTrip = (id: string) => trips.find((t) => t.id === id);

export const rates: Record<Currency, number> = { USD: 141.4, GBP: 180, CNY: 19.9, AED: 38.5 };

export const originCurrency: Record<Trip["originCountry"], Currency> = { US: "USD", GB: "GBP", CN: "CNY", AE: "AED" };
