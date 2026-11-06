// The rule of possible duplicates, read from the contract's own fixture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  duplicatesOfPlace,
  foldPlaceName,
  placeDuplicateMetres,
  placeDuplicates,
  placeKindOf,
} from "planner/places-rules.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/fixtures/places/places-duplicates.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("the threshold is the fixture's", () => {
  assert.equal(placeDuplicateMetres, fixture.rule.thresholdMetres);
});

for (const entry of fixture.cases) {
  test(`places-duplicates.json « ${entry.id} »: pairs and pills`, () => {
    // The page keeps coordinates as text; the rule reads them either way.
    const places = entry.places.map((place) => ({
      ...place,
      latitude: String(place.latitude),
      longitude: String(place.longitude),
    }));
    const result = placeDuplicates(places);
    assert.deepEqual(result.duplicates, entry.duplicates);
    assert.deepEqual(result.flagged, entry.flagged);
  });
}

test("the folding drops accents and case, collapses white space, keeps « ß »", () => {
  assert.equal(foldPlaceName("  Col  des ÉTOILES "), "col des etoiles");
  assert.equal(foldPlaceName("Straße"), "straße");
  assert.notEqual(foldPlaceName("Straße"), foldPlaceName("Strasse"));
  assert.equal(foldPlaceName(null), "");
});

test("the duplicates of one place name the other place and the distance", () => {
  const three = fixture.cases.find((entry) => entry.id === "three-homonyms");
  const [a, b, c] = three.places;
  const found = duplicatesOfPlace(b, three.places);
  assert.deepEqual(
    found.map((pair) => [pair.other.id, pair.sameName, pair.distanceMetres]),
    // The pairs are read from the place's side: a (50 m) then c (4 954 m).
    [
      ["a", true, 50],
      ["c", true, 4954],
    ].map(([id, same, metres]) => [id, same, metres]),
  );
  assert.deepEqual(duplicatesOfPlace(a, [a]), []);
  assert.deepEqual(duplicatesOfPlace(c, []), []);
});

test("a place being created is compared with the others like a saved one", () => {
  const near = {
    id: "new",
    name: "Autre nom",
    latitude: "45.0005",
    longitude: "-30",
  };
  const others = [
    { id: "x", name: "Col des Étoiles", latitude: "45", longitude: "-30" },
  ];
  const [pair] = duplicatesOfPlace(near, others);
  assert.equal(pair.sameName, false);
  assert.ok(pair.distanceMetres < 100);
});

test("the kind of a place is its own, else the known place's, else « private »", () => {
  assert.equal(placeKindOf({ kind: "campsite" }), "campsite");
  assert.equal(
    placeKindOf({
      knownPlace: {
        source: "osm",
        id: "node/1",
        type: "park",
        linkedAt: "2026-10-01T00:00:00.000Z",
      },
    }),
    "park",
  );
  assert.equal(placeKindOf({ kind: "private" }), "private");
  assert.equal(placeKindOf({ kind: "garden" }), "private");
  assert.equal(placeKindOf({}), "private");
});
