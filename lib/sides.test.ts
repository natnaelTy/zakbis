import { test } from "node:test";
import assert from "node:assert/strict";
import { afterSignIn, homeFor, tabsFor } from "./sides.ts";

test("receiver tabs", () => assert.deepEqual(tabsFor("receiver").map((t) => t.label), ["Explore", "Orders", "Post", "Inbox", "Profile"]));
test("traveler tabs", () => assert.deepEqual(tabsFor("traveler").map((t) => t.href), ["/requests", "/orders", "/trips/new", "/inbox", "/profile"]));
test("each side's home is its first tab", () => {
  assert.equal(homeFor("traveler"), "/requests");
  assert.equal(homeFor("receiver"), "/");
});

test("after sign-in: matching side runs the pending action", () => assert.equal(afterSignIn("receiver", "receiver", true), "run"));
test("after sign-in: new traveler from a receiver action goes to verification", () =>
  assert.deepEqual(afterSignIn("receiver", "traveler", true), { push: "/traveler/verify" }));
test("after sign-in: existing receiver on a traveler page goes home", () => assert.deepEqual(afterSignIn("traveler", "receiver", false), { push: "/" }));
test("after sign-in: no requirement, new traveler goes to verification", () =>
  assert.deepEqual(afterSignIn(undefined, "traveler", true), { push: "/traveler/verify" }));
test("after sign-in: no requirement, returning traveler runs the action", () => assert.equal(afterSignIn(undefined, "traveler", false), "run"));
