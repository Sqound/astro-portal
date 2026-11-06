import assert from "node:assert/strict";
import test from "node:test";
import {
  acquisitionDefaultsStorageKey,
  exposureFromText,
  exposureIsValid,
  itemWithAcquisitionLine,
  lineWithExposure,
  lineWithFilter,
  lineWithGain,
  newPlanAcquisitionDefaults,
  planWithAcquisitionDefaults,
  planWithItemLine,
  readAcquisitionDefaultsPreference,
  writeAcquisitionDefaultsPreference,
} from "planner/acquisition-edit.js";
import {
  addPlannerPlan,
  choosePlannerDate,
  selectPlannerPlan,
} from "portal/planner/state.js";

// "Prise de vue par cible": how a choice is written on the web. The cases: a
// chosen value is kept as it is, the filter of the first line is mirrored into
// `item.filter`, "Revenir aux suggestions" erases the choice. Plus the
// preference of this browser that prefills the next new plan.

const item = (id = "m31", extra = {}) => ({
  id,
  startMinute: 120,
  endMinute: 200,
  durationMinutes: 80,
  filter: "",
  ...extra,
});
const firstLineOf = (entry) => entry.acquisition.lines[0];

test("a choice is stored as the first line", () => {
  const next = itemWithAcquisitionLine(item(), {
    exposureSeconds: 90,
    gain: 100,
  });
  assert.deepEqual(firstLineOf(next), { exposureSeconds: 90, gain: 100 });
});

test("its filter is mirrored into item.filter, none as an empty text", () => {
  const named = itemWithAcquisitionLine(item("m31", { filter: "Old" }), {
    filter: "UV/IR cut",
  });
  assert.equal(named.filter, "UV/IR cut");
  const none = itemWithAcquisitionLine(item("m31", { filter: "Old" }), {
    filter: null,
  });
  assert.deepEqual(firstLineOf(none), { filter: null });
  assert.equal(none.filter, "");
});

test("an empty line, or none, takes the choice away", () => {
  const chosen = itemWithAcquisitionLine(item(), { exposureSeconds: 90 });
  assert.equal("acquisition" in itemWithAcquisitionLine(chosen, null), false);
  assert.equal("acquisition" in itemWithAcquisitionLine(chosen, {}), false);
});

test("the lines after the first are kept", () => {
  const two = item("m31", {
    acquisition: { lines: [{ exposureSeconds: 60 }, { exposureSeconds: 300 }] },
  });
  const edited = itemWithAcquisitionLine(two, { exposureSeconds: 90 });
  assert.equal(edited.acquisition.lines.length, 2);
  assert.equal(edited.acquisition.lines[1].exposureSeconds, 300);
  // Emptying the first keeps the second where it is.
  const emptied = itemWithAcquisitionLine(two, null);
  assert.equal(emptied.acquisition.lines.length, 2);
  assert.equal(emptied.acquisition.lines[1].exposureSeconds, 300);
});

test("only the item asked for changes in a plan", () => {
  const plan = { items: [item("m31"), item("ngc7000")] };
  const next = planWithItemLine(plan, "ngc7000", { exposureSeconds: 300 });
  assert.equal("acquisition" in next.items[0], false);
  assert.deepEqual(firstLineOf(next.items[1]), { exposureSeconds: 300 });
});

test("a line is written to the defaults, an empty one is taken away", () => {
  const written = planWithAcquisitionDefaults(
    { name: "Plan" },
    { exposureSeconds: 60, gain: 200 },
  );
  assert.deepEqual(written.acquisitionDefaults, {
    exposureSeconds: 60,
    gain: 200,
  });
  assert.equal(
    "acquisitionDefaults" in planWithAcquisitionDefaults(written, {}),
    false,
  );
  assert.equal(
    "acquisitionDefaults" in planWithAcquisitionDefaults(written, null),
    false,
  );
});

test("a field changes without touching the others", () => {
  const base = {
    exposureSeconds: 60,
    gain: 200,
    filter: "UV/IR cut",
    binning: 2,
  };
  assert.equal("exposureSeconds" in lineWithExposure(base, null), false);
  assert.equal(lineWithExposure(base, null).gain, 200);
  assert.equal("gain" in lineWithGain(base, { chosen: false }), false);
  assert.equal(lineWithGain(base, { chosen: true }).gain, null);
  assert.equal("filter" in lineWithFilter(base, { chosen: false }), false);
  assert.equal(lineWithFilter(base, { chosen: true }).filter, null);
  assert.equal(lineWithFilter(base, { chosen: true }).binning, 2);
});

test("a typed exposure: a comma is a decimal point, out of bounds is refused", () => {
  assert.equal(exposureFromText(" 1,5 "), 1.5);
  assert.equal(exposureFromText(""), null);
  assert.equal(Number.isNaN(exposureFromText("abc")), true);
  assert.equal(exposureIsValid(120), true);
  assert.equal(exposureIsValid(0), false);
  assert.equal(exposureIsValid(86401), false);
  assert.equal(exposureIsValid(Number.NaN), false);
});

test("the last defaults chosen are kept in this browser and read back", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  };
  assert.equal(readAcquisitionDefaultsPreference(storage), null);
  assert.equal(
    writeAcquisitionDefaultsPreference(storage, {
      exposureSeconds: 60,
      gain: 200,
    }),
    true,
  );
  assert.deepEqual(readAcquisitionDefaultsPreference(storage), {
    exposureSeconds: 60,
    gain: 200,
  });
  // An empty line forgets them.
  writeAcquisitionDefaultsPreference(storage, {});
  assert.equal(store.has(acquisitionDefaultsStorageKey), false);
  assert.equal(readAcquisitionDefaultsPreference(storage), null);
  // A storage that refuses is not an error the person hears about.
  const refusing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readAcquisitionDefaultsPreference(refusing), null);
  assert.equal(
    writeAcquisitionDefaultsPreference(refusing, { exposureSeconds: 60 }),
    false,
  );
  // Whatever the storage holds is read through the contract's reader.
  store.set(acquisitionDefaultsStorageKey, '{"exposureSeconds":-3,"gain":150}');
  assert.deepEqual(readAcquisitionDefaultsPreference(storage), { gain: 150 });
  store.set(acquisitionDefaultsStorageKey, "not json");
  assert.equal(readAcquisitionDefaultsPreference(storage), null);
});

test("the defaults of the last plan prefill the next new plan", () => {
  assert.deepEqual(newPlanAcquisitionDefaults(null), {});
  assert.deepEqual(newPlanAcquisitionDefaults({}), {});
  assert.deepEqual(newPlanAcquisitionDefaults({ exposureSeconds: 60 }), {
    acquisitionDefaults: { exposureSeconds: 60 },
  });
  const base = {
    schemaVersion: 2,
    date: "2026-10-14",
    activeNightId: "night-1",
    nights: [{ id: "night-1", date: "2026-10-14", location: { name: "Lac" } }],
    location: { name: "Lac", latitude: 45, longitude: 5 },
    equipment: { mode: "imaging" },
    plans: [],
  };
  const withDefaults = addPlannerPlan(base, {
    id: "plan-a",
    name: "A",
    ...newPlanAcquisitionDefaults({ exposureSeconds: 60, gain: 200 }),
  });
  assert.deepEqual(withDefaults.plans[0].acquisitionDefaults, {
    exposureSeconds: 60,
    gain: 200,
  });
  // No preference: the plan carries none, as it did before.
  const without = addPlannerPlan(base, { id: "plan-b", name: "B" });
  assert.equal("acquisitionDefaults" in without.plans[0], false);
  // A value out of bounds is not written.
  const refused = addPlannerPlan(base, {
    id: "plan-c",
    name: "C",
    acquisitionDefaults: { exposureSeconds: -1 },
  });
  assert.equal("acquisitionDefaults" in refused.plans[0], false);
  // Choosing a night that has no plan starts one with them.
  const chosen = choosePlannerDate(
    { ...base, nights: [], activeNightId: null },
    "2026-10-20",
    {
      id: "plan-d",
      name: "D",
      ...newPlanAcquisitionDefaults({ exposureSeconds: 90 }),
    },
  );
  const started = chosen.plans.find((plan) => plan.id === "plan-d");
  assert.deepEqual(started.acquisitionDefaults, { exposureSeconds: 90 });
  // The plan keeps them when the planner selects it.
  assert.deepEqual(
    selectPlannerPlan(chosen, "plan-d").plans.find(
      (plan) => plan.id === "plan-d",
    ).acquisitionDefaults,
    { exposureSeconds: 90 },
  );
});
