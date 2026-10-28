import { test } from "node:test";
import assert from "node:assert/strict";
import { addisToday, countryList, defaultCurrency, inNeededByRange, isVisibleToTrip, neededByRange } from "./open-requests.ts";
const trip = { originCountry: "AE" as const, shopBy: "2026-11-08", arrivalDate: "2026-11-12" };

test("visible when country matches, lands by neededBy, can still shop", () => {
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-12" }, trip, "2026-11-01"), true);
});

test("hidden for other countries", () => {
  assert.equal(isVisibleToTrip({ countries: ["US"], neededBy: "2026-12-01" }, trip, "2026-11-01"), false);
});

test("hidden when the trip lands after neededBy", () => {
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-11" }, trip, "2026-11-01"), false);
});

test("hidden when the trip is past shopBy", () => {
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-12-01" }, trip, "2026-11-09"), false);
});

test("hidden when neededBy has passed", () => {
  assert.equal(isVisibleToTrip({ countries: ["AE"], neededBy: "2026-11-12" }, { ...trip, shopBy: "2026-11-20" }, "2026-11-13"), false);
});

test("addisToday is UTC+3", () => {
  assert.equal(addisToday(new Date("2026-10-20T22:30:00Z")), "2026-10-21");
  assert.equal(addisToday(new Date("2026-10-20T20:59:00Z")), "2026-10-20");
});

test("neededByRange is today +3 to +60 days", () => {
  assert.deepEqual(neededByRange("2026-10-20"), { min: "2026-10-23", max: "2026-12-19" });
});

test("inNeededByRange", () => {
  assert.equal(inNeededByRange("2026-10-23", "2026-10-20"), true);
  assert.equal(inNeededByRange("2026-12-19", "2026-10-20"), true);
  for (const d of ["2026-10-22", "2026-12-20", "", "nonsense"]) assert.equal(inNeededByRange(d, "2026-10-20"), false, d);
});

test("defaultCurrency follows the first picked country, USD when none", () => {
  assert.equal(defaultCurrency([]), "USD");
  assert.equal(defaultCurrency(["AE", "US"]), "AED");
});

test("countryList joins with 'or'", () => {
  assert.equal(countryList(["AE"]), "Dubai");
  assert.equal(countryList(["AE", "US"]), "Dubai or the USA");
  assert.equal(countryList(["US", "GB", "CN"]), "the USA, the UK or China");
});
