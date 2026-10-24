import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { internalEmail, isInternalEmail, isSameOrigin, maskEmail, verifyTelegramLogin } from "./telegram-auth.ts";

// Signs fields the way Telegram's Login Widget does, so tests can produce valid and invalid payloads.
function sign(fields: Record<string, string | number>, token: string) {
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const key = createHash("sha256").update(token).digest();
  return { ...fields, hash: createHmac("sha256", key).update(check).digest("hex") };
}

const now = 1_800_000_000;
const good = sign({ id: 42, first_name: "Hana", auth_date: now - 60 }, "123:TEST");

test("valid payload", () => assert.equal(verifyTelegramLogin(good, "123:TEST", now)?.id, 42));
test("tampered field", () => assert.equal(verifyTelegramLogin({ ...good, first_name: "Eve" }, "123:TEST", now), null));
test("wrong token", () => assert.equal(verifyTelegramLogin(good, "999:OTHER", now), null));
test("older than 24h", () =>
  assert.equal(verifyTelegramLogin(sign({ id: 42, first_name: "Hana", auth_date: now - 86_401 }, "123:TEST"), "123:TEST", now), null));
test("missing hash", () => assert.equal(verifyTelegramLogin({ id: 42, first_name: "Hana", auth_date: now }, "123:TEST", now), null));
test("internal email is unguessable", () => {
  const a = internalEmail();
  assert.match(a, /^tg-[0-9a-f-]{36}@users\.zakbis\.com$/);
  assert.notEqual(a, internalEmail());
  assert.equal(isInternalEmail("X@Users.Zakbis.com"), true);
  assert.equal(isInternalEmail("a@gmail.com"), false);
});
test("mask", () => assert.equal(maskEmail("meron@gmail.com"), "m•••@gmail.com"));

test("same-origin check", () => {
  const req = (origin: string | null) =>
    new Request("https://app.zakbis.com/api/auth/telegram", { method: "POST", headers: { host: "app.zakbis.com", ...(origin ? { origin } : {}) } });
  assert.equal(isSameOrigin(req("https://app.zakbis.com")), true);
  assert.equal(isSameOrigin(req("https://evil.example")), false);
  assert.equal(isSameOrigin(req("https://app.zakbis.com.evil.example")), false);
  assert.equal(isSameOrigin(req(null)), false);
});
