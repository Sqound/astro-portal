import assert from "node:assert/strict";
import test from "node:test";

import {
  nightSpanRule,
  normalizeNightSpan,
  normalizePlanDarkness,
  normalizePlanNightProperties,
  planDarknessValues,
} from "portal/planner/state.js";

// The two night properties of a plan, normalised once.

const bounds = {
  sunset: "2026-10-14T18:12:31.000Z",
  sunrise: "2026-10-15T06:05:10.000Z",
};
const custom = (start, end) => ({ mode: "custom", start, end });

test("darkness keeps the three names and drops anything else", () => {
  assert.deepEqual(planDarknessValues, ["astronomical", "nautical", "civil"]);
  for (const value of planDarknessValues)
    assert.equal(normalizePlanDarkness(value), value);
  for (const value of [undefined, null, "", "Civil", "twilight", -6, {}])
    assert.equal(normalizePlanDarkness(value), null);
});

test("the defaults: ten-minute steps, thirty minutes at least", () => {
  assert.deepEqual(nightSpanRule, { stepMinutes: 10, minimumMinutes: 30 });
  assert.deepEqual(
    normalizeNightSpan(
      custom("2026-10-14T20:27:00Z", "2026-10-15T02:16:00Z"),
      bounds,
    ),
    custom("2026-10-14T20:30:00.000Z", "2026-10-15T02:20:00.000Z"),
  );
  assert.deepEqual(
    normalizeNightSpan(
      custom("2026-10-14T23:00:00Z", "2026-10-14T23:20:00Z"),
      bounds,
    ),
    { mode: "astronomical" },
  );
});

test("a custom span never starts before sunset nor ends after sunrise", () => {
  assert.deepEqual(
    normalizeNightSpan(
      custom("2026-10-14T12:00:00Z", "2026-10-15T12:00:00Z"),
      bounds,
    ),
    custom("2026-10-14T18:20:00.000Z", "2026-10-15T06:00:00.000Z"),
  );
  assert.deepEqual(
    normalizeNightSpan(
      custom("2026-10-15T07:00:00Z", "2026-10-15T09:00:00Z"),
      bounds,
    ),
    { mode: "astronomical" },
  );
});

test("unknown values are absent; unreadable custom spans fall back to astronomical", () => {
  for (const value of [undefined, null, "custom", [], { mode: "all" }])
    assert.equal(normalizeNightSpan(value, bounds), null);
  assert.deepEqual(normalizeNightSpan({ mode: "astronomical", x: 1 }), {
    mode: "astronomical",
  });
  for (const value of [
    custom("2026-10-14", "2026-10-15T02:00:00Z"),
    custom("tonight", "2026-10-15T02:00:00Z"),
    { mode: "custom", start: "2026-10-14T20:00:00Z" },
    custom("2026-10-15T02:00:00Z", "2026-10-14T22:00:00Z"),
  ])
    assert.deepEqual(normalizeNightSpan(value, bounds), {
      mode: "astronomical",
    });
});

test("a plan without the properties comes back identical; bad ones are removed", () => {
  const plan = { id: "a", date: "2026-10-14", items: [] };
  assert.deepEqual(normalizePlanNightProperties(plan, bounds), plan);
  assert.deepEqual(
    normalizePlanNightProperties(
      { ...plan, darkness: "dusk", nightSpan: { mode: "?" } },
      bounds,
    ),
    plan,
  );
  assert.deepEqual(
    normalizePlanNightProperties(
      {
        ...plan,
        darkness: "civil",
        nightSpan: custom("2026-10-14T19:01:00Z", "2026-10-15T03:04:00Z"),
      },
      bounds,
    ),
    {
      ...plan,
      darkness: "civil",
      nightSpan: custom("2026-10-14T19:00:00.000Z", "2026-10-15T03:00:00.000Z"),
    },
  );
});
