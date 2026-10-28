import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency } from "./money.ts";
import { addisToday, type Country } from "./open-requests.ts";

/** A live trip as receivers see it on Explore. */
export type TripCard = {
  id: string;
  travelerId: string;
  travelerName: string;
  verified: boolean;
  deliveries: number;
  originCountry: Country;
  originCity: string;
  originAirport: string;
  shopBy: string;
  arrivalDate: string;
  freeKg: number;
  photoUrl: string | null;
  rating: number;
  reviewCount: number;
};

type TripRow = { id: string; traveler_id: string; origin_country: Country; origin_city: string; origin_airport: string; shop_by: string; arrival_date: string; free_kg: number | string };
type Stats = { rating: number | string | null; review_count: number; deliveries: number; verified: boolean };

export function toTripCard(t: TripRow, name: string | undefined, stats: Stats | undefined, photoUrl: string | null): TripCard {
  return {
    id: t.id,
    travelerId: t.traveler_id,
    travelerName: name ?? "Traveler",
    verified: stats?.verified ?? false,
    deliveries: Number(stats?.deliveries ?? 0),
    originCountry: t.origin_country,
    originCity: t.origin_city,
    originAirport: t.origin_airport,
    shopBy: t.shop_by,
    arrivalDate: t.arrival_date,
    freeKg: Number(t.free_kg),
    photoUrl,
    rating: Number(stats?.rating ?? 0),
    reviewCount: Number(stats?.review_count ?? 0),
  };
}

const TRIP_COLUMNS = "id, traveler_id, origin_country, origin_city, origin_airport, shop_by, arrival_date, free_kg";

/** Live trips still open for shopping, soonest landing first; `id` narrows to one trip. */
export async function loadTripCards(supabase: SupabaseClient, opts: { id?: string } = {}): Promise<TripCard[]> {
  let q = supabase.from("trips").select(TRIP_COLUMNS).eq("status", "live").gte("shop_by", addisToday(new Date())).order("arrival_date");
  if (opts.id) q = q.eq("id", opts.id);
  const { data: trips } = await q;
  if (!trips?.length) return [];
  const ids = [...new Set(trips.map((t) => t.traveler_id as string))];
  const [names, stats, profiles] = await Promise.all([
    supabase.from("traveler_names").select("traveler_id, given_name").in("traveler_id", ids),
    supabase.from("traveler_stats").select("traveler_id, rating, review_count, deliveries, verified").in("traveler_id", ids),
    supabase.from("profiles").select("id, photo_blur_path").in("id", ids),
  ]);
  const byId = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) => new Map((rows ?? []).map((r) => [r[key] as string, r]));
  const nameOf = byId(names.data, "traveler_id");
  const statsOf = byId(stats.data, "traveler_id");
  const photoOf = byId(profiles.data, "id");
  return (trips as TripRow[]).map((t) => {
    const path = photoOf.get(t.traveler_id)?.photo_blur_path as string | null | undefined;
    const url = path ? supabase.storage.from("photos-blur").getPublicUrl(path).data.publicUrl : null;
    return toTripCard(t, nameOf.get(t.traveler_id)?.given_name as string | undefined, statsOf.get(t.traveler_id) as Stats | undefined, url);
  });
}

/** Admin-set exchange rates (ETB per unit), as the database will lock them on the request. */
export async function loadRates(supabase: SupabaseClient): Promise<Partial<Record<Currency, number>>> {
  const { data } = await supabase.from("fx_rates").select("currency, etb_per_unit");
  return Object.fromEntries((data ?? []).map((r) => [r.currency, Number(r.etb_per_unit)]));
}
