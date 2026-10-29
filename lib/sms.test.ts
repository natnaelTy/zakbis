import { test } from "node:test";
import assert from "node:assert/strict";
import { hashCode, isTestNumber, sendLimit, smsMode } from "./sms.ts";

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

test("test mode never runs in a production build", () => {
  assert.equal(smsMode({ ZAKBIS_SMS_TEST_CODE: "123456", NODE_ENV: "production" }), "off");
});

test("send limits: per user, per number across accounts, and a daily total", () => {
  const now = 1_000_000_000_000;
  const ok = { userTimes: [], phoneLastHour: 0, sentToday: 0, now };
  assert.equal(sendLimit(ok), null);
  assert.equal(sendLimit({ ...ok, userTimes: [now - 30_000] }), "too_soon");
  assert.equal(sendLimit({ ...ok, userTimes: [now - 120_000, now - 300_000, now - 600_000] }), "too_many");
  assert.equal(sendLimit({ ...ok, phoneLastHour: 3 }), "too_many");
  assert.equal(sendLimit({ ...ok, sentToday: 300 }), "too_many");
});
