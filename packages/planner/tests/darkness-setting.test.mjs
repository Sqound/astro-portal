import assert from "node:assert/strict";
import test from "node:test";

import { message } from "portal/i18n.js";
import { addPlannerPlan } from "portal/planner/state.js";
import {
  applyDarknessToPlans,
  darknessChoices,
  darknessEffects,
  darknessLabelKey,
  darknessStorageKey,
  defaultDarkness,
  newPlanDarkness,
  planDarkness,
  planNightHasStarted,
  planTakesDarkness,
  readDarknessPreference,
  writeDarknessPreference,
} from "planner/darkness-setting.js";
import { planNightGeometry, planNightWindow } from "planner/planner.js";
import { durationText } from "portal/written-forms.js";

// The threshold is a preference of the browser; choosing one is
// written to the plans that can still take it.

const azores = {
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const plan = (id, extra = {}) => ({
  id,
  date: "2026-10-14",
  location: azores,
  status: "pending",
  items: [],
  ...extra,
});
const sunset = Date.parse(planNightWindow(plan("probe")).sunset);
const beforeSunset = sunset - 3 * 3600000;
const afterSunset = sunset + 60000;

const memoryStorage = (initial = {}) => {
  const values = { ...initial };
  return {
    getItem: (key) => (key in values ? values[key] : null),
    setItem: (key, value) => {
      values[key] = String(value);
    },
    values,
  };
};
const refusingStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

test("the preference defaults to astronomical and survives a refusing storage", () => {
  assert.equal(defaultDarkness, "astronomical");
  assert.equal(readDarknessPreference(memoryStorage()), "astronomical");
  assert.equal(readDarknessPreference(null), "astronomical");
  assert.equal(readDarknessPreference(refusingStorage), "astronomical");
  assert.equal(
    readDarknessPreference(memoryStorage({ [darknessStorageKey]: "dusk" })),
    "astronomical",
  );
  const storage = memoryStorage();
  assert.equal(writeDarknessPreference(storage, "nautical"), true);
  assert.equal(storage.values["planner.darkness"], "nautical");
  assert.equal(readDarknessPreference(storage), "nautical");
  assert.equal(writeDarknessPreference(refusingStorage, "civil"), false);
});

test("a change is written to the pending plans, each with its own threshold", () => {
  const plans = [plan("a"), plan("b", { darkness: "civil" })];
  const { plans: next, changedIds } = applyDarknessToPlans(plans, "nautical", {
    now: beforeSunset,
  });
  assert.deepEqual(changedIds, ["a", "b"]);
  assert.deepEqual(
    next.map((entry) => entry.darkness),
    ["nautical", "nautical"],
  );
  // The rest of the plan is untouched and the input is not mutated.
  assert.equal(next[0].location, plans[0].location);
  assert.equal(plans[0].darkness, undefined);
});

test("an executed, partial, abandoned or archived plan never changes", () => {
  for (const status of ["executed", "partial", "abandoned", "archived"]) {
    const plans = [plan("done", { status })];
    const applied = applyDarknessToPlans(plans, "civil", { now: beforeSunset });
    assert.deepEqual(applied.changedIds, [], status);
    assert.equal(applied.plans, plans, `${status} keeps the same array`);
  }
  const archived = plan("old", { archivedAt: "2026-10-01T00:00:00.000Z" });
  assert.equal(planTakesDarkness(archived, { now: beforeSunset }), false);
});

test("a plan with an observation session never changes", () => {
  const plans = [plan("running"), plan("free")];
  const applied = applyDarknessToPlans(plans, "civil", {
    now: beforeSunset,
    sessionPlanIds: ["running"],
  });
  assert.deepEqual(applied.changedIds, ["free"]);
  assert.equal(applied.plans[0].darkness, undefined);
});

test("a plan whose night has started never changes, one that has not does", () => {
  const plans = [plan("tonight")];
  assert.equal(planNightHasStarted(plans[0], afterSunset), true);
  assert.equal(planNightHasStarted(plans[0], beforeSunset), false);
  assert.deepEqual(
    applyDarknessToPlans(plans, "civil", { now: afterSunset }).changedIds,
    [],
  );
  assert.deepEqual(
    applyDarknessToPlans(plans, "civil", { now: beforeSunset }).changedIds,
    ["tonight"],
  );
  // Without a place the night cannot be computed: it begins with its date.
  const placeless = { id: "p", date: "2026-10-14", status: "pending" };
  assert.equal(
    planNightHasStarted(placeless, Date.parse("2026-10-14T05:00Z")),
    false,
  );
  assert.equal(
    planNightHasStarted(placeless, Date.parse("2026-10-15T05:00Z")),
    true,
  );
});

test("a plan that already has the threshold is not rewritten", () => {
  const plans = [plan("a"), plan("b", { darkness: "nautical" })];
  const astro = applyDarknessToPlans(plans, "astronomical", {
    now: beforeSunset,
  });
  assert.deepEqual(astro.changedIds, ["b"], "absent reads as astronomical");
  assert.equal(astro.plans[1].darkness, "astronomical");
  const same = applyDarknessToPlans([plans[0]], "astronomical", {
    now: beforeSunset,
  });
  assert.equal(same.plans.length, 1);
  assert.deepEqual(same.changedIds, []);
});

test("a new plan inherits the preference", () => {
  assert.deepEqual(newPlanDarkness("astronomical"), {});
  assert.deepEqual(newPlanDarkness("unknown"), {});
  assert.deepEqual(newPlanDarkness("nautical"), { darkness: "nautical" });
  const state = {
    date: "2026-10-14",
    activeNightId: "night-1",
    location: azores,
    plans: [],
    nights: [],
    equipment: {},
  };
  const made = addPlannerPlan(state, {
    id: "new",
    name: "Plan 1",
    ...newPlanDarkness("civil"),
  });
  assert.equal(made.plans[0].darkness, "civil");
  const plain = addPlannerPlan(state, { id: "new", name: "Plan 1" });
  assert.equal("darkness" in plain.plans[0], false);
});

test("the night's windows follow the threshold, and its label follows too", () => {
  const geometry = (darkness) =>
    planNightGeometry({
      date: "2026-10-14",
      location: azores,
      targets: [],
      planetReferences: { planets: [] },
      darkness,
    });
  const [astronomical, nautical, civil] = [
    "astronomical",
    "nautical",
    "civil",
  ].map(geometry);
  const at = (value) => Date.parse(value);
  assert.ok(at(civil.start) < at(nautical.start));
  assert.ok(at(nautical.start) < at(astronomical.start));
  assert.ok(at(astronomical.end) < at(nautical.end));
  assert.ok(at(nautical.end) < at(civil.end));
  assert.equal(geometry().start, astronomical.start);
  assert.equal(geometry("dusk").start, astronomical.start);
  // The same night as planNightWindow gives the plan.
  assert.equal(
    planNightWindow(plan("a", { darkness: "nautical" })).start,
    nautical.start,
  );
  assert.equal(planDarkness(plan("a", { darkness: "civil" })), "civil");
  const labels = darknessChoices.map((choice) =>
    darknessLabelKey(choice.darkness),
  );
  assert.deepEqual(
    labels.map((key) => message("fr", key)),
    ["Nuit astronomique", "Crépuscule nautique", "Crépuscule civil"],
  );
  for (const locale of ["en", "fr", "ja"])
    for (const choice of darknessChoices)
      for (const key of [choice.label, choice.hint, choice.short])
        assert.notEqual(message(locale, key), key, `${locale} ${key}`);
});

test("the intervals keep their clock time when the night's start moves", () => {
  const astronomical = plan("a", {
    items: [
      { id: "m31", startMinute: 60, endMinute: 180, durationMinutes: 120 },
      { id: "m42" },
    ],
  });
  const before = planNightWindow(astronomical);
  const { plans } = applyDarknessToPlans([astronomical], "civil", {
    now: beforeSunset,
  });
  const after = planNightWindow(plans[0]);
  const item = plans[0].items[0];
  const clock = (window, minute) => Date.parse(window.start) + minute * 60000;
  // The shift is a whole number of minutes: the clock time holds to 30 s.
  assert.ok(
    Math.abs(clock(after, item.startMinute) - clock(before, 60)) <= 30000,
  );
  assert.ok(
    Math.abs(clock(after, item.endMinute) - clock(before, 180)) <= 30000,
  );
  assert.equal(item.durationMinutes, 120);
  assert.deepEqual(plans[0].items[1], { id: "m42" });
  // A stricter threshold keeps the intervals inside the shorter night.
  const back = applyDarknessToPlans(plans, "astronomical", {
    now: beforeSunset,
  }).plans[0];
  assert.equal(back.items[0].startMinute, 60);
  assert.equal(back.items[0].endMinute, 180);
});

test("the effect lines give the three windows of the night, in order", () => {
  const rows = darknessEffects(plan("a"));
  assert.deepEqual(
    rows.map((row) => row.darkness),
    ["astronomical", "nautical", "civil"],
  );
  assert.ok(rows[0].minutes < rows[1].minutes);
  assert.ok(rows[1].minutes < rows[2].minutes);
  assert.equal(
    darknessEffects({ date: "2026-10-14", location: { latitude: "" } }),
    null,
  );
  assert.equal(durationText(523, "fr"), "8 h 43");
  assert.equal(durationText(65, "fr"), "1 h 05");
});
