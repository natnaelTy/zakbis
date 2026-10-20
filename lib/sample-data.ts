import type { Currency } from "./money";

export type Trip = {
  id: string;
  travelerName: string;
  verified: boolean;
  deliveries: number;
  originCountry: "US" | "GB" | "CN" | "AE";
  originCity: string;
  originAirport: string;
  shopBy: string;
  arrivalDate: string;
  freeKg: number;
  photoUrl: string;
  rating: number;
  reviewCount: number;
  reviews: Review[];
};

export type Review = { author: string; rating: number; text: string; date: string };

// shortcut: sample trips, reviews and rates until the Supabase migration is applied, then query `trips` and `fx_rates` instead.
export const trips: Trip[] = [
  { id: "t1", travelerName: "Hana", verified: true, deliveries: 0, originCountry: "AE", originCity: "Dubai", originAirport: "DXB", shopBy: "2026-11-08", arrivalDate: "2026-11-12", freeKg: 6, photoUrl: "/sample/hana.svg", rating: 0, reviewCount: 0, reviews: [] },
  { id: "t2", travelerName: "Dawit", verified: true, deliveries: 3, originCountry: "US", originCity: "Washington, DC", originAirport: "IAD", shopBy: "2026-11-10", arrivalDate: "2026-11-15", freeKg: 5, photoUrl: "/sample/dawit.svg", rating: 4.7, reviewCount: 3,
    reviews: [
      { author: "Meron", rating: 5, text: "Brought my laptop sealed in the box, exactly as ordered.", date: "2026-09-02" },
      { author: "Abel", rating: 5, text: "Quick handover at Bole and very clear messages.", date: "2026-06-21" },
      { author: "Tsion", rating: 4, text: "Arrived a day later than planned, but I got updates the whole way.", date: "2026-04-10" },
    ] },
  { id: "t3", travelerName: "Yonas", verified: false, deliveries: 0, originCountry: "GB", originCity: "London", originAirport: "LHR", shopBy: "2026-11-12", arrivalDate: "2026-11-18", freeKg: 8, photoUrl: "/sample/yonas.svg", rating: 0, reviewCount: 0, reviews: [] },
  { id: "t4", travelerName: "Selam", verified: false, deliveries: 1, originCountry: "AE", originCity: "Dubai", originAirport: "DXB", shopBy: "2026-11-16", arrivalDate: "2026-11-20", freeKg: 10, photoUrl: "/sample/selam.svg", rating: 5, reviewCount: 1,
    reviews: [{ author: "Kidus", rating: 5, text: "The perfume came with the store receipt. Easy and friendly.", date: "2026-08-15" }] },
];

export const getTrip = (id: string) => trips.find((t) => t.id === id);

export const rates: Record<Currency, number> = { USD: 141.4, GBP: 180, CNY: 19.9, AED: 38.5 };

export const originCurrency: Record<Trip["originCountry"], Currency> = { US: "USD", GB: "GBP", CN: "CNY", AE: "AED" };
