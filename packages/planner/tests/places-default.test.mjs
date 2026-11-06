// The default place rule, read from the contract's own fixture.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { defaultPlaceOf } from "planner/places-rules.js";

const fixture = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/fixtures/places/places-default.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

for (const entry of fixture.cases) {
  test(`places-default.json « ${entry.id} »`, () => {
    // The page keeps coordinates as text; the rule reads them either way.
    const places = entry.places.map((place) =>
      place.latitude === undefined
        ? place
        : {
            ...place,
            latitude: String(place.latitude),
            longitude: String(place.longitude),
          },
    );
    assert.equal(
      defaultPlaceOf(places, entry.markedId)?.id ?? null,
      entry.defaultId,
    );
  });
}

test("the same place is read when the service answers no default (two places)", () => {
  const first = {
    id: "gamsberg",
    latitude: -23.34,
    longitude: 16.2,
    editedAt: "2026-10-21T08:00:00.000Z",
  };
  const second = {
    id: "kitt-peak",
    latitude: 31.96,
    longitude: -111.6,
    editedAt: "2026-10-22T08:00:00.000Z",
  };
  // Service order (most recent first) and local order (oldest first).
  assert.equal(defaultPlaceOf([second, first], null).id, "gamsberg");
  assert.equal(defaultPlaceOf([first, second], null).id, "gamsberg");
  assert.equal(defaultPlaceOf([second, first], "kitt-peak").id, "kitt-peak");
});
