// Every web caller of `planNight` hands it the inventory of
// the Espace (`visualInventoryOf`, the object the preview tries): a target an
// own OIII saves shows up with that filter, « dans votre matériel »; without
// an inventory the generic filter judges it, as before.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveEquipment } from "../src/planner.js";
import { scorePlanTargets } from "../src/tonight-plan-targets.js";
import { tonightPlacementInputs } from "../src/tonight-suggestions.js";
import { visualInventoryOf } from "../src/visual-pairs.js";
import common from "../src/common-equipment-profiles.json" with { type: "json" };

const veil = {
  id: "openngc-ngc6960",
  source: "NGC 6960",
  designation: "NGC 6960",
  title: "Dentelle ouest",
  objects: ["NGC 6960"],
  coordinate: { ra: 20.7662 * 15, dec: 30.5951 },
  coordinateUnit: "degrees",
  integratedMagnitude: 7,
  apparentSizeArcmin: [210, 160],
  skyTarget: { typeKey: "Rémanent de supernova" },
  tags: [],
};
const oiii = { id: "own-oiii", name: "Mon OIII", family: "oiii" };
const place = {
  id: "alpes",
  name: "Alpes",
  latitude: 44,
  longitude: 6,
  timezone: "Europe/Paris",
  timeZone: "Europe/Paris",
};
const sets = {
  telescopes: common.telescopes,
  eyepieces: common.eyepieces,
  filters: [oiii],
};
const equipment = {
  mode: "visual",
  telescopeId: "skywatcher-newton-250-1200",
  eyepieceId: "plossl-10",
  filterIds: [],
};
const date = "2026-08-15";
const sky = { sqm: 18.5 };

const pairOf = (card) => card?.visual?.pair;

test("the plan's targets: an own OIII is the pair of the slot, and without the filter in the sets it is not", () => {
  const plan = {
    id: "plan",
    date,
    location: place,
    equipment,
    items: [{ startMinute: 55, endMinute: 175, target: veil }],
  };
  const own = scorePlanTargets({
    plan,
    date,
    profileSets: sets,
    locale: "fr",
    visualSkyQuality: sky,
  });
  const ownPair = pairOf(Object.values(own)[0]?.card);
  assert.ok(ownPair, "the slot has a verdict");
  assert.equal(ownPair.filter.id, "own-oiii");
  assert.equal(ownPair.generic, false);
  // The same sets without the filter: the pair is not the own OIII.
  const bare = scorePlanTargets({
    plan,
    date,
    profileSets: { ...sets, filters: [] },
    locale: "fr",
    visualSkyQuality: sky,
  });
  const barePair = pairOf(Object.values(bare)[0]?.card);
  assert.notEqual(barePair.filter?.id, "own-oiii");
});

test("the plan's targets read the plan's place's sky: Bortle 8 is judged fainter than the dark-sky default", () => {
  const plan = {
    id: "plan",
    date,
    location: place,
    equipment: { ...equipment, eyepieceId: "plossl-32" },
    items: [{ startMinute: 55, endMinute: 175, target: veil }],
  };
  const margin = (visualSkyQuality) =>
    Object.values(
      scorePlanTargets({
        plan,
        date,
        profileSets: sets,
        locale: "fr",
        visualSkyQuality,
      }),
    )[0]?.card?.visual?.magnitudeMargin;
  const dark = margin(null);
  const city = margin({ sqm: 17.7, bortleClass: 8 });
  assert.ok(Number.isFinite(dark) && Number.isFinite(city), "a verdict each");
  assert.ok(city < dark, `${city} < ${dark}`);
});

test("« Ce soir » and the plan's dialog hand the plan's sky to scorePlanTargets", () => {
  const read = (name) =>
    readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8");
  const call = (source) =>
    /scorePlanTargets\(\{[^}]*?\}\)/s.exec(source)?.[0] ?? "";
  assert.match(call(read("TonightPage.js")), /visualSkyQuality: planVisualSky/);
  assert.match(call(read("PlanSheetDialog.js")), /visualSkyQuality/);
  assert.match(read("PlannerPage.js"), /visualSkyQuality=\{visualSkyFor\(/);
});

const ownItems = (withFilter) => [
  {
    id: "own-newton",
    type: "telescope",
    name: "Newton 250/1200",
    planner: { apertureMm: 250, focalLengthMm: 1200 },
  },
  {
    id: "own-10",
    type: "eyepiece",
    name: "Plössl 10 mm",
    planner: { focalLengthMm: 10, apparentFieldDegrees: 52 },
  },
  ...(withFilter
    ? [{ id: "own-oiii", type: "filter", name: "OIII", planner: {} }]
    : []),
];

test("the quick suggestions: an own OIII saves the target and says so", () => {
  const cardOf = (withFilter) =>
    tonightPlacementInputs({
      plan: {
        date,
        location: place,
        equipment: {
          mode: "visual",
          telescopeId: "own-newton",
          eyepieceId: "own-10",
          filterIds: [],
        },
      },
      targets: [veil],
      locale: "fr",
      visualSkyQuality: sky,
      inventory: ownItems(withFilter),
    }).candidates.find(({ card }) => card.target.id === veil.id)?.card;
  const own = pairOf(cardOf(true));
  assert.equal(own?.filter.id, "own-oiii");
  assert.equal(own.generic, false);
  assert.equal(pairOf(cardOf(false))?.generic, true);
});

const read = (file) =>
  readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("the Planner page hands the inventory of the Espace to each planNight call", () => {
  const source = read("components/PlannerPage.js");
  const calls = source.split("planNight({").slice(1);
  assert.equal(calls.length, 3, "the page makes three nights");
  // Each call's arguments end well before the next one begins.
  for (const call of calls)
    assert.match(call.slice(0, 1600), /\n\s+visualInventory[,:]/);
  assert.match(source, /visualInventoryOf\(inventoryProfiles\)/);
});
