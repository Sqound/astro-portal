import assert from "node:assert/strict";
import test from "node:test";

import { planNightGeometry, planNightWindow } from "planner/planner.js";
import { planFrise, planFriseScale } from "planner/plan-frise.js";
import {
  planFriseGeometryComputations,
  planFriseInput,
  planHasPlacedTarget,
  resetPlanFriseCache,
} from "planner/plan-frise-input.js";

// The input of a plan's frise — the planner's own night and heights,
// the place's offset, one computation per plan version.

const place = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45",
  longitude: "-30",
  elevation: "0",
  timeZone: "Atlantic/Azores",
};
const target = (designation, ra, dec) => ({
  id: designation.toLowerCase().replace(" ", ""),
  source: designation,
  designation,
  title: `${designation} — Test`,
  objects: [designation],
  coordinate: { ra, dec },
  plannerSource: "catalogue",
});
const m31 = target("M31", 10.68, 41.27);
const ngc7000 = target("NGC 7000", 314.68, 44.33);
const item = (entry, startMinute, endMinute) => ({
  id: entry.id,
  startMinute,
  endMinute,
  target: entry,
});
const lake = () => ({
  id: "plan-lac",
  name: "Nuit d’octobre au lac",
  date: "2026-10-14",
  status: "pending",
  location: place,
  items: [item(m31, 55, 175), item(ngc7000, 205, 325)],
});

test.beforeEach(() => resetPlanFriseCache());

test("the night is the plan's own dark night and the heights are the planner's, every ten minutes", () => {
  const plan = lake();
  const input = planFriseInput(plan);
  const window = planNightWindow(plan, place);
  assert.deepEqual(input.night, {
    start: window.darkStart,
    end: window.darkEnd,
  });
  assert.equal(input.items.length, 2);
  assert.deepEqual(
    input.items.map((entry) => [
      entry.label,
      entry.startMinute,
      entry.endMinute,
    ]),
    [
      ["M31", 55, 175],
      ["NGC 7000", 205, 325],
    ],
  );
  const geometry = planNightGeometry({
    date: plan.date,
    location: place,
    targets: [m31],
    planetReferences: { planets: [] },
  });
  const [first] = input.items;
  assert.equal(first.series.length, geometry.candidates[0].series.length);
  assert.equal(
    first.series[3].altitude,
    geometry.candidates[0].series[3].altitude,
  );
  const step =
    Date.parse(first.series[1].time) - Date.parse(first.series[0].time);
  assert.equal(step, 10 * 60000);
  assert.equal(first.series[0].time, window.darkStart);
  assert.deepEqual(Object.keys(first.series[0]), ["time", "altitude"]);
});

test("the frise of a real plan has two blocks with a curve in the night's scale", () => {
  const input = planFriseInput(lake());
  const frise = planFrise(input);
  assert.deepEqual(
    frise.blocks.map((block) => block.label),
    ["M31", "NGC 7000"],
  );
  assert.ok(frise.blocks.every((block) => block.curve?.length > 4));
  assert.ok(frise.night.x0 > 0 && frise.night.x1 < 1);
  assert.ok(
    planFriseScale([input]).endClock > planFriseScale([input]).startClock,
  );
});

test("the offset is the one of the zone the page writes its times in, 0 without a usable zone", () => {
  assert.equal(planFriseInput(lake()).utcOffsetMinutes, 0);
  assert.equal(
    planFriseInput(lake(), { timeZone: "Asia/Kolkata" }).utcOffsetMinutes,
    330,
  );
  const zoneless = { ...lake(), location: { ...place, timeZone: undefined } };
  assert.equal(planFriseInput(zoneless).utcOffsetMinutes, 0);
  assert.equal(
    planFriseInput({
      ...lake(),
      location: { ...place, timeZone: "Nowhere/Land" },
    }).utcOffsetMinutes,
    0,
  );
  // The plan's place is the page's place when the plan has none of its own.
  const placeless = { ...lake(), location: undefined };
  assert.equal(
    planFriseInput(placeless, { place }).night.start.length > 10,
    true,
  );
});

test("a plan with no usable night or no placed target has no frise", () => {
  assert.equal(planFriseInput({ ...lake(), date: "" }), null);
  assert.equal(planFriseInput({ ...lake(), location: undefined }), null);
  assert.equal(
    planFriseInput({ ...lake(), location: { name: "Nulle part" } }),
    null,
  );
  assert.equal(planFriseInput({ ...lake(), items: [] }), null);
  assert.equal(
    planFriseInput({
      ...lake(),
      items: [{ id: "m31", target: m31 }, item(m31, 90, 90)],
    }),
    null,
  );
  assert.equal(planHasPlacedTarget({ ...lake(), items: [] }), false);
  assert.equal(planHasPlacedTarget(lake()), true);
});

test("a target with no coordinate is a block with its name and no curve", () => {
  const nameless = { ...m31, coordinate: undefined, objects: ["Nulle part"] };
  const input = planFriseInput({
    ...lake(),
    items: [item(nameless, 55, 175), item(ngc7000, 205, 325)],
  });
  assert.equal(input.items[0].series, null);
  assert.ok(input.items[1].series.length > 10);
  const frise = planFrise(input);
  assert.equal(frise.blocks[0].curve, null);
  assert.equal(frise.blocks[0].trend, "none");
});

test("the geometry is computed once per plan version, however often the card renders", () => {
  const plan = lake();
  assert.equal(planFriseGeometryComputations(), 0);
  for (let render = 0; render < 5; render += 1) planFriseInput({ ...plan });
  assert.equal(planFriseGeometryComputations(), 1);
  // Another reader of the same version, in another zone: still one.
  planFriseInput(plan, { timeZone: "Asia/Tokyo" });
  assert.equal(planFriseGeometryComputations(), 1);
  // A slot moved is another version; the name of the plan is not part of it.
  planFriseInput({ ...plan, name: "Renamed" });
  assert.equal(planFriseGeometryComputations(), 1);
  planFriseInput({
    ...plan,
    items: [item(m31, 60, 175), item(ngc7000, 205, 325)],
  });
  assert.equal(planFriseGeometryComputations(), 2);
  // A date, a darkness threshold or a place is another version too.
  planFriseInput({ ...plan, date: "2026-10-15" });
  planFriseInput({ ...plan, darkness: "nautical" });
  planFriseInput({ ...plan, location: { ...place, longitude: "-31" } });
  assert.equal(planFriseGeometryComputations(), 5);
});
