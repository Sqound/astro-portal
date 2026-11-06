import assert from "node:assert/strict";
import test from "node:test";

import { planNightIsAhead } from "planner/plan-time-left.js";
import { planNightWindow } from "planner/planner.js";

// A plan whose night has not begun is not marked "exécuté" or "abandonné".
// Three cases — a night that is over, a night in progress, a night to come.
const place = { latitude: "45", longitude: "-30" };
const window = planNightWindow({ date: "2026-10-09" }, place);
const dusk = Date.parse(window.darkStart);
const dawn = Date.parse(window.darkEnd);
const hour = 3600000;
const ahead = (date, now, location = place) =>
  planNightIsAhead({ date, location, now });

test("a night to come — in some days, tomorrow, tonight before the dusk — is ahead", () => {
  const beforeDusk = dusk - 2 * hour;
  assert.equal(ahead("2026-10-09", beforeDusk), true, "tonight, early");
  assert.equal(ahead("2026-10-10", beforeDusk), true, "tomorrow");
  assert.equal(ahead("2026-10-23", beforeDusk), true, "in two weeks");
  // A night on the 23rd, seen on the 15th.
  assert.equal(ahead("2026-10-23", Date.parse("2026-10-15T08:00:00Z")), true);
});

test("a night in progress is not ahead", () => {
  assert.equal(ahead("2026-10-09", dusk + hour), false);
  assert.equal(ahead("2026-10-09", dawn - 30 * 60000), false);
});

test("a night that is over is not ahead", () => {
  assert.equal(ahead("2026-10-09", dawn + 3 * hour), false);
  assert.equal(ahead("2026-09-01", Date.parse("2026-10-15T08:00:00Z")), false);
});

test("nothing says a night is ahead when its date cannot be read", () => {
  const now = Date.parse("2026-10-09T00:00:00Z");
  assert.equal(planNightIsAhead({ date: null, location: place, now }), false);
  assert.equal(
    planNightIsAhead({ date: "tomorrow", location: null, now }),
    false,
  );
});

test("without a place: tomorrow is ahead, today is not", () => {
  const now = Date.parse("2026-10-09T15:00:00Z");
  assert.equal(ahead("2026-10-10", now, null), true);
  assert.equal(ahead("2026-10-09", now, null), false);
});
