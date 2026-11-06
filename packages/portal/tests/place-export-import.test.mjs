import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDataExportService } from "../dist/data-export/service.js";
import { createDataImportService } from "../dist/data-import/service.js";
import { readDataExport } from "../dist/data-import/reader.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { createPlaceRepository } from "../dist/persistence/place-repository.js";
import { createPlaceSkyMeasureRepository } from "../dist/persistence/place-sky-measure-repository.js";

// What reads the places of a space
// after the contract changed. « Exporter mes données » carries the live
// places as written (never a deleted one, never their usage); the import of
// that file keeps each place's id and the instant of its last edit, and
// never changes an id the space holds — a deleted one included; a night
// measured by Astro Sync is never filed under a deleted place.

const NOW = "2026-10-09T12:00:00.000Z";

async function seedSpace(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Space ${tenantId}`, NOW],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "scrypt$test", NOW],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", NOW],
  );
  return { tenantId, userId };
}

const place = (name, latitude, editedAt, extra = {}) => ({
  name,
  latitude,
  longitude: -30,
  editedAt,
  ...extra,
});

test("the export carries the live places as written, the import keeps their ids and instants, a deleted place stays deleted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-place-export-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    const places = await createPlaceRepository({ driver });
    const camille = await seedSpace(driver);
    const write = (space, placeId, body) =>
      places.write({ tenantId: space.tenantId, placeId, body, timestamp: NOW });
    await write(
      camille,
      "col",
      place("Col des Étoiles", 45, "2026-10-08T19:42:00.000Z", {
        note: "Parking au col.",
        kind: "viewpoint",
      }),
    );
    await write(
      camille,
      "jardin",
      place("Jardin de la maison", 45.1, "2026-10-02T18:00:00.000Z"),
    );
    await write(
      camille,
      "ancien",
      place("Ancien lieu", 45.2, "2026-10-01T18:00:00.000Z"),
    );
    await places.remove({
      tenantId: camille.tenantId,
      placeId: "ancien",
      at: "2026-10-03T08:00:00.000Z",
      timestamp: NOW,
    });

    const exporter = await createDataExportService({
      driver,
      now: () => new Date(NOW),
    });
    const summary = await exporter.summary({ tenantId: camille.tenantId });
    assert.equal(
      summary.parts.places.count,
      2,
      "the deleted place is not exported",
    );
    const { bytes } = await exporter.archive({
      tenantId: camille.tenantId,
      parts: ["places"],
    });
    const exported = readDataExport(bytes).documents.places.places;
    assert.deepEqual(
      exported.map((entry) => entry.id),
      ["col", "jardin"],
    );
    assert.equal(exported[0].note, "Parking au col.");
    assert.equal(exported[0].kind, "viewpoint");
    assert.equal(exported[0].editedAt, "2026-10-08T19:42:00.000Z");
    for (const entry of exported)
      for (const key of ["usage", "createdAt", "updatedAt"])
        assert.equal(key in entry, false, key);

    // Another space holds « jardin » deleted: the import counts it as held.
    const dominique = await seedSpace(driver);
    await write(
      dominique,
      "jardin",
      place("Leur jardin", 45.1, "2026-10-04T18:00:00.000Z"),
    );
    await places.remove({
      tenantId: dominique.tenantId,
      placeId: "jardin",
      at: "2026-10-05T08:00:00.000Z",
      timestamp: NOW,
    });
    const importer = await createDataImportService({
      driver,
      now: () => new Date(NOW),
    });
    await importer.confirm({
      tenantId: dominique.tenantId,
      userId: dominique.userId,
      bytes,
    });
    const after = await places.list({
      tenantId: dominique.tenantId,
      timestamp: NOW,
    });
    assert.deepEqual(
      after.places.map((entry) => [entry.id, entry.name, entry.editedAt]),
      [["col", "Col des Étoiles", "2026-10-08T19:42:00.000Z"]],
    );
    assert.equal(after.places[0].note, "Parking au col.");
    assert.equal(
      "usage" in
        JSON.parse(
          (
            await driver.query(
              "SELECT details_json FROM known_locations WHERE tenant_id = ? AND client_id = ?",
              [dominique.tenantId, "col"],
            )
          ).rows[0].details_json,
        ),
      false,
    );

    // A night measured by Astro Sync near the deleted place is not filed
    // under it.
    const measures = await createPlaceSkyMeasureRepository({ driver });
    await assert.rejects(
      measures.record({
        tenantId: camille.tenantId,
        upload: {
          night: "2026-10-06",
          sqm: 21.2,
          poseCount: 12,
          methodVersion: "1",
          observedAt: "2026-10-06T22:00:00.000Z",
          site: { latitude: 45.2, longitude: -30 },
        },
      }),
      (error) => error.code === "place_not_found",
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
