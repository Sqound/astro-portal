import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  compareTelescopes,
  filterDisplayName,
  naturalCompare,
  orderedTelescopeGroups,
  sortTelescopes,
  telescopeDisplayName,
  telescopeMaker,
  telescopeModel,
} from "../src/telescope-order.js";
import {
  smartTelescopeFilterProfiles,
  telescopeProfiles,
} from "../src/planner.js";

// The telescopes of every list are ordered by maker (alphabetical) then by
// model in the maker's own numbering, and named with the maker first.

const data = JSON.parse(
  await readFile(
    new URL("../src/common-equipment-profiles.json", import.meta.url),
    "utf8",
  ),
);

// Names of the tricky cases, in the order they must come out.
const expectedNames = [
  "Seestar S30",
  "Seestar S30 Pro",
  "Seestar S50",
  "Seestar S50 Pro",
  "DWARF II",
  "DWARF 3",
  "DWARF mini",
  "Vespera",
  "Vespera II",
  "Vespera 3",
  "Vespera Pro",
  "Vespera Pro 2",
  "Origin",
  "Origin Mark II",
  "Evostar 72 ED",
  "Evostar 80 ED",
  "Evostar 102 ED",
];

test("a model is read in its maker's numbering: numbers by value, roman numerals as numbers", () => {
  for (let index = 1; index < expectedNames.length; index += 1) {
    const [first, second] = [expectedNames[index - 1], expectedNames[index]];
    // Each name is compared with the one before it inside its own family.
    if (
      first.split(" ")[0].toLowerCase() === second.split(" ")[0].toLowerCase()
    )
      assert.ok(naturalCompare(first, second) < 0, `${first} < ${second}`);
  }
  assert.ok(naturalCompare("S30", "S50") < 0);
  assert.ok(naturalCompare("DWARF II", "DWARF 3") < 0);
  assert.ok(naturalCompare("Evostar 72 ED", "Evostar 102 ED") < 0);
  assert.ok(naturalCompare("Évostar", "Evostar Pro") < 0);
  assert.equal(naturalCompare("Seestar S50", "SEESTAR s50"), 0);
});

test("the telescopes of the data file are in the order the pickers use: connected, refractors, reflectors, each by maker then model", () => {
  const groups = data.telescopes.map((telescope) => telescope.group);
  assert.deepEqual(
    [...new Set(groups)],
    orderedTelescopeGroups([...new Set(groups)]),
  );
  for (const group of new Set(groups)) {
    const inGroup = data.telescopes.filter((t) => t.group === group);
    assert.deepEqual(
      inGroup.map((t) => t.id),
      sortTelescopes(inGroup).map((t) => t.id),
      group,
    );
  }
  // The groups are contiguous and in that order.
  assert.deepEqual(
    groups.filter((group, index) => group !== groups[index - 1]),
    ["connected", "refractors", "reflectors"],
  );
});

test("every telescope names its maker, and a model is its name without the maker", () => {
  for (const telescope of telescopeProfiles) {
    assert.ok(telescope.maker, telescope.id);
    assert.equal(telescopeMaker(telescope), telescope.maker);
    assert.ok(telescopeModel(telescope).length > 0, telescope.id);
    assert.ok(
      !telescopeModel(telescope)
        .toLowerCase()
        .startsWith(`${telescope.maker.toLowerCase()} `),
      telescope.id,
    );
    // The maker is written once before the model.
    const shown = telescopeDisplayName(telescope);
    assert.equal(shown.toLowerCase().indexOf(telescope.maker.toLowerCase()), 0);
    assert.equal(
      shown.toLowerCase().split(telescope.maker.toLowerCase()).length,
      2,
      shown,
    );
  }
  const names = Object.fromEntries(
    telescopeProfiles.map((t) => [t.id, telescopeDisplayName(t)]),
  );
  assert.equal(names["seestar-s50-pro"], "ZWO Seestar S50 Pro");
  assert.equal(names["dwarf-3"], "DWARFLAB Dwarf 3");
  assert.equal(names["vespera-ii"], "Vaonis Vespera II");
  assert.equal(names["celestron-origin"], "Celestron Origin");
  assert.equal(names["unistellar-evscope-2"], "Unistellar eVscope 2");
});

test("a row the administration holds without the maker field gets its maker from the common profile of the same id, else comes last by name", () => {
  const rows = [
    { id: "custom-dob", name: "Dobson 300" },
    { id: "seestar-s50", name: "Seestar S50" },
    { id: "dwarf-3", name: "Dwarf 3" },
    { id: "custom-ota", name: "Altair 80" },
  ];
  assert.deepEqual(
    sortTelescopes(rows).map((row) => row.id),
    ["dwarf-3", "seestar-s50", "custom-ota", "custom-dob"],
  );
  assert.equal(telescopeDisplayName(rows[1]), "ZWO Seestar S50");
  assert.equal(telescopeDisplayName(rows[0]), "Dobson 300");
  assert.ok(compareTelescopes(rows[1], rows[0]) < 0);
});

test("the built-in filters carry their bare name; the maker and model are composed for the screen from the telescopes they belong to", () => {
  for (const filter of data.filters) {
    for (const telescopeId of filter.telescopeIds) {
      const telescope = data.telescopes.find((t) => t.id === telescopeId);
      assert.ok(telescope, telescopeId);
      for (const word of [telescope.name, telescope.maker, "filter"])
        assert.ok(
          !filter.name.toLowerCase().includes(word.toLowerCase()),
          `${filter.id}: « ${filter.name} » holds « ${word} »`,
        );
    }
    assert.ok(filter.name.length <= 40, filter.id);
  }
  const byId = (id) => smartTelescopeFilterProfiles.find((f) => f.id === id);
  assert.equal(byId("filter-seestar-s50-uvir").name, "UV/IR-Cut");
  assert.equal(byId("filter-seestar-s30-uvir").name, "UV/IR-Cut");
  assert.equal(
    filterDisplayName(byId("filter-seestar-s50-uvir")),
    "ZWO Seestar S50 · UV/IR-Cut",
  );
  assert.equal(
    filterDisplayName(byId("filter-dwarf-3-vis")),
    "DWARFLAB Dwarf 3 · VIS",
  );
  // Several telescopes of one maker: the maker.
  assert.equal(
    filterDisplayName(byId("filter-vespera-dual-band")),
    "Vaonis · Dual Band",
  );
  // Generic and owned filters are their name.
  assert.equal(filterDisplayName({ id: "x", name: "Luminance" }), "Luminance");
  // The composed text is never written into the data.
  assert.ok(smartTelescopeFilterProfiles.every((f) => !f.name.includes(" · ")));
});

test("each smart telescope names the driver that can send it a plan, or none", () => {
  const drivers = new Set(["seestar", "dwarf", "vespera", "origin", "none"]);
  for (const telescope of data.telescopes) {
    if (telescope.group === "connected")
      assert.ok(drivers.has(telescope.driver), telescope.id);
    else assert.equal("driver" in telescope, false, telescope.id);
  }
  const driverOf = (id) => data.telescopes.find((t) => t.id === id).driver;
  for (const id of ["seestar-s50", "seestar-s50-pro", "seestar-s30-pro"])
    assert.equal(driverOf(id), "seestar");
  for (const id of ["dwarf-3", "dwarf-mini"])
    assert.equal(driverOf(id), "dwarf");
  for (const id of ["vespera", "vespera-ii", "vespera-pro", "vespera-3"])
    assert.equal(driverOf(id), "vespera");
  assert.equal(driverOf("celestron-origin"), "origin");
  for (const id of [
    "unistellar-odyssey",
    "vaonis-atlas",
    "vaonis-stellina",
    "dwarf-draco",
  ])
    assert.equal(driverOf(id), "none", id);
});

test("every value of a new smart telescope carries its maker's page", () => {
  for (const id of [
    "vespera",
    "vespera-pro",
    "vaonis-atlas",
    "vaonis-stellina",
  ]) {
    const telescope = data.telescopes.find((t) => t.id === id);
    const camera = data.integratedCameras.find(
      (c) => c.id === telescope.integratedCameraId,
    );
    for (const entry of [telescope, camera]) {
      assert.ok(entry.sources.length >= 1, entry.id);
      for (const key of entry.sources) {
        assert.ok(data.sources[key], key);
        assert.match(data.sources[key].url, /^https:\/\//);
      }
    }
    assert.ok(camera.pixelSizeUm > 0 && camera.sensorWidthMm > 0, id);
  }
});
