// A second plan the same night is named apart from the first, and the targets
// it is suggested leave out the ones another plan of the night OF THE SAME
// NATURE holds -- photo with photo, visual with visual -- with two photo plans
// and one visual plan.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  targetIdsTakenOnNight,
  planIsVisual,
} from "../src/night-taken-targets.js";
import {
  nextNumberedPlanName,
  uniquePlanNameOnNight,
} from "../src/night-plan-names.js";
import { tonightSuggestions } from "../src/tonight-suggestions.js";
import { createWebQuickPlanAction } from "../src/quick-plan-web.js";
import { base } from "./helpers/suggestion-cases.mjs";

const plan = (
  id,
  targets,
  { visual = false, date = "2026-10-14", status } = {},
) => ({
  id,
  date,
  ...(status ? { status } : {}),
  equipment: { mode: visual ? "visual" : "imaging" },
  items: targets.map((target) => ({ id: target })),
});

const options = {
  ...base,
  place: { id: "test", latitude: 45, longitude: -30 },
  date: "2026-10-14",
  night: {
    darkStart: base.night.start,
    darkEnd: base.night.end,
    moonSeries: [],
  },
};
const ids = (result) => result.candidates.map((c) => c.id);

test("a photo plan leaves out the photo plans' targets and keeps the visual plan's", () => {
  const first = ids(tonightSuggestions({ ...options, mode: "imaging" }));
  const [a, b, c, d] = first;
  const plans = [
    plan("photo-1", [a, b]),
    plan("photo-2", [c]),
    plan("visual-1", [d], { visual: true }),
  ];
  assert.deepEqual(
    targetIdsTakenOnNight(plans, { date: "2026-10-14", visual: false }),
    [a, b, c].sort(),
  );
  const photo = ids(tonightSuggestions({ ...options, mode: "imaging", plans }));
  for (const taken of [a, b, c]) assert.ok(!photo.includes(taken), taken);
  // The visual plan's target is still a photo plan's to take.
  assert.ok(photo.includes(d));
});

test("a visual plan leaves out the visual plans' targets only", () => {
  const first = ids(tonightSuggestions({ ...options, mode: "visual" }));
  const [a, b] = first;
  const plans = [
    plan("photo-1", [a]),
    plan("photo-2", [b]),
    plan("visual-1", [a], { visual: true }),
  ];
  assert.deepEqual(
    targetIdsTakenOnNight(plans, { date: "2026-10-14", visual: true }),
    [a],
  );
  const visual = ids(tonightSuggestions({ ...options, mode: "visual", plans }));
  assert.ok(!visual.includes(a));
  // The photo plans' other target is a visual plan's to take.
  assert.ok(visual.includes(b));
});

test("the plan being suggested for does not exclude itself; another night, an abandoned and an archived plan hold nothing", () => {
  const plans = [
    plan("mine", ["m31"]),
    plan("other-night", ["m1"], { date: "2026-10-15" }),
    plan("abandoned", ["m2"], { status: "abandoned" }),
    plan("archived", ["m3"], { status: "archived" }),
    plan("executed", ["m4"], { status: "executed" }),
  ];
  assert.deepEqual(
    targetIdsTakenOnNight(plans, {
      date: "2026-10-14",
      visual: false,
      exceptPlanId: "mine",
    }),
    ["m4"],
  );
  assert.deepEqual(targetIdsTakenOnNight(plans, { visual: false }), []);
  assert.equal(planIsVisual({}), false);
});

test("a name taken twice the same night is numbered, a free one kept", () => {
  assert.equal(
    uniquePlanNameOnNight("Nuit du 14 octobre", []),
    "Nuit du 14 octobre",
  );
  assert.equal(
    uniquePlanNameOnNight("Nuit du 14 octobre", ["Nuit du 14 octobre"]),
    "Nuit du 14 octobre (2)",
  );
  assert.equal(
    uniquePlanNameOnNight("Nuit du 14 octobre", [
      "Nuit du 14 octobre",
      "Nuit du 14 octobre (2)",
    ]),
    "Nuit du 14 octobre (3)",
  );
});

test("the planner's « Plan N » takes the first number left", () => {
  assert.equal(nextNumberedPlanName("Plan", []), "Plan 1");
  assert.equal(nextNumberedPlanName("Plan", ["Plan 1"]), "Plan 2");
  assert.equal(nextNumberedPlanName("Plan", ["Plan 2"]), "Plan 3");
  assert.equal(nextNumberedPlanName("Plan", ["Plan 1", "Plan 3"]), "Plan 4");
});

test("the web quick plan of a night that already has a plan is named apart", () => {
  const action = (plans, date = "2026-10-14") =>
    createWebQuickPlanAction({
      document: { plans },
      date,
      location: { latitude: 45, longitude: -30, timeZone: "UTC" },
      locale: "fr",
    });
  assert.equal(action([]).name, "Nuit du 14 octobre");
  const first = { id: "a", date: "2026-10-14", name: "Nuit du 14 octobre" };
  assert.equal(action([first]).name, "Nuit du 14 octobre (2)");
  assert.equal(
    action([first, { ...first, id: "b", name: "Nuit du 14 octobre (2)" }]).name,
    "Nuit du 14 octobre (3)",
  );
  // Another night is no collision.
  assert.equal(action([first], "2026-10-15").name, "Nuit du 15 octobre");
});

// The web and the Journal name and suggest a second plan of the night the same
// way.
const parity = JSON.parse(
  readFileSync(new URL("./fixtures/second-plan-parity.json", import.meta.url)),
);

test("the shared cases give the same names", () => {
  for (const { desired, taken, expected } of parity.names)
    assert.equal(uniquePlanNameOnNight(desired, taken), expected, desired);
  for (const { noun, taken, expected } of parity.numbered)
    assert.equal(nextNumberedPlanName(noun, taken), expected, taken.join());
});

test("the shared cases hold the same targets", () => {
  const plans = parity.plans.map(({ id, date, mode, status, items }) => ({
    id,
    date,
    status,
    equipment: { mode },
    items: items.map((target) => ({ id: target })),
  }));
  for (const { expected, ...query } of parity.taken)
    assert.deepEqual(targetIdsTakenOnNight(plans, query), expected);
});
