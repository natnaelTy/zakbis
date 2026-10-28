import { test } from "node:test";
import assert from "node:assert/strict";
import { toTripCard } from "./trips.ts";

const row = { id: "t1", traveler_id: "u1", origin_country: "AE" as const, origin_city: "Dubai", origin_airport: "DXB", shop_by: "2026-11-08", arrival_date: "2026-11-12", free_kg: 6 };

test("maps a trip row with its traveler", () => {
  assert.deepEqual(toTripCard(row, "Hana", { rating: 4.5, review_count: 2, deliveries: 3, verified: true }, "https://x/p.jpg"), {
    id: "t1", travelerId: "u1", travelerName: "Hana", verified: true, deliveries: 3, originCountry: "AE", originCity: "Dubai",
    originAirport: "DXB", shopBy: "2026-11-08", arrivalDate: "2026-11-12", freeKg: 6, photoUrl: "https://x/p.jpg", rating: 4.5, reviewCount: 2,
  });
});

test("missing name, stats and photo fall back", () => {
  const card = toTripCard(row, undefined, undefined, null);
  assert.equal(card.travelerName, "Traveler");
  assert.deepEqual([card.rating, card.reviewCount, card.deliveries, card.verified, card.photoUrl], [0, 0, 0, false, null]);
});

test("numeric strings from Postgres become numbers", () => {
  const card = toTripCard({ ...row, free_kg: "7.5" }, "Hana", { rating: "4.7", review_count: 1, deliveries: 0, verified: true }, null);
  assert.deepEqual([card.freeKg, card.rating], [7.5, 4.7]);
});
