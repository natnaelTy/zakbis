import { test } from "node:test";
import assert from "node:assert/strict";
import { counterError, hasContactDetails, offerActions, stageLabel, suggestionError, timeLeft, type OfferView } from "./negotiation.ts";

const now = new Date("2026-10-28T09:00:00Z");
const inHour = new Date(now.getTime() + 3600_000).toISOString();
const offer: OfferView = { status: "pending", turn: "receiver", reward_etb: 1200, suggestion_etb: null, suggestions_used: 0, due_at: inHour };

test("contact details are caught", () => {
  for (const t of ["0911 23 45 67", "+251911234567", "@hana_b", "hana@gmail.com", "wa.me/2519", "t.me/x", "www.x.com", "see https://x.co"])
    assert.equal(hasContactDetails(t), true, t);
});
test("ordinary item text passes", () => {
  for (const t of ["iPhone 15 Pro 256GB", "size 42", "2 pcs", "Model A2337", "1200 ml", "Nike Air Max 90, white", "landing 2026-11-03", "03.11.2026", "1 500 000 ETB", "arrive 2026-07-09 14:30"])
    assert.equal(hasContactDetails(t), false, t);
});

test("receiver's turn", () => {
  assert.deepEqual(offerActions(offer, "receiver", now), ["accept", "suggest", "decline"]);
  assert.deepEqual(offerActions({ ...offer, suggestions_used: 3 }, "receiver", now), ["accept", "decline"]);
  assert.deepEqual(offerActions(offer, "traveler", now), ["withdraw"]);
});
test("traveler's turn", () => {
  const t = { ...offer, turn: "traveler" as const, suggestion_etb: 900 };
  assert.deepEqual(offerActions(t, "traveler", now), ["accept_suggestion", "counter", "withdraw"]);
  assert.deepEqual(offerActions(t, "receiver", now), ["decline"]);
});
test("no actions after the deadline or once settled", () => {
  assert.deepEqual(offerActions({ ...offer, due_at: new Date(now.getTime() - 1000).toISOString() }, "receiver", now), []);
  assert.deepEqual(offerActions({ ...offer, status: "accepted" }, "receiver", now), []);
});

test("suggestion rules", () => {
  assert.equal(suggestionError("1200", 1200, 0), "Suggest less than 1,200 ETB");
  assert.equal(suggestionError("0", 1200, 0), "Enter a reward in ETB");
  assert.equal(suggestionError("900", 1200, 3), "No suggestions left");
  assert.equal(suggestionError("900", 1200, 2), undefined);
});
test("counter rules", () => {
  assert.equal(counterError("900", 900), "Name more than 900 ETB, or accept 900 ETB");
  assert.equal(counterError("950", 900), undefined);
});

test("time left", () => {
  assert.equal(timeLeft(new Date(now.getTime() + (23 * 60 + 10) * 60_000).toISOString(), now), "23 h");
  assert.equal(timeLeft(new Date(now.getTime() + 45 * 60_000).toISOString(), now), "45 min");
  assert.equal(timeLeft(new Date(now.getTime() - 1).toISOString(), now), "Time's up");
});

test("stage labels", () => {
  const base = { counterpart: "Hana", offers: 0, dueAt: null, now };
  assert.equal(stageLabel("answer", base), "Your turn");
  assert.equal(stageLabel("waiting", base), "Waiting for Hana");
  assert.equal(stageLabel("offers", { ...base, offers: 3 }), "3 offers");
  assert.equal(stageLabel("offers", { ...base, offers: 1 }), "1 offer");
  assert.equal(stageLabel("no_offers", base), "No offers yet");
  assert.equal(stageLabel("pay", { ...base, dueAt: new Date(now.getTime() + 5 * 3600_000).toISOString() }), "Pay within 5 h");
  assert.equal(stageLabel("checking_payment", base), "Checking payment");
  assert.equal(stageLabel("paid", base), "Paid");
  assert.equal(stageLabel("closed", base), "Closed");
});
