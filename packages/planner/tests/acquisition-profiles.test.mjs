import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  broadbandFilterFamilies,
  filterAdviceForNight,
  filterFamily,
  filterFamilyMeets,
  genericPlannerFilters,
  plannerFilterFamilies,
  targetFilterCompatibility,
} from "planner/filters.js";
import {
  bundledPlannerFilters,
  cameraProfiles,
  equipmentProfilesFromInventory,
  filtersForTelescope,
  filtersOfferedFor,
  normalizeSensorKind,
  smartTelescopeFilterProfiles,
  telescopeProfiles,
  withSmartTelescopeFilters,
} from "planner/planner.js";
import { normalizeOwnedFilter } from "planner/owned-filters.js";

// "Prise de vue par cible": what the proposal rule reads of the equipment,
// and the filters of the smart telescopes.

const data = JSON.parse(
  await readFile(
    new URL("../src/common-equipment-profiles.json", import.meta.url),
    "utf8",
  ),
);

test("the families l, r, g, b are read from the names of a mono camera's filters", () => {
  for (const [name, family] of [
    ["L", "l"],
    [" l ", "l"],
    ["Luminance", "l"],
    ["Lum", "l"],
    ["Red", "r"],
    ["R", "r"],
    ["Rouge", "r"],
    ["Green", "g"],
    ["Vert", "g"],
    ["Blue", "b"],
    ["Bleu", "b"],
    ["Vespera Solar Filter", "solar"],
  ])
    assert.equal(filterFamily(name), family, name);
  // What was already read stays read the same way.
  assert.equal(filterFamily("UV/IR Cut"), "broadband");
  assert.equal(filterFamily("Optolong L-Pro"), "broadband");
  assert.equal(filterFamily("L-eXtreme"), "dual");
  assert.equal(filterFamily("RGB"), "broadband");
  assert.equal(filterFamily({ name: "Whatever", family: "l" }), "l");
  assert.equal(filterFamily("Mystery Filter 42"), null);
});

test("a luminance or a colour channel is a broadband filter for the advice and the compatibility", () => {
  assert.deepEqual(broadbandFilterFamilies, ["broadband", "l", "r", "g", "b"]);
  assert.equal(filterFamilyMeets("l", "broadband"), true);
  assert.equal(filterFamilyMeets("b", "broadband"), true);
  assert.equal(filterFamilyMeets("l", "dual"), false);
  assert.equal(filterFamilyMeets("broadband", "l"), false);
  const galaxy = { skyTarget: { typeKey: "Galaxie" } };
  assert.equal(
    targetFilterCompatibility(galaxy, { filters: [{ name: "Luminance" }] }),
    true,
  );
  assert.equal(
    targetFilterCompatibility(galaxy, {
      filters: [{ name: "Red", family: "r" }],
    }),
    true,
  );
  assert.equal(
    targetFilterCompatibility(galaxy, { filters: [{ name: "Duo-band" }] }),
    false,
  );
  const advice = filterAdviceForNight({
    ownedFilters: [{ name: "Luminance" }],
    moonSeries: [],
    night: {
      start: "2026-10-21T10:00:00Z",
      end: "2026-10-21T20:00:00Z",
      moonIllumination: 5,
    },
  });
  assert.equal(advice[0].key, "moon-dim-broadband");
});

test("the planner's families gain l, r, g, b and solar; an owned filter of those families is kept", () => {
  assert.deepEqual(plannerFilterFamilies.slice(7), [
    "l",
    "r",
    "g",
    "b",
    "solar",
  ]);
  assert.deepEqual(
    normalizeOwnedFilter({ id: "a", name: "Lum", family: "l" }),
    {
      id: "a",
      name: "Lum",
      family: "l",
    },
  );
  assert.equal(genericPlannerFilters.length, 7);
});

test("the inventory's camera keeps its kind of sensor, its gains and its read noise; a telescope its exposure cap", () => {
  const profiles = equipmentProfilesFromInventory([
    {
      id: "c1",
      type: "camera",
      name: "Mono",
      specifications: {
        sensorWidthMm: 13.2,
        sensorHeightMm: 8.8,
        pixelSizeUm: 2.4,
        sensorKind: "mono",
        unityGain: 120,
        hcgGain: 0,
        readNoiseE: 1.2,
      },
    },
    {
      id: "c2",
      type: "camera",
      name: "Colour",
      planner: {
        sensorWidthMm: 23.5,
        sensorHeightMm: 15.7,
        sensorKind: "Color",
        hcgGain: "100",
      },
    },
    {
      id: "c3",
      type: "camera",
      name: "Odd",
      specifications: {
        sensorWidthMm: 5,
        sensorHeightMm: 4,
        sensorKind: "bayer",
        unityGain: "",
        hcgGain: -3,
        readNoiseE: 0,
      },
    },
    {
      id: "t1",
      type: "telescope",
      name: "Smart",
      specifications: {
        apertureMm: 35,
        focalLengthMm: 150,
        maxExposureSeconds: 60,
      },
      planner: {
        integratedCamera: {
          name: "IMX",
          sensorWidthMm: 7,
          sensorHeightMm: 4,
          sensorKind: "colour",
        },
      },
    },
    {
      id: "t2",
      type: "telescope",
      name: "Plain",
      specifications: {
        apertureMm: 80,
        focalLengthMm: 400,
        maxExposureSeconds: 0,
      },
    },
  ]);
  assert.deepEqual(
    profiles.cameras.map((camera) => [
      camera.sensorKind,
      camera.unityGain,
      camera.hcgGain,
      camera.readNoiseE,
    ]),
    [
      ["mono", 120, 0, 1.2],
      ["colour", undefined, 100, undefined],
      [undefined, undefined, undefined, undefined],
    ],
  );
  assert.equal(profiles.telescopes[0].maxExposureSeconds, 60);
  assert.equal(profiles.telescopes[0].integratedCamera.sensorKind, "colour");
  assert.equal("maxExposureSeconds" in profiles.telescopes[1], false);
  assert.equal(normalizeSensorKind("MONOCHROME"), "mono");
  assert.equal(normalizeSensorKind(3), null);
});

test("the enriched cameras give the gain the maker's page names, nothing the page does not", () => {
  const byId = (id) => cameraProfiles.find((camera) => camera.id === id);
  assert.deepEqual(
    cameraProfiles
      .filter((c) => "hcgGain" in c || "unityGain" in c)
      .map((c) => [c.id, c.unityGain, c.hcgGain, c.readNoiseE])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    [
      ["player-one-neptune-c-ii", undefined, 83, undefined],
      ["player-one-poseidon-c-pro", undefined, 125, 1.36],
      ["qhyccd-qhy268c", undefined, 56, undefined],
      ["zwo-asi2600mc-pro", undefined, 100, undefined],
      ["zwo-asi294mc-pro", undefined, 120, undefined],
      ["zwo-asi585mc-pro", undefined, 200, 0.7],
      ["zwo-asi662mc", undefined, 200, undefined],
    ],
  );
  assert.equal(byId("zwo-asi183mm-pro").sensorKind, "mono");
  for (const camera of data.cameras) {
    const traits = ["unityGain", "hcgGain", "readNoiseE"].filter(
      (key) => key in camera,
    );
    if (!traits.length) continue;
    // A value with a source: the maker's page the profile names, and a note
    // that quotes it.
    assert.ok(camera.sources.length >= 1, camera.id);
    assert.ok(
      typeof camera.gainNote === "string" &&
        camera.gainNote.includes("Maker's page"),
      camera.id,
    );
    for (const key of traits) assert.ok(camera[key] > 0, `${camera.id} ${key}`);
    for (const source of camera.sources)
      assert.ok(data.sources[source], source);
  }
  const dwarf = telescopeProfiles.find(
    (telescope) => telescope.id === "dwarf-3",
  );
  assert.equal(dwarf.maxExposureSeconds, 60);
  assert.equal(dwarf.makerPages.length >= 1, true);
  assert.deepEqual(
    telescopeProfiles.filter((t) => "maxExposureSeconds" in t).map((t) => t.id),
    ["dwarf-3"],
  );
});

test("the smart telescopes' filters name the maker's page, a family and the telescopes they belong to", () => {
  assert.equal(smartTelescopeFilterProfiles.length, data.filters.length);
  const ids = new Set();
  for (const filter of smartTelescopeFilterProfiles) {
    assert.ok(!ids.has(filter.id), filter.id);
    ids.add(filter.id);
    assert.ok(plannerFilterFamilies.includes(filter.family), filter.id);
    assert.equal(
      normalizeOwnedFilter(filter)?.family,
      filter.family,
      filter.id,
    );
    assert.ok(filter.makerPages.length >= 1, filter.id);
    for (const page of filter.makerPages) assert.match(page.url, /^https:\/\//);
    assert.ok(filter.telescopeIds.length >= 1, filter.id);
    for (const telescopeId of filter.telescopeIds)
      assert.ok(
        telescopeProfiles.some((t) => t.id === telescopeId),
        telescopeId,
      );
    // EXPO-F: a filter named in an acquisition line (the plan's, the frozen
    // one of the launch) is kept only up to the contract's 40 characters; a
    // longer name was dropped from the frozen line, and with it the filter
    // that the smart telescope's driver reads (DWARF filter index, Seestar
    // lp_filter).
    assert.ok(filter.name.length <= 40, filter.name);
  }
  const names = (telescopeId) =>
    filtersForTelescope(telescopeId).map((f) => [f.name, f.family]);
  assert.deepEqual(names("seestar-s50"), [
    ["UV/IR-Cut", "broadband"],
    ["Duo-Band", "dual"],
  ]);
  assert.deepEqual(
    names("seestar-s30").map(([, family]) => family),
    ["broadband", "dual"],
  );
  assert.deepEqual(
    names("dwarf-3").map(([, family]) => family),
    ["broadband", "broadband", "dual"],
  );
  assert.deepEqual(
    names("dwarf-mini").map(([, family]) => family),
    ["broadband", "dual"],
  );
  for (const id of ["vespera-ii", "vespera-3", "vespera-pro", "vespera-pro-2"])
    assert.deepEqual(names(id), [
      ["Light Pollution", "uhc"],
      ["Dual Band", "dual"],
      ["Solar", "solar"],
    ]);
  assert.deepEqual(names("skywatcher-skymax-127"), []);
  assert.equal(
    filtersForTelescope("seestar-s50", { withGeneric: true }).length,
    9,
  );
});

test("a guest who picks a smart telescope sees its filters in the list of filters", () => {
  assert.equal(
    bundledPlannerFilters.length,
    7 + data.filters.length + (data.filterProducts || []).length,
  );
  assert.deepEqual(bundledPlannerFilters.slice(0, 7), genericPlannerFilters);
  for (const filter of smartTelescopeFilterProfiles)
    assert.ok(
      bundledPlannerFilters.some((f) => f.id === filter.id),
      filter.id,
    );
  // A filter the list holds resolves like any other.
  const ids = new Set(bundledPlannerFilters.map((f) => f.id));
  assert.equal(ids.size, bundledPlannerFilters.length);
});

test("the sources the new filters and gains cite are all read, with the day they were", () => {
  for (const key of [
    "vaonis-light-pollution-filter",
    "vaonis-all-sky-filter-bundle",
    "vaonis-accessories-compatibility",
  ])
    assert.equal(data.sources[key].readOn, "2026-10-21");
  const cited = new Set();
  for (const group of [
    "telescopes",
    "cameras",
    "filters",
    "integratedCameras",
    "eyepieces",
  ])
    for (const entry of data[group])
      for (const key of entry.sources || []) cited.add(key);
  for (const key of Object.keys(data.sources))
    if (key.startsWith("vaonis-")) assert.ok(cited.has(key), key);
});

test("a plan offers a smart telescope's built-in filters for that telescope only, and the chosen ones stay", () => {
  const own = [{ id: "mine", name: "Mon Ha" }, ...genericPlannerFilters];
  const all = [...own, ...smartTelescopeFilterProfiles];
  const ids = (list) => list.map((filter) => filter.id);
  // A telescope that is not a smart one: every generic filter, no built-in one.
  assert.deepEqual(
    ids(
      filtersOfferedFor({
        filters: all,
        telescope: { id: "skywatcher-skymax-127" },
      }),
    ),
    ids(own),
  );
  // A smart telescope offers its own filters only.
  assert.deepEqual(
    ids(
      filtersOfferedFor({
        filters: all,
        telescope: telescopeProfiles.find((t) => t.id === "seestar-s50"),
      }),
    ),
    ["filter-seestar-s50-uvir", "filter-seestar-s50-duoband"],
  );
  // A chosen filter of another telescope stays, to be unticked.
  assert.ok(
    ids(
      filtersOfferedFor({
        filters: all,
        telescope: { id: "seestar-s50", ownFiltersOnly: true },
        selectedIds: ["filter-dwarf-3-vis"],
      }),
    ).includes("filter-dwarf-3-vis"),
  );
  assert.deepEqual(filtersOfferedFor({ filters: null }), []);
});

test("a list read from the portal gets the smart telescopes' filters once, never twice", () => {
  const fromPortal = [{ id: "filter-ha", name: "Hα", family: "ha" }];
  const completed = withSmartTelescopeFilters(fromPortal);
  assert.equal(completed.length, 1 + smartTelescopeFilterProfiles.length);
  assert.equal(withSmartTelescopeFilters(completed).length, completed.length);
  assert.deepEqual(
    withSmartTelescopeFilters(undefined).length,
    smartTelescopeFilterProfiles.length,
  );
});
