import { test } from "node:test";
import assert from "node:assert/strict";
import { etb, normalizeUrl, parseAmount, parseEtb, quote } from "./money.ts";

test("spec example: Hana's perfume", () => {
  assert.deepEqual(quote({ unitPrice: 120, quantity: 1, rate: 38.5, reward: 800 }), {
    itemEtb: 4620,
    reward: 800,
    total: 5420,
    fee: 72,
    payout: 5348,
  });
});

test("rounds once on the line total", () => {
  // 19.99 × 3 × 141.4 = 8479.758; rounding per unit first would give 8481
  assert.equal(quote({ unitPrice: 19.99, quantity: 3, rate: 141.4, reward: 500 }).itemEtb, 8480);
});

test("fee rounds half up", () => {
  assert.equal(quote({ unitPrice: 1, quantity: 1, rate: 1, reward: 50 }).fee, 5); // 4.5
});

test("parseAmount accepts separators and rejects non-positive input", () => {
  assert.equal(parseAmount("1,200"), 1200);
  assert.equal(parseAmount(" 19.99 "), 19.99);
  for (const bad of ["", "abc", "0", "-5", "1e999"]) assert.equal(parseAmount(bad), null, bad);
});

test("parseAmount rejects a decimal comma instead of reading it as thousands", () => {
  assert.equal(parseAmount("19,99"), null);
  assert.equal(parseAmount("1,234.50"), 1234.5);
  assert.equal(parseAmount("0x10"), null);
});

test("parseEtb is whole birr and at least 1", () => {
  assert.equal(parseEtb("800"), 800);
  assert.equal(parseEtb("1,200.6"), 1201);
  assert.equal(parseEtb("0.4"), null);
});

test("normalizeUrl adds https and rejects non-web links", () => {
  assert.equal(normalizeUrl("www.zara.com/ae/x"), "https://www.zara.com/ae/x");
  assert.equal(normalizeUrl("http://a.com"), "http://a.com/");
  for (const bad of ["", "hello", "javascript:alert(1)", "ftp://a.com"]) assert.equal(normalizeUrl(bad), null, bad);
});

test("etb formats whole birr", () => {
  assert.equal(etb(5420), "5,420 ETB");
});
