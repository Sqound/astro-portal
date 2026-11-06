import assert from "node:assert/strict";
import test from "node:test";

import { plannerFlowMessage } from "portal/planner/flow-messages.js";
import { activePlanCardReviewReasons } from "planner/planner.js";
import { scheduleItemWindReason } from "planner/recommendations.js";
import { windAssessment } from "planner/wind.js";

// A scheduled interval in a gusty hour is flagged for review, from the
// plan's own copy of its mount's tolerance.

const at = (iso) => Date.parse(iso);
const nightStart = "2026-10-14T20:50:00.000Z";
const night = { start: nightStart, end: "2026-10-15T05:40:00.000Z" };
const hourly = [
  { time: at("2026-10-14T21:00:00Z"), wind: 8, gust: 14 },
  { time: at("2026-10-14T22:00:00Z"), wind: 10, gust: 18 },
  { time: at("2026-10-14T23:00:00Z"), wind: 12, gust: 28 },
  { time: at("2026-10-15T00:00:00Z"), wind: 15, gust: 33 },
  { time: at("2026-10-15T01:00:00Z"), wind: 9, gust: 16 },
];
const reasonFor = (startMinute, endMinute, tolerance = "standard") =>
  scheduleItemWindReason({
    item: { id: "m31", startMinute, endMinute },
    nightStart,
    assessment: windAssessment({ hourly, tolerance, window: night }),
  });

test("an interval is flagged by the worst hour it overlaps", () => {
  // 21:00 → 22:50: calm.
  assert.equal(reasonFor(10, 120), null);
  // 22:30 → 23:30: the 23:00 hour is near the Standard limit.
  assert.equal(reasonFor(100, 160), "wind-near-tolerance");
  // 23:30 → 00:30: the 00:00 hour is beyond it.
  assert.equal(reasonFor(160, 220), "wind-over-tolerance");
  // The same interval under "Lourd ou abrité" (45 km/h gusts): calm.
  assert.equal(reasonFor(160, 220, "heavy"), null);
});

test("no forecast, or no interval, never flags anything", () => {
  assert.equal(
    scheduleItemWindReason({
      item: { id: "m31", startMinute: 160, endMinute: 220 },
      nightStart,
      assessment: windAssessment({ hourly: [], window: night }),
    }),
    null,
  );
  assert.equal(
    scheduleItemWindReason({
      item: { id: "m31" },
      nightStart,
      assessment: windAssessment({ hourly, window: night }),
    }),
    null,
  );
});

test("the card of the plan carries the wind's reason, and it has a label in three languages", () => {
  const card = activePlanCardReviewReasons({
    card: {
      target: { id: "m31", plannerSource: "favorite" },
      reviewReasons: [],
    },
    equipment: {},
    windReason: reasonFor(160, 220),
  });
  assert.deepEqual(card.reviewReasons, ["wind-over-tolerance"]);
  assert.equal(
    plannerFlowMessage("fr", "review_wind-over-tolerance"),
    "rafales au-delà de la tolérance de votre monture",
  );
  assert.equal(
    plannerFlowMessage("fr", "review_wind-near-tolerance"),
    "rafales proches de la limite de votre monture",
  );
  for (const locale of ["en", "ja"])
    for (const key of [
      "review_wind-over-tolerance",
      "review_wind-near-tolerance",
    ])
      assert.ok(plannerFlowMessage(locale, key).length > 4);
});
