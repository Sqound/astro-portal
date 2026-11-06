import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWindToleranceToPlans,
  defaultWindPreset,
  equipmentHasMount,
  equipmentWithWindTolerance,
  normalizeWindTolerance,
  planWindTolerance,
  readWindTolerancePreferences,
  windAssessment,
  windToleranceDefaultKey,
  windToleranceForEquipment,
  windToleranceKey,
  windTolerancePresets,
  windToleranceStorageKey,
  windTonightSubject,
  writeWindTolerancePreferences,
} from "planner/wind.js";

// The tolerance is a setting of the mount on this browser, copied into
// the plans that use that mount.

const at = (iso) => Date.parse(iso);
const hour = (iso, wind, gust) => ({ time: at(iso), wind, gust });
const night = {
  start: "2026-10-14T20:50:00.000Z",
  end: "2026-10-15T05:40:00.000Z",
};
const place = {
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const morning = at("2026-10-14T12:00:00Z");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("the four presets, in the order of the screen", () => {
  assert.deepEqual(
    windTolerancePresets.map(({ preset, sustainedKmh, gustKmh }) => [
      preset,
      sustainedKmh,
      gustKmh,
    ]),
    [
      ["light", 15, 25],
      ["standard", 20, 30],
      ["heavy", 30, 45],
      ["custom", null, null],
    ],
  );
  assert.equal(defaultWindPreset, "standard");
});

test("normalisation: Standard by default, presets keep their values, custom is held to 5–80 km/h", () => {
  assert.deepEqual(normalizeWindTolerance(undefined), {
    preset: "standard",
    sustainedKmh: 20,
    gustKmh: 30,
  });
  assert.deepEqual(
    normalizeWindTolerance({ preset: "light", sustainedKmh: 70 }),
    { preset: "light", sustainedKmh: 15, gustKmh: 25 },
  );
  assert.deepEqual(
    normalizeWindTolerance({
      preset: "custom",
      sustainedKmh: 2,
      gustKmh: 95.4,
    }),
    { preset: "custom", sustainedKmh: 5, gustKmh: 80 },
  );
  assert.deepEqual(
    normalizeWindTolerance({ preset: "custom", sustainedKmh: "23.5" }),
    { preset: "custom", sustainedKmh: 24, gustKmh: 30 },
  );
  assert.equal(normalizeWindTolerance("gale").preset, "standard");
});

test("a gust at 90 % of the limit is near, beyond it is over, at it is near", () => {
  const assess = (gust) =>
    windAssessment({
      hourly: [hour("2026-10-14T22:00:00Z", 5, gust)],
      tolerance: "standard",
      window: night,
    }).level;
  assert.equal(assess(26), "ok");
  assert.equal(assess(27), "near");
  assert.equal(assess(30), "near");
  assert.equal(assess(31), "over");
});

test("the sustained wind has its own limit", () => {
  const assess = (wind) =>
    windAssessment({
      hourly: [hour("2026-10-14T22:00:00Z", wind, 10)],
      tolerance: "standard",
      window: night,
    }).level;
  assert.equal(assess(17), "ok");
  assert.equal(assess(18), "near");
  assert.equal(assess(21), "over");
});

test("the sample night: gusts up to 27 km/h at 00:00, near the Standard limit", () => {
  const assessment = windAssessment({
    hourly: [
      hour("2026-10-14T21:00:00Z", 8, 14),
      hour("2026-10-14T23:00:00Z", 12, 23),
      hour("2026-10-15T00:00:00Z", 15, 27),
      hour("2026-10-15T01:00:00Z", 13, 27),
    ],
    tolerance: { preset: "standard" },
    window: night,
  });
  assert.equal(assessment.level, "near");
  assert.equal(assessment.gustMax, 27);
  // The first hour of the strongest gust wins a tie.
  assert.equal(assessment.gustMaxAt, at("2026-10-15T00:00:00Z"));
  assert.equal(assessment.firstNearAt, at("2026-10-15T00:00:00Z"));
  assert.equal(assessment.firstOverAt, null);
  assert.deepEqual(
    assessment.hours.map((entry) => entry.level),
    ["ok", "ok", "near", "near"],
  );
});

test("the first near and over instants follow the hours in order", () => {
  const assessment = windAssessment({
    hourly: [
      hour("2026-10-14T21:00:00Z", 5, 23),
      hour("2026-10-14T22:00:00Z", 5, 26),
      hour("2026-10-14T23:00:00Z", 5, 33),
    ],
    tolerance: { preset: "light" },
    window: night,
  });
  assert.equal(assessment.firstNearAt, at("2026-10-14T21:00:00Z"));
  assert.equal(assessment.firstOverAt, at("2026-10-14T22:00:00Z"));
  assert.equal(assessment.level, "over");
});

test("window limits: an hour counts when it overlaps the night", () => {
  const assessment = windAssessment({
    hourly: [
      hour("2026-10-14T19:00:00Z", 50, 70),
      hour("2026-10-14T20:00:00Z", 5, 10),
      hour("2026-10-15T05:00:00Z", 5, 10),
      hour("2026-10-15T05:40:00Z", 50, 70),
    ],
    tolerance: "standard",
    window: night,
  });
  assert.deepEqual(
    assessment.hours.map((entry) => entry.time),
    [at("2026-10-14T20:00:00Z"), at("2026-10-15T05:00:00Z")],
  );
  assert.equal(assessment.level, "ok");
});

test("no forecast: null, whether there is no row or no value", () => {
  assert.equal(
    windAssessment({ hourly: [], tolerance: "standard", window: night }),
    null,
  );
  assert.equal(windAssessment({}), null);
  assert.equal(
    windAssessment({
      hourly: [{ time: at("2026-10-14T22:00:00Z"), wind: null }],
      window: night,
    }),
    null,
  );
});

test("the mount's key, the stored map and the tolerance of an equipment", () => {
  assert.equal(windToleranceKey({ mountId: "eq-1" }), "eq-1");
  assert.equal(windToleranceKey({ mountId: "none" }), windToleranceDefaultKey);
  assert.equal(windToleranceKey(undefined), "default");
  const storage = memoryStorage();
  assert.deepEqual(readWindTolerancePreferences(storage), {});
  assert.equal(
    writeWindTolerancePreferences(storage, {
      "eq-1": { preset: "heavy" },
    }),
    true,
  );
  assert.ok(storage.values.has(windToleranceStorageKey));
  const preferences = readWindTolerancePreferences(storage);
  assert.deepEqual(
    windToleranceForEquipment(preferences, { mountId: "eq-1" }),
    {
      preset: "heavy",
      sustainedKmh: 30,
      gustKmh: 45,
    },
  );
  assert.equal(
    windToleranceForEquipment(preferences, { mountId: "eq-2" }).preset,
    "standard",
  );
  // A refusing or broken storage never throws.
  const refusing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(readWindTolerancePreferences(refusing), {});
  assert.equal(writeWindTolerancePreferences(refusing, {}), false);
  assert.deepEqual(
    readWindTolerancePreferences(
      memoryStorage({ [windToleranceStorageKey]: "{oops" }),
    ),
    {},
  );
});

test("changing mount takes the tolerance kept for the new mount, or none", () => {
  const preferences = { "eq-1": { preset: "light" } };
  assert.equal(
    equipmentWithWindTolerance({ mountId: "eq-1" }, preferences).windTolerance
      .preset,
    "light",
  );
  assert.equal(
    "windTolerance" in
      equipmentWithWindTolerance(
        { mountId: "eq-2", windTolerance: { preset: "light" } },
        preferences,
      ),
    false,
  );
});

test("the plan copy is applied to the pending plans of that mount only", () => {
  const plan = (id, extra = {}) => ({
    id,
    date: "2026-10-14",
    location: place,
    status: "pending",
    items: [],
    equipment: { mountId: "eq-1" },
    ...extra,
  });
  const plans = [
    plan("pending"),
    plan("executed", { status: "executed" }),
    plan("with-session"),
    plan("other-mount", { equipment: { mountId: "eq-2" } }),
    plan("started", { date: "2026-10-13" }),
  ];
  const { plans: next, changedIds } = applyWindToleranceToPlans(
    plans,
    "eq-1",
    { preset: "custom", sustainedKmh: 18, gustKmh: 26 },
    { now: morning, sessionPlanIds: ["with-session"] },
  );
  assert.deepEqual(changedIds, ["pending"]);
  assert.deepEqual(next[0].equipment, {
    mountId: "eq-1",
    windTolerance: { preset: "custom", sustainedKmh: 18, gustKmh: 26 },
  });
  assert.equal(next[1], plans[1]);
  assert.equal(next[2], plans[2]);
  assert.equal(next[3], plans[3]);
  assert.equal(next[4], plans[4]);
  // Executed plans keep theirs; a plan without the key reads Standard.
  assert.equal(planWindTolerance(next[1]).preset, "standard");
  // Nothing to change: the very same array.
  const again = applyWindToleranceToPlans(
    next,
    "eq-1",
    next[0].equipment.windTolerance,
    {
      now: morning,
      sessionPlanIds: ["with-session"],
    },
  );
  assert.equal(again.plans, next);
  assert.deepEqual(again.changedIds, []);
});

test("the line on tonight speaks of the sustained wind when it sets the level", () => {
  const assess = (tolerance, hourly) =>
    windAssessment({ hourly, tolerance, window: night });
  // The setting 22 / 34: gusts reach 31, under 34; the sustained wind reaches
  // 24, over 22 — the sustained wind sets the level.
  const sustained = windTonightSubject(
    assess({ preset: "custom", sustainedKmh: 22, gustKmh: 34 }, [
      hour("2026-10-14T22:00:00Z", 24, 31),
      hour("2026-10-15T00:00:00Z", 14, 20),
    ]),
  );
  assert.deepEqual(sustained, {
    subject: "sustained",
    level: "over",
    value: 24,
    at: at("2026-10-14T22:00:00Z"),
  });
  // The gusts set it, or tie with the sustained wind: they speak.
  assert.equal(
    windTonightSubject(
      assess("standard", [hour("2026-10-15T00:00:00Z", 15, 27)]),
    ).subject,
    "gust",
  );
  assert.equal(
    windTonightSubject(
      assess("standard", [hour("2026-10-15T00:00:00Z", 19, 27)]),
    ).subject,
    "gust",
  );
  // Only one of the two was forecast.
  assert.equal(
    windTonightSubject(
      assess("light", [hour("2026-10-15T00:00:00Z", 17, null)]),
    ).subject,
    "sustained",
  );
  // Neither: nothing to speak of.
  assert.equal(windTonightSubject(null), null);
  // The level is the assessment's own.
  const mixed = assess("standard", [hour("2026-10-15T00:00:00Z", 21, 25)]);
  assert.equal(windTonightSubject(mixed).level, mixed.level);
});

test("only equipment that names a mount has a wind limit to come near", () => {
  for (const equipment of [
    undefined,
    null,
    {},
    { mountId: null },
    { mountId: "" },
    { mountId: "none" },
  ])
    assert.equal(
      equipmentHasMount(equipment),
      false,
      JSON.stringify(equipment),
    );
  assert.equal(equipmentHasMount({ mountId: "eq6-r" }), true);
  // The key of the stored tolerance follows the same reading.
  assert.equal(windToleranceKey({ mountId: "none" }), windToleranceDefaultKey);
  assert.equal(windToleranceKey({ mountId: "eq6-r" }), "eq6-r");
});
