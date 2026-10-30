import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_REVIEWS, RECEIVER_TAGS, reviewWindowLeft, summaryLine, TRAVELER_TAGS } from "./reviews.ts";

test("new until three visible reviews", () => {
  assert.equal(MIN_REVIEWS, 3);
  assert.equal(summaryLine({ rating: 5, count: 2, tags: [] }, "traveler"), "New traveler");
  assert.equal(summaryLine({ rating: null, count: 0, tags: [] }, "receiver"), "New receiver");
});

test("rating, count and the two most common tags", () => {
  const tags = [{ tag: "easy_to_reach", n: 3 }, { tag: "polite", n: 9 }, { tag: "on_time", n: 7 }];
  assert.equal(summaryLine({ rating: 4.6, count: 12, tags }, "traveler"), "4.6 · 12 reviews · Polite 9 · On time 7");
  assert.equal(summaryLine({ rating: 4, count: 3, tags: [] }, "receiver"), "4.0 · 3 reviews");
});

test("review window countdown", () => {
  const open = "2026-10-01T09:00:00Z";
  assert.equal(reviewWindowLeft(open, new Date("2026-10-04T09:00:00Z")), "11 days left");
  assert.equal(reviewWindowLeft(open, new Date("2026-10-14T21:00:00Z")), "1 day left");
  assert.equal(reviewWindowLeft(open, new Date("2026-10-16T09:00:00Z")), null);
});

test("tag lists match the database", () => {
  assert.deepEqual(TRAVELER_TAGS.map((t) => t.key), ["easy_to_reach", "on_time", "polite", "as_described"]);
  assert.deepEqual(RECEIVER_TAGS.map((t) => t.key), ["easy_to_reach", "on_time", "polite", "clear_request"]);
});
