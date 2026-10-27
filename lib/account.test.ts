import { test } from "node:test";
import assert from "node:assert/strict";
import { needsVerifyForm, payoutErrors, verificationLabel, verificationState } from "./account.ts";

const today = "2026-10-27";
test("no verification", () => assert.equal(verificationState(null, today), "none"));
test("pending", () => assert.equal(verificationState({ status: "pending", passport_expiry: "2027-01-01" }, today), "pending"));
test("approved with a valid passport", () => assert.equal(verificationState({ status: "approved", passport_expiry: "2027-01-01" }, today), "verified"));
test("approved but the passport expired", () => assert.equal(verificationState({ status: "approved", passport_expiry: "2026-10-26" }, today), "expired"));
test("rejected", () => assert.equal(verificationState({ status: "rejected", passport_expiry: "2027-01-01" }, today), "rejected"));
test("labels", () => {
  assert.deepEqual(verificationLabel("expired"), { text: "Passport expired", tone: "bad" });
  assert.deepEqual(verificationLabel("verified"), { text: "Verified", tone: "good" });
  assert.equal(verificationLabel("none"), null);
});
test("bank payout missing everything", () =>
  assert.deepEqual(Object.keys(payoutErrors({ method: "bank", account_name: "", account_number: "12", bank_name: "" })).sort(), ["accountName", "accountNumber", "bankName"]));
test("valid Telebirr payout", () => assert.deepEqual(payoutErrors({ method: "telebirr", account_name: "Hana", account_number: "0911 000 001", bank_name: "" }), {}));
test("switching to traveling opens the form only when there's something to submit", () => {
  assert.deepEqual((["none", "pending", "verified", "rejected", "expired"] as const).filter(needsVerifyForm), ["none", "rejected", "expired"]);
});
