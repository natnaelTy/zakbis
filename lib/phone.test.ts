import { test } from "node:test";
import assert from "node:assert/strict";
import { displayPhone, normalizeEtPhone } from "./phone.ts";

test("Ethiopian mobiles in any common form", () => {
  for (const raw of ["0911 23 45 67", "+251911234567", "911234567", "251-911-234-567"]) assert.equal(normalizeEtPhone(raw), "251911234567", raw);
  assert.equal(normalizeEtPhone("0711234567"), "251711234567");
});

test("landlines, foreign and short numbers are refused", () => {
  for (const raw of ["0111234567", "+447700900123", "09112345", "", "abc"]) assert.equal(normalizeEtPhone(raw), null, raw);
});

test("display form", () => {
  assert.equal(displayPhone("251911234567"), "+251 911 234 567");
});
