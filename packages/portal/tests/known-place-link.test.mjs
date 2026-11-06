import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPlaceRepository } from "../dist/persistence/place-repository.js";
import {
  normalizeKnownPlaceLink,
  normalizePlace,
} from "../dist/planner/state.js";

// The link of a personal place to a known place: kept, normalised, through
// every save of the planner document; the known place's own details never
// are. Synthetic places, open-sea coordinates.

const timestamp = "2026-10-01T20:15:00.000Z";
const link = {
  source: "osm",
  id: "osm:node/101",
  type: "viewpoint",
  linkedAt: timestamp,
  website: "https://belvedere.invalid/",
};
const canonical = {
  source: "osm",
  id: "node/101",
  type: "viewpoint",
  linkedAt: timestamp,
};

test("a place keeps its link, canonical and without details; a link that is not one is dropped", () => {
  const place = normalizePlace({
    name: "Belvédère de la Crête",
    latitude: 45.02,
    longitude: -30.04,
    knownPlace: link,
  });
  assert.deepEqual(place.knownPlace, canonical);
  assert.deepEqual(normalizePlace(place), place);
  for (const bad of [
    null,
    "node/101",
    { ...link, source: "OSM" },
    { ...link, id: "node/0" },
    { ...link, type: "parking" },
    { ...link, linkedAt: 1_800_000_000_000 },
  ])
    assert.equal(normalizeKnownPlaceLink(bad), null, JSON.stringify(bad));
});

test("a place of the space keeps the link, canonical and without details; a link that is not one is refused", async () => {
  // The places of a space are written
  // by `/v1/places` (`place-repository.js`), no longer by the planner's
  // whole document.
  const directory = await mkdtemp(join(tmpdir(), "astro-known-place-link-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await driver.run(
      "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
      ["tenant-1", "Test observatory", timestamp],
    );
    const repository = await createPlaceRepository({ driver });
    const linked = {
      name: "Belvédère de la Crête",
      latitude: 45.02,
      longitude: -30.04,
      knownPlace: link,
      editedAt: timestamp,
    };
    await repository.write({
      tenantId: "tenant-1",
      placeId: "place-crete",
      body: linked,
      timestamp,
    });
    await assert.rejects(
      repository.write({
        tenantId: "tenant-1",
        placeId: "place-garden",
        body: {
          ...linked,
          name: "Jardin de la maison",
          knownPlace: { ...link, type: "parking" },
        },
        timestamp,
      }),
      (error) => error.code === "invalid_request",
    );
    const loaded = await repository.list({ tenantId: "tenant-1", timestamp });
    assert.deepEqual(
      loaded.places.map((place) => place.id),
      ["place-crete"],
    );
    assert.deepEqual(loaded.places[0].knownPlace, canonical);
    assert.equal(JSON.stringify(loaded).includes("belvedere.invalid"), false);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
