import { test } from "node:test";
import assert from "node:assert/strict";
import { firstBadStep, isRecheck, needsNewProof, postGate, proofError, tripErrors, tripStatusLabel, type TripDraft } from "./trip-post.ts";

const today = "2026-10-27";
const ok: TripDraft = {
  origin_country: "AE", origin_city: "Dubai", origin_airport: "dxb", arrival_date: "2026-11-12", shop_by: "2026-11-10",
  free_kg: "5", note: "", customs: true, crew: false, proof_kind: "ticket",
};

test("status labels", () => {
  assert.deepEqual(tripStatusLabel("checking"), { text: "Checking ticket", tone: "muted" });
  assert.deepEqual(tripStatusLabel("live"), { text: "Live", tone: "good" });
  assert.deepEqual(tripStatusLabel("needs_fix"), { text: "Fix needed", tone: "bad" });
  assert.deepEqual(tripStatusLabel("cancelled"), { text: "Cancelled", tone: "muted" });
});

test("a valid draft has no errors", () => assert.deepEqual(tripErrors(ok, today), {}));
test("country required", () => assert.equal(tripErrors({ ...ok, origin_country: "" }, today).origin_country, "Choose a country"));
test("city required", () => assert.equal(tripErrors({ ...ok, origin_city: "  " }, today).origin_city, "Enter the city"));
test("airport is 3 letters", () => {
  assert.equal(tripErrors({ ...ok, origin_airport: "DX" }, today).origin_airport, "Enter the 3-letter airport code");
  assert.equal(tripErrors({ ...ok, origin_airport: "DX1" }, today).origin_airport, "Enter the 3-letter airport code");
});
test("landing date not in the past", () => assert.equal(tripErrors({ ...ok, arrival_date: "2026-10-26" }, today).arrival_date, "Choose your landing date"));
test("shop-by after landing", () =>
  assert.equal(tripErrors({ ...ok, shop_by: "2026-11-13" }, today).shop_by, "Shop-by must be on or before landing"));
test("shop-by in the past", () => assert.equal(tripErrors({ ...ok, shop_by: "2026-10-26" }, today).shop_by, "Shop-by must be on or before landing"));
test("free kg between 1 and 50", () => {
  assert.equal(tripErrors({ ...ok, free_kg: "0" }, today).free_kg, "Enter free kg between 1 and 50");
  assert.equal(tripErrors({ ...ok, free_kg: "51" }, today).free_kg, "Enter free kg between 1 and 50");
  assert.equal(tripErrors({ ...ok, free_kg: "abc" }, today).free_kg, "Enter free kg between 1 and 50");
});
test("customs tick required", () => assert.equal(tripErrors({ ...ok, customs: false }, today).customs, "Tick to continue"));
test("crew tick only for rosters", () => {
  assert.equal(tripErrors({ ...ok, proof_kind: "roster" }, today).crew, "Tick to continue");
  assert.equal(tripErrors({ ...ok, proof_kind: "roster", crew: true }, today).crew, undefined);
});

test("proof over 10 MB refused", () => assert.equal(proofError({ type: "application/pdf", size: 10485761 }), "Please choose a PDF, JPG, PNG or WebP under 10 MB"));
test("proof of another type refused", () => assert.equal(proofError({ type: "image/gif", size: 1 }), "Please choose a PDF, JPG, PNG or WebP under 10 MB"));
test("webp proof accepted", () => assert.equal(proofError({ type: "image/webp", size: 1 }), undefined));

test("post gate", () => {
  assert.equal(postGate("verified"), "form");
  assert.equal(postGate("pending"), "pending");
  assert.equal(postGate("expired"), "expired");
  assert.equal(postGate("none"), "verify");
  assert.equal(postGate("rejected"), "verify");
});

test("a new trip always needs a ticket", () => assert.equal(needsNewProof(undefined, ok), true));
test("resubmitting with the same landing date keeps the ticket", () => assert.equal(needsNewProof({ arrival_date: ok.arrival_date, proof_kind: "ticket" }, ok), false));
test("a new landing date needs a new ticket", () => assert.equal(needsNewProof({ arrival_date: "2026-11-01", proof_kind: "ticket" }, ok), true));
test("switching to a roster needs a new file", () => assert.equal(needsNewProof({ arrival_date: ok.arrival_date, proof_kind: "roster" }, ok), true));
test("submit goes back to the first step with an error", () => {
  assert.equal(firstBadStep({ free_kg: "x", proof: "y" }), 0);
  assert.equal(firstBadStep({ free_kg: "x" }), 2);
  assert.equal(firstBadStep({}), undefined);
});

test("landing after the passport expires is refused before upload", () =>
  assert.equal(tripErrors(ok, today, "2026-11-11").arrival_date, "Your passport must be valid until you land"));
test("passport valid on the landing day is fine", () => assert.equal(tripErrors(ok, today, "2026-11-12").arrival_date, undefined));

const live = { ...ok, status: "live" as const };
test("a new trip is always checked", () => assert.equal(isRecheck(undefined, ok, false), true));
test("kg or note only on a live trip stays live", () => assert.equal(isRecheck(live, { ...ok, free_kg: "9", note: "hi" }, false), false));
test("a new date is checked again", () => assert.equal(isRecheck(live, { ...ok, shop_by: "2026-11-09" }, false), true));
test("a new file is checked again", () => assert.equal(isRecheck(live, ok, true), true));
test("a trip that needs a fix is always checked again", () => assert.equal(isRecheck({ ...ok, status: "needs_fix" }, ok, false), true));
