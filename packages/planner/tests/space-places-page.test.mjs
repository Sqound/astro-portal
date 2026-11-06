// Where the
// planner page takes my places from — the space by `/v1/places` for a signed-in
// person, the browser's document for a visitor — what a plan keeps of a place,
// the one-time import before the browser's plans are carried, and what the
// notices say in the ten languages.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { shippedLocales } from "portal/locales.js";
import { message } from "portal/i18n.js";
import { localPlaceUsage } from "planner/components/useSpacePlaces.js";

const page = await readFile(
  new URL("../src/components/PlannerPage.js", import.meta.url),
  "utf8",
);
const hook = await readFile(
  new URL("../src/components/useSpacePlaces.js", import.meta.url),
  "utf8",
);

test("a signed-in person's places come from the space, a visitor's from the browser's document", () => {
  assert.match(page, /const placesFromSpace = Boolean\(auth\.authenticated\);/);
  assert.match(
    page,
    /const knownPlaces = placesFromSpace\s*\? spacePlacesOrdered\s*: state\.knownLocations;/,
  );
  assert.match(page, /active: placesFromSpace,/);
  assert.match(page, /email: auth\.user\?\.email \|\| null,/);
});

test("the page never reads the document's places for a space: every other reader goes through the list in hand", () => {
  const reads =
    page.match(
      /state\.knownLocations|current\.knownLocations|next\.knownLocations/g,
    ) || [];
  // The one definition, and the visitor's branches of the three writers.
  assert.ok(
    reads.length <= 8,
    `${reads.length} reads of the document's places`,
  );
  for (const gate of [
    /places=\{knownPlaces\}/g,
    /knownLocations: knownPlaces \|\| \[\]/g,
    /knownPlaces\?\.find/g,
  ])
    assert.ok(gate.test(page), String(gate));
  // The writers send a signed-in person's place to the space and keep the document for a visitor.
  assert.equal((page.match(/placesFromSpace\s*\? \{\}/g) || []).length, 2);
  assert.match(
    page,
    /if \(save && placesFromSpace\) spacePlaces\.save\(place\);/,
  );
  assert.match(page, /if \(placesFromSpace\) spacePlaces\.save\(place\);/);
  assert.match(
    page,
    /if \(placesFromSpace\) return spacePlaces\.remove\(id\);/,
  );
});

test("the default place is the space's for a signed-in person, this browser's for a visitor", () => {
  assert.match(
    page,
    /defaultPlaceId=\{placesFromSpace \? spacePlaces\.defaultId : undefined\}/,
  );
  assert.match(
    page,
    /onSetDefault=\{placesFromSpace \? spacePlaces\.setDefault : undefined\}/,
  );
  assert.match(
    page,
    /placesFromSpace \? spacePlaces\.defaultId : readDefaultPlaceId\(\)/,
  );
});

test("a plan keeps its own copy of the place, without the note, the type or the service's bookkeeping", () => {
  const commit = page.slice(
    page.indexOf("const commitPlaceChange"),
    page.indexOf("const choosePlace"),
  );
  assert.match(commit, /const planPlace = planCopyOfPlace\(place\);/);
  // The plans still to do follow the place, by the plan's copy of it: moved
  // into the night of that place, then written the place, or written it in
  // place.
  assert.match(
    commit,
    /movePendingPlansToNight\(\s*next,\s*planPlace,\s*pendingIds\s*\)/,
  );
  assert.match(
    commit,
    /applyNightPlace\(\s*moving\s*\?[^:]*:\s*next,\s*planPlace,?\s*\)/,
  );
  assert.match(commit, /location: planPlace,/);
  assert.ok(!/applyNightPlace\([^]*?,\s*place\s*,?\s*\)/.test(commit));
  assert.ok(!/movePendingPlansToNight\(\s*next,\s*place\b/.test(commit));
});

test("the browser's places are read at launch, before the plans of the browser are carried, and sent once", () => {
  assert.match(
    page,
    /browserPlacesRef\.current = restored\.knownLocations \|\| \[\];/,
  );
  assert.ok(
    page.indexOf("const browserPlacesRef = useRef([]);") <
      page.indexOf("const spacePlaces = useSpacePlaces({"),
  );
  assert.match(page, /browserPlacesRef,\s*onError:/);
  assert.match(hook, /browserPlaces: browserPlacesRef\?\.current \?\? \[\]/);
  // The browser's copy of a space's places leaves with its person.
  assert.match(page, /clearSpacePlacesCache\(localStorage\);/);
});

test("the space's places are read again at each change signal and at the return of the network", () => {
  assert.match(hook, /addEventListener\(CHANGE_SIGNAL_EVENT, reload\)/);
  assert.match(hook, /addEventListener\("online", reload\)/);
  assert.match(hook, /removeEventListener\(CHANGE_SIGNAL_EVENT, reload\)/);
});

test("a failure is told by the planner's one-line notice; offline at launch says nothing (the copy is shown)", () => {
  assert.match(page, /kind === "read" && error\?\.status === undefined/);
  assert.match(page, /setPersistenceError\(\s*message\(/);
  assert.match(page, /entitlement_read_only/);
  for (const locale of shippedLocales())
    for (const key of [
      "placesReadOnly",
      "placesReadFailed",
      "placesWriteFailed",
      "placesDeleteFailed",
      "placesDefaultFailed",
      "placesImportFailed",
    ])
      assert.notEqual(message(locale, key), key, `${locale} ${key}`);
});

const plan = (id, name, status, date, locationId) => ({
  id,
  name,
  date,
  status,
  location: { id: locationId },
});

test("a visitor's plans decide the refusal: only plans to execute block, past ones keep their copy", () => {
  const usage = localPlaceUsage("col", [
    plan("p1", "Plan 1", undefined, "2026-10-12", "col"),
    plan("p2", "Plan 2", "pending", "2026-10-14", "col"),
    plan("p3", "Plan 3", "executed", "2026-10-05", "col"),
    plan("p4", "Plan 4", "abandoned", "2026-09-30", "col"),
    plan("p5", "Plan 5", "archived", "2026-09-01", "col"),
    plan("p6", "Plan 6", undefined, "2026-10-12", "lac"),
  ]);
  assert.deepEqual(
    usage.pendingPlans.map((entry) => entry.planId),
    ["p1", "p2"],
  );
  assert.deepEqual(
    usage.pastPlans.map((entry) => [entry.planId, entry.status]),
    [
      ["p3", "executed"],
      ["p4", "abandoned"],
      ["p5", "archived"],
    ],
  );
  assert.equal(usage.pendingPlans[0].status, "active");
  assert.deepEqual(localPlaceUsage("col", []), {
    pendingPlans: [],
    pastPlans: [],
  });
  assert.deepEqual(
    localPlaceUsage(null, [plan("p", "x", undefined, "d", "col")]),
    { pendingPlans: [], pastPlans: [] },
  );
});

test("the picker and the sheet are given the usage of a place, from the space or from the browser's plans", () => {
  assert.match(
    page,
    /const placeUsageOf = \(place\) =>\s*placesFromSpace\s*\? \(place\.usage \?\? \{ pendingPlans: \[\], pastPlans: \[\] \}\)\s*: localPlaceUsage\(place\.id, state\.plans\);/,
  );
  assert.match(page, /usageOf=\{placeUsageOf\}/);
  assert.equal((page.match(/usageOf=\{placeUsageOf\}/g) || []).length, 2);
});

test("« Voir ce lieu » of the editor's duplicate line closes the editor and opens that place's sheet in « Lieux »", () => {
  assert.match(
    page,
    /setPlaceToShow\(other\.id\);\s*changePlannerView\("places"\);/,
  );
  assert.match(page, /showPlaceId=\{placeToShow\}/);
});

test("the visitor's line is shown only where signing in exists", () => {
  assert.match(
    page,
    /visitor=\{Boolean\(\s*auth\.checked && auth\.enabled && !auth\.authenticated,?\s*\)\}/,
  );
});
