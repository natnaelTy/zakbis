import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentDetails } from "./payment-details.ts";

test("nothing configured", () => assert.deepEqual(paymentDetails({}), {}));
test("only Telebirr", () =>
  assert.deepEqual(paymentDetails({ NEXT_PUBLIC_ZAKBIS_TELEBIRR_NUMBER: "0911", NEXT_PUBLIC_ZAKBIS_TELEBIRR_NAME: "Zakbis" }), {
    telebirr: { label: "Telebirr", account: "0911", name: "Zakbis" },
  }));
test("a CBE account without a name is left out", () =>
  assert.deepEqual(paymentDetails({ NEXT_PUBLIC_ZAKBIS_CBE_ACCOUNT: "1000" }), {}));
