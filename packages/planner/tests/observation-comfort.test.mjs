import assert from "node:assert/strict";
import test from "node:test";
import { autoFillNight } from "../src/auto-fill.js";
import { QuickPlanAction } from "../src/quick-plan.js";
import {
  readObservationComfort,
  writeObservationComfort,
  observationComfortFamily,
  observationComfortRange,
  observationComfortRanges,
} from "../src/observation-comfort.js";

test("the comfortable range of each instrument, from one table", () => {
  assert.deepEqual(observationComfortRanges, {
    refractor: { minAltitude: null, maxAltitude: 65 },
    "rear-eyepiece": { minAltitude: null, maxAltitude: 65 },
    "newtonian-altaz": { minAltitude: 30, maxAltitude: null },
    "newtonian-equatorial": { minAltitude: 25, maxAltitude: 75 },
    binoculars: { minAltitude: null, maxAltitude: 55 },
  });
  const family = (telescope, mount) =>
    observationComfortFamily({ mode: "visual", telescope, mount });
  assert.equal(family({ kind: "refractor" }), "refractor");
  for (const kind of [
    "schmidt-cassegrain",
    "maksutov",
    "cassegrain",
    "ritchey-chretien",
  ])
    assert.equal(family({ kind }), "rear-eyepiece", kind);
  // A Newtonian: Dobson or alt-az (and an unknown mount) against equatorial.
  assert.equal(family({ kind: "newtonian" }), "newtonian-altaz");
  assert.equal(
    family({ kind: "newtonian", name: "Dobson 250/1200" }),
    "newtonian-altaz",
  );
  assert.equal(
    family({ kind: "newtonian" }, { id: "eq6", name: "Sky-Watcher EQ6-R" }),
    "newtonian-equatorial",
  );
  assert.equal(
    family({ kind: "newtonian" }, { id: "integrated-eq" }),
    "newtonian-equatorial",
  );
  assert.equal(
    family({ kind: "newtonian" }, { id: "x", name: "AZ-GTi" }),
    "newtonian-altaz",
  );
  // The kind of a common mount (EQUIPMENT-CATALOGUE-01) tells it without the
  // name: a ZWO AM5N or a Rainbow RST-135 carries no « EQ » in its name.
  assert.equal(
    family(
      { kind: "newtonian" },
      { id: "zwo-am5n", name: "ZWO AM5N", kind: "equatorial" },
    ),
    "newtonian-equatorial",
  );
  assert.equal(
    family({ kind: "newtonian" }, { id: "x", name: "Rainbow", kind: "altaz" }),
    "newtonian-altaz",
  );
  assert.equal(family({ isBinoculars: true, kind: "refractor" }), "binoculars");
  // Without a kind, the name tells it.
  assert.equal(family({ name: "Lunette 70/420 (exemple)" }), "refractor");
  assert.equal(
    family({ name: "Dobson 250/1200 (exemple)" }),
    "newtonian-altaz",
  );
  assert.equal(family({ name: "Celestron C8" }), "rear-eyepiece");
  assert.equal(family({ name: "Mon instrument" }), null);
  // Naked eye: no constraint, the switch is not offered.
  assert.equal(family(null), "naked-eye");
  assert.equal(observationComfortRange("naked-eye"), null);
});

test("the switch is not offered in photo nor with a smart telescope", () => {
  assert.equal(
    observationComfortFamily({
      mode: "imaging",
      telescope: { kind: "refractor" },
    }),
    null,
  );
  assert.equal(
    observationComfortFamily({ mode: "visual", telescope: { kind: "smart" } }),
    null,
  );
  assert.equal(
    observationComfortFamily({
      mode: "visual",
      telescope: { kind: "refractor", integratedCamera: { id: "imx" } },
    }),
    null,
  );
});

// Two targets over a 12-hour night: « high » (better score) is at 80° at the
// start and comes down late; « low » stays between 50° and 62°.
const start = Date.UTC(2026, 9, 14, 19);
const iso = (ms) => new Date(ms).toISOString();
const hour = 3600000;
const card = (id, altitudes) => ({
  target: { id, designation: id.toUpperCase(), title: "" },
  integration: { available: true, recommendedMinutes: 90 },
  visibilityWindows: [{ start: iso(start), end: iso(start + 12 * hour) }],
  series: altitudes.map((altitude, index) => ({
    time: iso(start + index * 3 * hour),
    altitude,
  })),
});
const request = (extra) => ({
  night: { start: iso(start), end: iso(start + 12 * hour) },
  mode: "visual",
  count: 2,
  candidates: [
    {
      card: card("high", [80, 85, 80, 70, 60]),
      score: { total: 90, max: 100 },
    },
    {
      card: card("never", [80, 85, 85, 80, 70]),
      score: { total: 95, max: 100 },
    },
    { card: card("low", [50, 55, 60, 62, 60]), score: { total: 60, max: 100 } },
  ],
  ...extra,
});
const ids = (proposal) => proposal.items.map((item) => item.target.id);

test("a preference, never a filter: the comfortable targets come first", () => {
  const off = autoFillNight(request({ count: 1 }));
  assert.deepEqual(ids(off), ["never"]);
  const on = autoFillNight(
    request({ count: 1, comfort: { minAltitude: null, maxAltitude: 65 } }),
  );
  assert.deepEqual(ids(on), ["high"]);
  // « never » (above 65° all night) stays proposed, lower, and choosable.
  const all = autoFillNight(
    request({ count: 3, comfort: { minAltitude: null, maxAltitude: 65 } }),
  );
  assert.equal(all.items.length, 3);
  assert.equal(
    all.items.find((item) => item.target.id === "never").comfortable,
    false,
  );
  const only = autoFillNight(
    request({
      count: 1,
      only: ["never"],
      comfort: { minAltitude: null, maxAltitude: 65 },
    }),
  );
  assert.deepEqual(ids(only), ["never"]);
});

test("the slot is at the comfortable moment, the other one as a fallback", () => {
  const off = autoFillNight(request({ count: 1, only: ["high"] }));
  const on = autoFillNight(
    request({
      count: 1,
      only: ["high"],
      comfort: { minAltitude: null, maxAltitude: 65 },
    }),
  );
  // Without the switch, at its culmination (85°); with it, under 65°.
  assert.ok(off.items[0].maxAltitude > 80);
  assert.ok(on.items[0].maxAltitude <= 65);
  assert.equal(on.items[0].comfortable, true);
  // A Dobson (from 30°) keeps the culmination: it is comfortable.
  const dobson = autoFillNight(
    request({
      count: 1,
      only: ["high"],
      comfort: { minAltitude: 30, maxAltitude: null },
    }),
  );
  assert.deepEqual(dobson.items[0].startMinute, off.items[0].startMinute);
});

test("the switch changes nothing in photo", () => {
  const photo = { mode: "imaging", count: 2 };
  assert.deepEqual(
    autoFillNight(
      request({ ...photo, comfort: { minAltitude: null, maxAltitude: 65 } }),
    ),
    autoFillNight(request(photo)),
  );
});

test("the quick launch makes its plan with the comfort the dialog showed", async () => {
  const comfort = { minAltitude: null, maxAltitude: 65 };
  const shown = autoFillNight(
    request({ count: 1, only: ["high"], placement: "ideal", comfort }),
  );
  const action = new QuickPlanAction({
    document: { plans: [], nights: [] },
    date: "2026-10-14",
    location: { name: "Plateau", latitude: "45", longitude: "7" },
    name: "Nuit du 14 octobre",
    newSettings: { equipment: { mode: "visual" }, minAltitude: 20 },
    capabilities: { "planner.multiple": false, "sync.plan_limit": 1000 },
    inputsFor: async () => request({}),
    persist: async () => {},
    remove: async () => {},
    placement: "ideal",
    comfort,
    id: () => "quick",
  });
  const made = await action.create(new Set(["high"]));
  assert.equal(made.kind, "created");
  assert.equal(made.plan.items[0].startMinute, shown.items[0].startMinute);
  assert.ok(shown.items[0].maxAltitude <= 65);
});

test("the choice is one for every dialog of the browser", () => {
  const kept = new Map();
  const storage = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => kept.set(key, value),
  };
  assert.equal(readObservationComfort(storage), false);
  writeObservationComfort(storage, true);
  assert.equal(kept.get("planner.suggest.comfort.v1"), "on");
  assert.equal(readObservationComfort(storage), true);
  writeObservationComfort(storage, false);
  assert.equal(readObservationComfort(storage), false);
});
