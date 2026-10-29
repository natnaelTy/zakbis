import { test } from "node:test";
import assert from "node:assert/strict";
import { hashCode, isTestNumber, smsMode } from "./sms.ts";

const live = { AFROMESSAGE_TOKEN: "t", AFROMESSAGE_IDENTIFIER: "i", AFROMESSAGE_SENDER: "Zakbis" };

test("live only with all three AfroMessage settings, and it beats test mode", () => {
  assert.equal(smsMode(live), "live");
  assert.equal(smsMode({ ...live, ZAKBIS_SMS_TEST_CODE: "123456" }), "live");
  assert.equal(smsMode({ AFROMESSAGE_TOKEN: "t" }), "off");
});

test("test mode only with a test code and no live sender", () => {
  assert.equal(smsMode({ ZAKBIS_SMS_TEST_CODE: "123456" }), "test");
  assert.equal(smsMode({ AFROMESSAGE_TOKEN: "t", ZAKBIS_SMS_TEST_CODE: "123456" }), "test");
  assert.equal(smsMode({}), "off");
});

test("test numbers are a fixed fake range", () => {
  assert.equal(isTestNumber("251900000012"), true);
  assert.equal(isTestNumber("251911234567"), false);
});

test("code hash is per user", () => {
  assert.equal(hashCode("123456", "u1"), hashCode("123456", "u1"));
  assert.notEqual(hashCode("123456", "u1"), hashCode("123456", "u2"));
  assert.match(hashCode("123456", "u1"), /^[0-9a-f]{64}$/);
});
