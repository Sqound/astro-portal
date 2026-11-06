import assert from "node:assert/strict";
import test from "node:test";

import { filterFamily, plannerFilterFamilies } from "planner/filters.js";
import {
  addOwnedFilter,
  newOwnedFilterId,
  normalizeOwnedFilter,
  ownedFilterNameMaxLength,
  ownedFiltersStorageKey,
  ownedFiltersUnion,
  readOwnedFilters,
  removeOwnedFilter,
  renameOwnedFilter,
  writeOwnedFilters,
} from "planner/owned-filters.js";

// The filters the observer owns are the inventory's (read only) and the
// ones added on this browser; nothing is written to the inventory.

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

test("the browser key is the one of the phase, and the families are the planner's seven, then the channel filters of a mono camera and the solar one", () => {
  assert.equal(ownedFiltersStorageKey, "planner.ownedFilters");
  assert.deepEqual(plannerFilterFamilies, [
    "broadband",
    "dual",
    "ha",
    "oiii",
    "sii",
    "uhc",
    "hb",
    "l",
    "r",
    "g",
    "b",
    "solar",
  ]);
});

test("a filter is { id, name, family }: trimmed, cut, and refused without one of the three", () => {
  assert.deepEqual(
    normalizeOwnedFilter({ id: " a ", name: "  Duo   band ", family: "dual" }),
    { id: "a", name: "Duo band", family: "dual" },
  );
  const long = normalizeOwnedFilter({
    id: "a",
    name: "x".repeat(200),
    family: "ha",
  });
  assert.equal(long.name.length, ownedFilterNameMaxLength);
  for (const value of [
    { id: "a", name: "Hα", family: "infrared" },
    { id: "a", name: "", family: "ha" },
    { name: "Hα", family: "ha" },
    null,
    "Hα",
    ["a", "Hα", "ha"],
  ])
    assert.equal(normalizeOwnedFilter(value), null);
});

test("the stored list is read back, bad entries and repeated ids dropped", () => {
  const storage = memoryStorage({
    [ownedFiltersStorageKey]: JSON.stringify([
      { id: "local-1", name: "Hα 7 nm", family: "ha" },
      { id: "local-1", name: "Doublon", family: "ha" },
      { id: "local-2", name: "Sans famille" },
      "texte",
      { id: "local-3", name: "UV/IR cut", family: "broadband" },
    ]),
  });
  assert.deepEqual(
    readOwnedFilters(storage).map((filter) => filter.id),
    ["local-1", "local-3"],
  );
  assert.deepEqual(readOwnedFilters(memoryStorage()), []);
  assert.deepEqual(
    readOwnedFilters(memoryStorage({ [ownedFiltersStorageKey]: "{oups" })),
    [],
  );
  assert.deepEqual(readOwnedFilters(null), []);
});

test("writing keeps only valid filters; a storage that refuses says so", () => {
  const storage = memoryStorage();
  assert.equal(
    writeOwnedFilters(storage, [
      { id: "local-1", name: "Hα", family: "ha" },
      { id: "bad", name: "", family: "ha" },
    ]),
    true,
  );
  assert.deepEqual(JSON.parse(storage.values.get(ownedFiltersStorageKey)), [
    { id: "local-1", name: "Hα", family: "ha" },
  ]);
  assert.equal(
    writeOwnedFilters(
      {
        setItem() {
          throw new Error("blocked");
        },
      },
      [],
    ),
    false,
  );
});

test("adding, renaming and removing change only the browser's list", () => {
  let filters = [];
  let result = addOwnedFilter(
    filters,
    { name: "Double bande", family: "dual" },
    { now: 1_000_000 },
  );
  filters = result.filters;
  assert.equal(result.added.name, "Double bande");
  assert.match(result.added.id, /^local-/);
  // The same instant twice: the second id differs.
  result = addOwnedFilter(
    filters,
    { name: "UV/IR cut", family: "broadband" },
    { now: 1_000_000 },
  );
  assert.notEqual(result.added.id, filters[0].id);
  assert.equal(result.filters.length, 2);
  // Refused: the same array comes back.
  assert.equal(
    addOwnedFilter(filters, { name: " ", family: "dual" }, { now: 1 }).filters,
    filters,
  );
  assert.equal(
    addOwnedFilter(filters, { name: "X", family: "nope" }, { now: 1 }).added,
    null,
  );
  const renamed = renameOwnedFilter(filters, filters[0].id, "  Hα/OIII 7 nm ");
  assert.equal(renamed[0].name, "Hα/OIII 7 nm");
  assert.equal(filters[0].name, "Double bande");
  assert.equal(renameOwnedFilter(filters, "absent", "Autre"), filters);
  assert.equal(renameOwnedFilter(filters, filters[0].id, "   "), filters);
  assert.equal(
    renameOwnedFilter(filters, filters[0].id, "Double bande"),
    filters,
  );
  assert.deepEqual(removeOwnedFilter(result.filters, result.added.id), filters);
  assert.equal(removeOwnedFilter(filters, "absent"), filters);
});

test("an id never repeats one already taken", () => {
  assert.equal(newOwnedFilterId([], 36), "local-10");
  assert.equal(newOwnedFilterId([{ id: "local-10" }], 36), "local-10-2");
  assert.equal(
    newOwnedFilterId([{ id: "local-10" }, { id: "local-10-2" }], 36),
    "local-10-3",
  );
});

test("the owned filters are the inventory's, read only, then the device's", () => {
  const inventory = [
    { id: "f-1", name: "Double bande Hα/OIII 7 nm" },
    { id: "f-2", name: "UV/IR cut" },
    { id: "f-3", name: "Filtre maison" },
  ];
  const local = [
    { id: "local-a", name: "Anti-pollution large bande", family: "uhc" },
    { id: "f-2", name: "Copie", family: "broadband" },
  ];
  const union = ownedFiltersUnion({ inventory, local });
  assert.deepEqual(
    union.map(({ id, family, source }) => [id, family, source]),
    [
      ["f-1", "dual", "inventory"],
      ["f-2", "broadband", "inventory"],
      ["f-3", null, "inventory"],
      ["local-a", "uhc", "device"],
    ],
  );
  // The inputs are not touched.
  assert.equal(inventory.length, 3);
  assert.equal(local.length, 2);
  // A guest has no inventory; nothing owned gives nothing.
  assert.equal(ownedFiltersUnion({ inventory: [], local }).length, 2);
  assert.deepEqual(ownedFiltersUnion({}), []);
  // The French inventory name "Double bande" is a dual-band filter.
  assert.equal(filterFamily("Double bande Hα/OIII 7 nm"), "dual");
});
