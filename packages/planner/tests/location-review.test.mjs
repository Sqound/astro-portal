import assert from "node:assert/strict";
import test from "node:test";
import {
  clearLocationReview,
  withLocationReviewReason,
} from "../src/location-review.js";

test("a plan newly flagged by applyNightPlace is stamped with the location reason", () => {
  const before = { plans: [{ id: "p1", locationReview: false }] };
  const after = { plans: [{ id: "p1", locationReview: true }] };
  const result = withLocationReviewReason(before, after);
  assert.equal(result.plans[0].locationReviewReason, "location");
});

test("a plan already flagged keeps its existing reason", () => {
  const before = {
    plans: [
      { id: "p1", locationReview: true, locationReviewReason: "equipment" },
    ],
  };
  const after = {
    plans: [
      { id: "p1", locationReview: true, locationReviewReason: "equipment" },
    ],
  };
  const result = withLocationReviewReason(before, after);
  assert.equal(result.plans[0].locationReviewReason, "equipment");
});

test("a plan flagged again after being cleared resets to the location reason", () => {
  // The plan was flagged, then cleared by a schedule edit (locationReview
  // absent) -- a further location change re-flags it: the reason resets
  // fresh, exactly as a first-time flag would.
  const before = { plans: [{ id: "p1" }] };
  const after = { plans: [{ id: "p1", locationReview: true }] };
  const result = withLocationReviewReason(before, after);
  assert.equal(result.plans[0].locationReviewReason, "location");
});

test("a plan applyNightPlace did not flag is untouched, same reference", () => {
  const untouched = { id: "p2", locationReview: false };
  const before = { plans: [untouched] };
  const after = { plans: [untouched] };
  const result = withLocationReviewReason(before, after);
  assert.equal(result.plans[0], untouched);
});

test("nothing to annotate returns the exact same `after` reference", () => {
  const after = { plans: [{ id: "p1", locationReview: false }] };
  assert.equal(withLocationReviewReason({ plans: [] }, after), after);
});

test("missing `plans` arrays degrade to an empty list rather than throwing", () => {
  const after = withLocationReviewReason({}, {});
  assert.deepEqual(after, {});
});

test("clearLocationReview drops both fields from a flagged plan", () => {
  const plan = {
    id: "p1",
    locationReview: true,
    locationReviewReason: "location",
    items: [{ id: "i1" }],
  };
  const cleared = clearLocationReview(plan);
  assert.equal("locationReview" in cleared, false);
  assert.equal("locationReviewReason" in cleared, false);
  assert.deepEqual(cleared.items, plan.items);
});

test("clearLocationReview is a no-op, same reference, on an unflagged plan", () => {
  const plan = { id: "p1", items: [] };
  assert.equal(clearLocationReview(plan), plan);
});

test("clearLocationReview passes through null/undefined", () => {
  assert.equal(clearLocationReview(null), null);
  assert.equal(clearLocationReview(undefined), undefined);
});

test("clearLocationReview also drops a stray reason with no active flag", () => {
  const plan = { id: "p1", locationReviewReason: "location" };
  const cleared = clearLocationReview(plan);
  assert.equal("locationReviewReason" in cleared, false);
});
