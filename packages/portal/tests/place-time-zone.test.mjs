import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyPlaceTimeZone,
  isKnownTimeZone,
  offlineTimeZoneForCoordinates,
  placeSaveBlock,
  resolvePlaceTimeZone,
  seaTimeZone,
} from "../src/planner/place-time-zone.js";
import {
  placeTimeZoneNames,
  placeTimeZoneRows,
} from "../src/planner/place-time-zone-anchors.js";

// The embedded table and the rule of the zone of a place.

test("the table reads real zones only, one row per anchor", () => {
  const rows = placeTimeZoneRows.split("|");
  assert.ok(rows.length > 1000, "an anchor for every region, not a toy table");
  for (const name of placeTimeZoneNames)
    assert.ok(isKnownTimeZone(name), `${name} is read by the runtime`);
  for (const row of rows) {
    const [zone, latitude, longitude] = row.split(";").map(Number);
    assert.ok(Number.isInteger(zone) && zone < placeTimeZoneNames.length);
    assert.ok(Math.abs(latitude) <= 9000 && Math.abs(longitude) <= 18000);
  }
});

test("no anchor carries a third-party map licence: the sources are named", async () => {
  const source = await readFile(
    new URL("./../src/planner/place-time-zone-anchors.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /public domain/);
  assert.doesNotMatch(source, /ODbL|CC BY-NC|OpenStreetMap/i);
});

test("the nearest anchor gives the zone; the sea gives Etc/GMT", () => {
  assert.equal(
    offlineTimeZoneForCoordinates({ latitude: 43.9, longitude: 7.4 }),
    "Europe/Paris",
  );
  assert.equal(
    offlineTimeZoneForCoordinates({ latitude: 0, longitude: 0 }),
    "Etc/GMT",
  );
  assert.equal(seaTimeZone(-150), "Etc/GMT+10");
  assert.equal(seaTimeZone(150), "Etc/GMT-10");
  assert.equal(
    offlineTimeZoneForCoordinates({ latitude: 95, longitude: 0 }),
    null,
  );
  assert.equal(offlineTimeZoneForCoordinates({}), null);
});

test("the rule: chosen, service, stored, table, none", () => {
  const place = { latitude: 43.9, longitude: 7.4 };
  assert.deepEqual(resolvePlaceTimeZone(place), {
    timeZone: "Europe/Paris",
    source: "table",
  });
  assert.equal(resolvePlaceTimeZone(place, "Europe/Rome").source, "service");
  assert.equal(
    resolvePlaceTimeZone({ ...place, timeZone: "Asia/Tokyo" }).source,
    "stored",
  );
  assert.deepEqual(
    resolvePlaceTimeZone(
      { ...place, timeZone: "Asia/Tokyo", timeZoneSource: "chosen" },
      "Europe/Rome",
    ),
    { timeZone: "Asia/Tokyo", source: "chosen" },
  );
  assert.deepEqual(resolvePlaceTimeZone({ name: "Maison" }), {
    timeZone: null,
    source: null,
  });
});

test("a resolution never replaces a chosen zone; a choice replaces everything", () => {
  const chosen = {
    latitude: 1,
    longitude: 2,
    timeZone: "Asia/Tokyo",
    timeZoneSource: "chosen",
  };
  assert.equal(applyPlaceTimeZone(chosen, "Europe/Paris", false), chosen);
  assert.deepEqual(applyPlaceTimeZone(chosen, "Europe/Paris", true), {
    ...chosen,
    timeZone: "Europe/Paris",
  });
  const resolved = { latitude: 1, longitude: 2, timeZone: "Europe/Monaco" };
  assert.deepEqual(applyPlaceTimeZone(resolved, "Europe/Paris", false), {
    latitude: 1,
    longitude: 2,
    timeZone: "Europe/Paris",
  });
});

test("a place without a zone cannot be saved, and says why", () => {
  assert.equal(placeSaveBlock({ latitude: 1, longitude: 2 }), "timeZone");
  assert.equal(placeSaveBlock({ timeZone: "Europe/Paris" }), "coordinates");
  assert.equal(
    placeSaveBlock({ latitude: 1, longitude: 2, timeZone: "Europe/Paris" }),
    null,
  );
});
