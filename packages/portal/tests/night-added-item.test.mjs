import assert from "node:assert/strict";
import test from "node:test";

import { debriefSummary } from "../dist/debrief-summary.js";
import { buildSessionTargets } from "../dist/journal/session-targets.js";

// The debriefing list of the web. A plan item added during
// the night (no `launchedSchedule` entry, never started) is still one of
// the plan's targets, « not done »; a passage the pauses took whole is not
// an observed target.

const at = (hm) => `2026-10-10T${hm}:00.000Z`;
const night = {
  nightStartAt: at("20:00"),
  window: { start: at("20:00"), end: at("23:00") },
};
const items = [
  { id: "m31", targetId: "m31", startMinute: 0, endMinute: 90 },
  { id: "m33", targetId: "m33", startMinute: 90, endMinute: 150 },
  // Added « à la suite » during the night.
  { id: "m57", targetId: "m57", startMinute: 150, endMinute: 180 },
];
const launchedSchedule = items.slice(0, 2).map((item) => ({
  planItemId: item.id,
  targetId: item.targetId,
  startMinute: item.startMinute,
  endMinute: item.endMinute,
}));
let counter = 0;
const event = (type, hm, payload = {}) => ({
  eventId: `01J8Z3K9QZ6N3S6R3E6G8H${String((counter += 1)).padStart(4, "0")}`,
  type,
  recordedAt: at(hm),
  payload,
});
const started = (id, hm) =>
  event("target_started", hm, { targetId: id, planItemId: id });
const finished = (id, hm) =>
  event("target_finished", hm, { targetId: id, planItemId: id });

test("an item added to the plan during the night is listed, not done", () => {
  const events = [started("m31", "20:00"), finished("m31", "21:30")];
  const summary = debriefSummary({
    ...night,
    planItems: items,
    events,
    launchedSchedule,
  });
  assert.deepEqual(
    summary.perTarget.map((entry) => [entry.planItemId, entry.outcome]),
    [
      ["m31", "done"],
      ["m33", "abandoned"],
      ["m57", "abandoned"],
    ],
  );
  const targets = buildSessionTargets({
    session: {
      id: "s1",
      plan_id: "p1",
      started_at: at("20:00"),
      finished_at: at("23:00"),
    },
    plan: {
      id: "p1",
      night_start_at: at("20:00"),
      payload_json: JSON.stringify({ items, launchedSchedule }),
    },
    events,
  }).targets;
  const m57 = targets.find((target) => target.planItemId === "m57");
  assert.ok(m57, "M57 is a target of the session");
  assert.equal(m57.state, "planned");
  assert.notEqual(m57.outcome, "done");
  assert.equal(targets.length, 3);
});

test("a passage taken whole by a pause is not an observed target", () => {
  const events = [
    started("m31", "20:00"),
    finished("m31", "21:30"),
    started("m33", "21:30"),
    event("pause", "21:30"),
    event("resume", "21:32"),
    finished("m33", "21:32"),
  ];
  const summary = debriefSummary({
    ...night,
    planItems: items,
    events,
    launchedSchedule,
  });
  const m33 = summary.perTarget.find((entry) => entry.planItemId === "m33");
  assert.equal(m33.acquiredMinutes, 0);
  assert.equal(m33.outcome, "abandoned");
});
