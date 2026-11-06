import assert from "node:assert/strict";
import test from "node:test";

import { plannerFlowMessage } from "portal/planner/flow-messages.js";
import { activePlanCardReviewReasons } from "planner/planner.js";
import { scheduleItemUsableWindowReason } from "planner/recommendations.js";

// An interval that covers hours where the target is not usable is flagged
// "Hors du créneau utile"; the editor still lets it be drawn.
const nightStart = "2026-12-15T09:00:00.000Z";
// The target is usable from minute 200 to minute 450 of the night (4 h 10).
const windows = [
  { start: "2026-12-15T12:20:00.000Z", end: "2026-12-15T16:30:00.000Z" },
];
const reasonOf = (startMinute, endMinute, withWindows = windows) =>
  scheduleItemUsableWindowReason({
    item: { startMinute, endMinute },
    nightStart,
    windows: withWindows,
  });

test("an interval over ten hours for a four-hour window is flagged", () => {
  assert.equal(reasonOf(0, 600), "outside-usable-window");
});

test("an interval inside the window is not", () => {
  assert.equal(reasonOf(200, 450), null);
  assert.equal(reasonOf(260, 380), null);
});

test("an interval that leaves the window by ten minutes or more is", () => {
  assert.equal(reasonOf(190, 450), "outside-usable-window");
  assert.equal(reasonOf(200, 460), "outside-usable-window");
  // Under ten minutes is the planner's own sampling, not a choice.
  assert.equal(reasonOf(195, 450), null);
});

test("an interval wholly outside the window is flagged", () => {
  assert.equal(reasonOf(0, 60), "outside-usable-window");
});

test("no windows to compare with, or no real interval, gives no reason", () => {
  assert.equal(reasonOf(0, 600, []), null);
  assert.equal(reasonOf(0, 600, "none"), null);
  assert.equal(reasonOf(100, 100), null);
  assert.equal(
    scheduleItemUsableWindowReason({ item: null, nightStart, windows }),
    null,
  );
});

test("the reason joins the card's reasons once and has its words", () => {
  const card = activePlanCardReviewReasons({
    card: { target: { id: "m42" }, reviewReasons: ["altitude"] },
    equipment: {},
    usableWindowReason: "outside-usable-window",
  });
  assert.deepEqual(card.reviewReasons, ["altitude", "outside-usable-window"]);
  assert.equal(
    plannerFlowMessage("en", "review_outside-usable-window"),
    "outside its usable window",
  );
  assert.equal(
    plannerFlowMessage("fr", "review_outside-usable-window"),
    "hors du créneau utile",
  );
});
