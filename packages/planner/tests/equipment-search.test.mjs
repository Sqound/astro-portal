// The search and the menus « Marque » and « Type » of the equipment pickers:
// the shared cases the phone reads too, then the rule on the real catalogue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import commonEquipment from "../src/common-equipment-profiles.json" with { type: "json" };
import {
  equipmentDisplayName,
  equipmentKindOrder,
  equipmentPickerFilterCase,
  equipmentSearch,
  foldForSearch,
  searchTokens,
} from "../src/equipment-search.js";
import { telescopeGroups, telescopeSearch } from "../src/telescope-picker.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../astro-contracts/fixtures/equipment-picker-filter.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("the shared cases of equipment-picker-filter hold", () => {
  assert.equal(fixture.module, "equipment-picker-filter");
  assert.ok(fixture.cases.length >= 20);
  for (const { id, args, result } of fixture.cases)
    assert.deepEqual(equipmentPickerFilterCase(...args), result, id);
});

test("the search folds case, accents and ligatures, and keeps a row holding every word", () => {
  assert.equal(foldForSearch("Plössl Œil Célestron"), "plossl oeil celestron");
  assert.deepEqual(searchTokens("  Tele Vue   13 "), ["tele", "vue", "13"]);
  assert.deepEqual(searchTokens("   "), []);
  const rows = [
    { id: "a", name: "Tele Vue Ethos 13 mm" },
    { id: "b", name: "Tele Vue Ethos 21 mm" },
    { id: "c", name: "Baader Morpheus 12,5 mm" },
  ];
  const shown = equipmentSearch({
    category: "eyepiece",
    defaults: rows,
    query: "13 ETHOS",
  });
  assert.deepEqual(
    shown.defaults.map((row) => row.id),
    ["a"],
  );
});

test("the maker is written before a name that lacks it, once", () => {
  assert.equal(
    equipmentDisplayName({ name: "Seestar S50", maker: "ZWO" }),
    "ZWO Seestar S50",
  );
  assert.equal(
    equipmentDisplayName({ name: "ZWO ASI585MC Pro", maker: "ZWO" }),
    "ZWO ASI585MC Pro",
  );
  assert.equal(equipmentDisplayName({ name: "Plössl 25 mm" }), "Plössl 25 mm");
});

test("every kind of the catalogue is one the « Type » menu orders", () => {
  const categories = {
    telescope: commonEquipment.telescopes,
    eyepiece: commonEquipment.eyepieces,
    camera: commonEquipment.cameras,
    modifier: commonEquipment.opticalModifiers.filter(
      (profile) => profile.id !== "none",
    ),
  };
  for (const [category, profiles] of Object.entries(categories))
    for (const profile of profiles)
      if (profile.kind)
        assert.ok(
          equipmentKindOrder[category].includes(profile.kind),
          `${category} ${profile.id}: ${profile.kind}`,
        );
  for (const filter of commonEquipment.filters)
    assert.ok(equipmentKindOrder.filter.includes(filter.family), filter.id);
});

test("on the catalogue's eyepieces: Tele Vue and ultra wide field narrow the defaults, the menus stay faceted", () => {
  const defaults = commonEquipment.eyepieces;
  const all = equipmentSearch({ category: "eyepiece", defaults });
  assert.equal(all.count, defaults.length);
  assert.ok(all.showsSearch && all.showsMenus);
  // The most numerous maker of the catalogue comes first.
  const perMaker = new Map();
  for (const profile of defaults)
    perMaker.set(profile.maker, (perMaker.get(profile.maker) || 0) + 1);
  assert.equal(
    all.makers[0].value,
    [...perMaker].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
  );
  assert.ok(all.makers.some((maker) => maker.value === "Tele Vue"));
  assert.deepEqual(
    all.kinds.map((kind) => kind.value),
    equipmentKindOrder.eyepiece.filter((kind) =>
      defaults.some((profile) => profile.kind === kind),
    ),
  );
  const narrowed = equipmentSearch({
    category: "eyepiece",
    defaults,
    maker: "Tele Vue",
    kind: "ultra-wide-field",
  });
  assert.ok(narrowed.count > 0);
  assert.ok(
    narrowed.defaults.every(
      (profile) =>
        profile.maker === "Tele Vue" && profile.kind === "ultra-wide-field",
    ),
  );
  // « Tele Vue » in the maker menu counts the ultra wide fields only.
  assert.equal(
    narrowed.makers.find((maker) => maker.value === "Tele Vue").count,
    narrowed.count,
  );
  assert.equal(narrowed.filtered, true);
});

test("the telescope groups follow the search and the menus, « Mon matériel » never filtered by a menu", () => {
  const mine = [
    { id: "inv-c8", name: "C8 du club", apertureMm: 203, focalLengthMm: 2032 },
  ];
  const common = commonEquipment.telescopes;
  const groups = telescopeGroups(
    "fr",
    { mine, common, defaultsLabelled: true },
    "c8",
    { kind: "schmidt-cassegrain" },
  );
  assert.equal(groups[0].key, "mine");
  assert.deepEqual(
    groups[0].profiles.map((profile) => profile.id),
    ["inv-c8"],
  );
  for (const group of groups.slice(1))
    for (const profile of group.profiles)
      assert.equal(profile.kind, "schmidt-cassegrain", profile.id);
  const shown = telescopeSearch({ mine, common }, "", { maker: "Celestron" });
  assert.ok(shown.defaults.every((profile) => profile.maker === "Celestron"));
  assert.deepEqual(
    shown.mine.map((profile) => profile.id),
    ["inv-c8"],
  );
  // No filter: the groups of before.
  const plain = telescopeGroups("fr", { mine: [], common }, "");
  assert.equal(
    plain.reduce((sum, group) => sum + group.profiles.length, 0),
    common.length,
  );
});
