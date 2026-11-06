import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createPlaceResourceService } from "../dist/api/place-resources.js";
import { subscribe } from "../dist/api/change-bus.js";
import { createDatabaseDriver } from "../dist/persistence/database.js";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { PostgresDriver } from "../dist/persistence/postgres-driver.js";
import {
  PLACE_LIMIT,
  RESERVED_PLACE_IDS,
  listLivePlaces,
} from "../dist/persistence/place-repository.js";

// The places of a space
// (`place.schema.json`, `v1.md` « Places »): the rule of the most recent
// edit (the matrix of `fixtures/places/places-conflict.json`), the usage and
// the refusal of a deletion, the default place, the import, the limit, the
// entitlement gate, the `places` signal, the isolation between spaces.

const contracts = new URL("../../astro-contracts/", import.meta.url);
const conflict = JSON.parse(
  await readFile(
    new URL("fixtures/places/places-conflict.json", contracts),
    "utf8",
  ),
);
const examples = JSON.parse(
  await readFile(new URL("fixtures/places/places.json", contracts), "utf8"),
).examples;

const NOW = "2026-10-09T12:00:00.000Z";
const minutes = (count) =>
  new Date(Date.parse(NOW) + count * 60_000).toISOString();

async function seedIdentity(driver, tenantId, userId) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, `Observatory ${tenantId}`, NOW],
  );
  await driver.run(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    [userId, `${userId}@example.test`, "scrypt$test", NOW],
  );
  await driver.run(
    "INSERT INTO memberships (id, tenant_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
    [randomUUID(), tenantId, userId, "owner", NOW],
  );
}

async function insertPlan(
  driver,
  { tenantId, userId, placeId, status = "pending", deleted = false, date },
) {
  const id = randomUUID();
  await driver.run(
    "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, location_json, status, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      id,
      tenantId,
      userId,
      `client-${id}`,
      date,
      `Nuit du ${date}`,
      JSON.stringify({
        id: placeId,
        name: "Col des Étoiles",
        latitude: 45,
        longitude: -30,
      }),
      status,
      NOW,
      NOW,
      deleted ? NOW : null,
    ],
  );
  return id;
}

async function expectError(action, code, status) {
  await assert.rejects(action, (error) => {
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.body.error.code, code);
    return true;
  });
}

function serviceAt(driver, clock, extra = {}) {
  return createPlaceResourceService({
    driver,
    now: () => clock.now,
    ...extra,
  });
}

const place = (name, editedAt, extra = {}) => ({
  name,
  latitude: 45,
  longitude: -30,
  editedAt,
  ...extra,
});

/** One case of the matrix, played against the service on an empty space. */
async function playConflictCase(driver, entry) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  const clock = { now: NOW };
  const service = await serviceAt(driver, clock);
  const idOf = (value) => (value === "A" ? conflict.base.placeId : value);
  for (const [index, step] of entry.steps.entries()) {
    const label = `${entry.id} step ${index + 1}`;
    clock.now = step.now;
    const { method, path, body, placeId, at } = step.request;
    let status = 200;
    let answer;
    try {
      if (method === "PUT" && path === "default")
        answer = await service.setDefault({
          tenantId,
          userId,
          body: { ...body, placeId: body.placeId ? idOf(body.placeId) : null },
        });
      else if (method === "PUT") {
        answer = await service.write({
          tenantId,
          userId,
          placeId: idOf(placeId),
          body: {
            latitude: conflict.base.latitude,
            longitude: conflict.base.longitude,
            ...body,
          },
        });
        status = answer.created ? 201 : 200;
      } else if (method === "DELETE")
        answer = await service.remove({
          tenantId,
          userId,
          placeId: idOf(placeId),
          at: at ?? null,
        });
      else if (placeId)
        answer = await service.get({ tenantId, placeId: idOf(placeId) });
      else answer = await service.list({ tenantId });
    } catch (error) {
      if (!error.body) throw error;
      status = error.status;
      answer = error.body;
    }
    const { expect } = step;
    assert.equal(status, expect.status, label);
    if ("code" in expect) assert.equal(answer.error.code, expect.code, label);
    if ("applied" in expect)
      assert.equal(answer.applied, expect.applied, label);
    if ("deleted" in expect)
      assert.equal(answer.deleted, expect.deleted, label);
    if ("place" in expect) assert.equal(answer.place, expect.place, label);
    if ("name" in expect) assert.equal(answer.place.name, expect.name, label);
    if ("editedAt" in expect)
      assert.equal(answer.place.editedAt, expect.editedAt, label);
    if ("placeIds" in expect)
      assert.deepEqual(
        answer.places.map((entry) => entry.id),
        expect.placeIds.map(idOf),
        label,
      );
    if ("defaultPlaceId" in expect)
      assert.equal(
        answer.defaultPlaceId,
        expect.defaultPlaceId ? idOf(expect.defaultPlaceId) : null,
        label,
      );
  }
}

async function exercisePlaces(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const otherTenantId = randomUUID();
  const otherUserId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await seedIdentity(driver, otherTenantId, otherUserId);
  const clock = { now: NOW };
  const service = await serviceAt(driver, clock);
  const events = [];
  const unsubscribe = subscribe(tenantId, (event) => events.push(event));
  try {
    // The example place of the contract round-trips: what is written is
    // what is read, with its usage.
    const full = examples.find((example) => example.id === "place-write").value;
    const colId = full.id;
    const created = await service.write({
      tenantId,
      userId,
      placeId: colId,
      body: full,
      originClientInstanceId: "instance-writer",
    });
    assert.equal(created.created, true);
    assert.equal(created.applied, true);
    const { editedAt: _editedAt, ...fields } = full;
    const read = await service.get({ tenantId, placeId: colId });
    for (const [key, value] of Object.entries(fields))
      assert.deepEqual(read[key], value, key);
    assert.equal(read.editedAt, full.editedAt);
    assert.equal(read.createdAt, NOW);
    assert.deepEqual(read.usage, { pendingPlans: [], pastPlans: [] });
    assert.equal(events.length, 1, "one signal for the creation");
    assert.deepEqual(events[0].domains, ["places"]);
    assert.equal(events[0].originClientInstanceId, "instance-writer");

    // An older write: kept as it was, no signal.
    const stale = await service.write({
      tenantId,
      userId,
      placeId: colId,
      body: { ...full, name: "Col du Nord", editedAt: minutes(-60 * 24 * 3) },
    });
    assert.equal(stale.applied, false);
    assert.equal(stale.place.name, "Col des Étoiles");
    assert.equal(events.length, 1, "no signal for a write not kept");

    // A newer write replaces the whole block: the fields it leaves out go.
    const replaced = await service.write({
      tenantId,
      userId,
      placeId: colId,
      body: place("Col des Étoiles", minutes(-30)),
    });
    assert.equal(replaced.applied, true);
    assert.equal(replaced.place.note, undefined);
    assert.equal(replaced.place.horizonMask, null);
    assert.equal(replaced.place.timeZone, undefined, "no time zone kept");
    assert.equal(events.length, 2);

    // Usage: a plan to execute blocks the deletion; executed, partial,
    // abandoned and archived plans, and a deleted plan, never do.
    const pending = await insertPlan(driver, {
      tenantId,
      userId,
      placeId: colId,
      date: "2026-10-12",
    });
    for (const [status, date] of [
      ["executed", "2026-10-05"],
      ["partial", "2026-10-06"],
      ["abandoned", "2026-10-07"],
      ["archived", "2026-09-01"],
    ])
      await insertPlan(driver, {
        tenantId,
        userId,
        placeId: colId,
        status,
        date,
      });
    await insertPlan(driver, {
      tenantId,
      userId,
      placeId: colId,
      date: "2026-10-14",
      deleted: true,
    });
    const used = await service.get({ tenantId, placeId: colId });
    assert.deepEqual(
      used.usage.pendingPlans.map((plan) => [plan.planId, plan.status]),
      [[pending, "active"]],
    );
    assert.deepEqual(
      used.usage.pastPlans.map((plan) => plan.status),
      ["archived", "executed", "partial", "abandoned"],
    );
    assert.equal(used.usage.pendingPlans[0].planDate, "2026-10-12");
    assert.equal(used.usage.pendingPlans[0].name, "Nuit du 2026-10-12");
    await assert.rejects(
      service.remove({ tenantId, userId, placeId: colId, at: minutes(-1) }),
      (error) => {
        assert.equal(error.code, "place_in_use");
        assert.equal(error.status, 409);
        assert.deepEqual(
          error.body.pendingPlans.map((plan) => plan.planId),
          [pending],
        );
        return true;
      },
    );
    assert.equal(events.length, 2, "no signal for a refused deletion");
    await driver.run("UPDATE plans SET status = 'executed' WHERE id = ?", [
      pending,
    ]);
    assert.deepEqual(
      await service.remove({
        tenantId,
        userId,
        placeId: colId,
        at: minutes(-1),
      }),
      { deleted: true },
    );
    assert.equal(events.length, 3);
    await expectError(
      service.get({ tenantId, placeId: colId }),
      "place_not_found",
      404,
    );

    // The default place: a live place, the same rule, none once deleted.
    const jardinId = randomUUID();
    await service.write({
      tenantId,
      userId,
      placeId: jardinId,
      body: place("Jardin de la maison", minutes(-20)),
    });
    assert.deepEqual(
      await service.setDefault({
        tenantId,
        userId,
        body: { placeId: jardinId, editedAt: minutes(-10) },
      }),
      {
        defaultPlaceId: jardinId,
        defaultPlaceEditedAt: minutes(-10),
        applied: true,
      },
    );
    await expectError(
      service.setDefault({
        tenantId,
        userId,
        body: { placeId: colId, editedAt: minutes(-5) },
      }),
      "place_not_found",
      404,
    );
    await expectError(
      service.setDefault({ tenantId, userId, body: { editedAt: minutes(-5) } }),
      "invalid_request",
      400,
    );
    const list = await service.list({ tenantId });
    assert.equal(list.defaultPlaceId, jardinId);
    assert.deepEqual(
      list.places.map((entry) => entry.id),
      [jardinId],
    );

    // The space of another person: nothing of this one, and a write there
    // under the same id creates its own place.
    assert.deepEqual(await service.list({ tenantId: otherTenantId }), {
      places: [],
      defaultPlaceId: null,
      defaultPlaceEditedAt: null,
    });
    await expectError(
      service.get({ tenantId: otherTenantId, placeId: jardinId }),
      "place_not_found",
      404,
    );
    await expectError(
      service.remove({
        tenantId: otherTenantId,
        userId: otherUserId,
        placeId: jardinId,
      }),
      "place_not_found",
      404,
    );
    const theirs = await service.write({
      tenantId: otherTenantId,
      userId: otherUserId,
      placeId: jardinId,
      body: place("Leur jardin", minutes(-1)),
    });
    assert.equal(theirs.created, true);
    assert.equal(
      (await service.get({ tenantId, placeId: jardinId })).name,
      "Jardin de la maison",
    );

    // The import: each place keeps its own id; an id the space holds, live
    // or deleted, is never changed; replaying it changes nothing.
    const imported = await service.importPlaces({
      tenantId,
      userId,
      body: {
        places: [
          { id: jardinId, ...place("Jardin (téléphone)", minutes(-1)) },
          { id: colId, ...place("Col (téléphone)", minutes(-1)) },
          {
            id: "planner.known_locations.v1:42",
            ...place("Belvédère", "2025-01-01T00:00:00.000Z"),
          },
        ],
      },
    });
    assert.deepEqual(imported.imported, [
      { id: jardinId, created: false },
      { id: colId, created: false },
      { id: "planner.known_locations.v1:42", created: true },
    ]);
    assert.equal(
      imported.places.find((entry) => entry.id === jardinId).name,
      "Jardin de la maison",
    );
    assert.equal(
      imported.places.find(
        (entry) => entry.id === "planner.known_locations.v1:42",
      ).editedAt,
      "2025-01-01T00:00:00.000Z",
      "an old place a device kept alone is imported with its own instant",
    );
    const eventsBeforeReplay = events.length;
    const replay = await service.importPlaces({
      tenantId,
      userId,
      body: {
        places: [
          {
            id: "planner.known_locations.v1:42",
            ...place("Belvédère", minutes(0)),
          },
        ],
      },
    });
    assert.deepEqual(replay.imported, [
      { id: "planner.known_locations.v1:42", created: false },
    ]);
    assert.equal(
      events.length,
      eventsBeforeReplay,
      "nothing created, no signal",
    );
    await expectError(
      service.importPlaces({
        tenantId,
        userId,
        body: {
          places: [
            { id: "x-1", ...place("A", minutes(0)) },
            { id: "x-1", ...place("B", minutes(0)) },
          ],
        },
      }),
      "invalid_request",
      400,
    );
    await expectError(
      service.importPlaces({
        tenantId,
        userId,
        body: { places: [place("Sans identifiant", minutes(0))] },
      }),
      "invalid_request",
      400,
    );
    await expectError(
      service.importPlaces({
        tenantId,
        userId,
        body: {
          places: Array.from({ length: PLACE_LIMIT + 1 }, (_, index) => ({
            id: `bulk-${index}`,
            ...place("Lieu", minutes(0)),
          })),
        },
      }),
      "invalid_request",
      400,
    );

    // The bounds of a write, and the static segments of the routes.
    for (const reserved of RESERVED_PLACE_IDS)
      await expectError(
        service.write({
          tenantId,
          userId,
          placeId: reserved,
          body: place("X", minutes(0)),
        }),
        "invalid_request",
        400,
      );
    const refusedBodies = [
      place("", minutes(0)),
      place("   ", minutes(0)),
      place("é".repeat(101), minutes(0)),
      { ...place("X", minutes(0)), latitude: 91 },
      { ...place("X", minutes(0)), longitude: "-30" },
      { ...place("X", minutes(0)), elevation: 1240 },
      { ...place("X", minutes(0)), timeZone: "Mars/Olympus" },
      { ...place("X", minutes(0)), kind: "home" },
      { ...place("X", minutes(0)), note: "é".repeat(501) },
      { ...place("X", minutes(0)), skyEntered: { sqm: 23, enteredAt: NOW } },
      {
        ...place("X", minutes(0)),
        horizonMask: {
          enabled: true,
          points: Array.from({ length: 12 }, (_, index) => ({
            azimuth: index * 30,
            altitude: 5,
          })),
        },
      },
      { name: "X", latitude: 45, longitude: -30 },
      { ...place("X", minutes(0)), id: "another-id" },
    ];
    for (const body of refusedBodies)
      await expectError(
        service.write({ tenantId, userId, placeId: "bounds-1", body }),
        "invalid_request",
        400,
      );
    await expectError(
      service.write({
        tenantId,
        userId,
        placeId: "Col des Étoiles",
        body: place("X", minutes(0)),
      }),
      "invalid_request",
      400,
    );
    const kept = await service.write({
      tenantId,
      userId,
      placeId: "bounds-2",
      body: {
        ...place("  Le nom tel que tapé  ", minutes(0)),
        elevation: "",
        locality: "",
        timeZone: "UTC",
        kind: null,
        note: "",
        unknownField: "ignored",
      },
    });
    assert.equal(kept.place.name, "  Le nom tel que tapé  ", "never rewritten");
    assert.equal(kept.place.timeZone, "UTC");
    assert.equal("elevation" in kept.place, false);
    assert.equal("locality" in kept.place, false);
    assert.equal("note" in kept.place, false);
    assert.equal("unknownField" in kept.place, false);
    // The type of a place — « private » is a type of its own, and a
    // place made from a suggestion keeps the suggestion's type and its link.
    const ownKind = await service.write({
      tenantId,
      userId,
      placeId: "kind-1",
      body: place("Chez moi", minutes(1), { kind: "private" }),
    });
    assert.equal(ownKind.place.kind, "private");
    const linkedKind = await service.write({
      tenantId,
      userId,
      placeId: "kind-2",
      body: place("Le Camping des Cimes", minutes(1), {
        kind: "campsite",
        knownPlace: {
          source: "osm",
          id: "node/123",
          type: "campsite",
          linkedAt: NOW,
        },
      }),
    });
    assert.equal(linkedKind.place.kind, "campsite");
    assert.equal(linkedKind.place.knownPlace.id, "node/123");
    const kinds = await listLivePlaces(driver, tenantId);
    assert.equal(kinds.find((entry) => entry.id === "kind-1")?.kind, "private");
    assert.equal(
      kinds.find((entry) => entry.id === "kind-2")?.knownPlace?.type,
      "campsite",
    );
    await expectError(
      service.remove({ tenantId, userId, placeId: "bounds-2", at: "hier" }),
      "invalid_request",
      400,
    );
  } finally {
    unsubscribe();
  }
}

/** At most 200 live places; a deleted one frees its slot. */
async function exerciseLimit(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  const service = await serviceAt(driver, { now: NOW });
  await service.importPlaces({
    tenantId,
    userId,
    body: {
      places: Array.from({ length: PLACE_LIMIT }, (_, index) => ({
        id: `limit-${index}`,
        ...place(`Lieu ${index}`, minutes(-10)),
      })),
    },
  });
  await assert.rejects(
    service.write({
      tenantId,
      userId,
      placeId: "limit-200",
      body: place("De trop", minutes(0)),
    }),
    (error) => {
      assert.equal(error.code, "place_limit_reached");
      assert.equal(error.status, 409);
      assert.equal(error.body.limit, PLACE_LIMIT);
      return true;
    },
  );
  await expectError(
    service.importPlaces({
      tenantId,
      userId,
      body: { places: [{ id: "limit-200", ...place("De trop", minutes(0)) }] },
    }),
    "place_limit_reached",
    409,
  );
  // An edit of a place already there is never refused by the limit.
  assert.equal(
    (
      await service.write({
        tenantId,
        userId,
        placeId: "limit-0",
        body: place("Lieu 0 renommé", minutes(-1)),
      })
    ).applied,
    true,
  );
  await service.remove({
    tenantId,
    userId,
    placeId: "limit-1",
    at: minutes(-1),
  });
  assert.equal(
    (
      await service.write({
        tenantId,
        userId,
        placeId: "limit-200",
        body: place("Enfin", minutes(0)),
      })
    ).created,
    true,
  );
  // A deleted place brought back counts again.
  await expectError(
    service.write({
      tenantId,
      userId,
      placeId: "limit-1",
      body: place("Retour", minutes(1)),
    }),
    "place_limit_reached",
    409,
  );
  assert.equal((await listLivePlaces(driver, tenantId)).length, PLACE_LIMIT);
}

/** The read-only window of an ended subscription: reads open, writes 403. */
async function exerciseReadOnly(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  const open = await serviceAt(driver, { now: NOW });
  await open.write({
    tenantId,
    userId,
    placeId: "ro-1",
    body: place("Col", minutes(-5)),
  });
  const readOnly = await serviceAt(
    driver,
    { now: NOW },
    {
      entitlementProvider: {
        capabilitiesFor: async () => ({}),
        writeAccessFor: async () => ({ readOnly: true }),
      },
    },
  );
  assert.equal((await readOnly.list({ tenantId })).places.length, 1);
  assert.equal((await readOnly.get({ tenantId, placeId: "ro-1" })).name, "Col");
  for (const action of [
    readOnly.write({
      tenantId,
      userId,
      placeId: "ro-1",
      body: place("X", minutes(0)),
    }),
    readOnly.write({
      tenantId,
      userId,
      placeId: "ro-2",
      body: place("X", minutes(0)),
    }),
    readOnly.remove({ tenantId, userId, placeId: "ro-1", at: minutes(0) }),
    readOnly.setDefault({
      tenantId,
      userId,
      body: { placeId: "ro-1", editedAt: minutes(0) },
    }),
    readOnly.importPlaces({
      tenantId,
      userId,
      body: { places: [{ id: "ro-3", ...place("X", minutes(0)) }] },
    }),
  ])
    await expectError(action, "entitlement_read_only", 403);
  assert.equal((await open.get({ tenantId, placeId: "ro-1" })).name, "Col");
}

/** Places stored before the migration (by the whole-document save). */
async function exerciseStoredBefore(driver) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  await seedIdentity(driver, tenantId, userId);
  await driver.run(
    "INSERT INTO known_locations (id, tenant_id, client_id, details_json, created_at, updated_at, edited_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      "location-1",
      JSON.stringify({
        id: "location-1",
        name: "Col des Étoiles",
        latitude: "45.00000",
        longitude: "-30.00000",
        elevation: "",
        timeZone: "UTC",
      }),
      NOW,
      NOW,
      NOW,
    ],
  );
  const [stored] = (
    await createPlaceResourceService({ driver }).then((service) =>
      service.list({ tenantId }),
    )
  ).places;
  assert.equal(stored.latitude, 45);
  assert.equal(stored.longitude, -30);
  assert.equal("elevation" in stored, false);
  assert.equal(stored.horizonMask, null);
  assert.equal(stored.editedAt, NOW);
}

async function exerciseAll(driver) {
  await exercisePlaces(driver);
  await exerciseLimit(driver);
  await exerciseReadOnly(driver);
  await exerciseStoredBefore(driver);
}

test("places of a space: the most recent edit, usage, default place, import, limit, gate, signal, isolation, on scratch SQLite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-places-"));
  const driver = createDatabaseDriver({
    databasePath: join(directory, "portal.sqlite"),
  });
  try {
    await applyMigrations(driver, "sqlite");
    await exerciseAll(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test(
  "places of a space: the most recent edit, usage, default place, import, limit, gate, signal, isolation, on PostgreSQL",
  { skip: !process.env.ASTRO_PORTAL_TEST_DATABASE_URL },
  async () => {
    const databaseUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(databaseUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const resetSchema = async () => {
      const driver = PostgresDriver.open(databaseUrl);
      try {
        await driver.run("DROP SCHEMA public CASCADE");
        await driver.run("CREATE SCHEMA public");
      } finally {
        await driver.close();
      }
    };
    let driver;
    try {
      await resetSchema();
      driver = createDatabaseDriver({ databaseUrl });
      await applyMigrations(driver, "postgres");
      await exerciseAll(driver);
    } finally {
      if (driver) await driver.close();
      await resetSchema();
    }
  },
);

// The matrix of the most recent edit, one test per case of
// `places-conflict.json`, each on an empty space of one database per
// backend.
const postgresUrl = process.env.ASTRO_PORTAL_TEST_DATABASE_URL;
let sqliteMatrix = null;
let postgresMatrix = null;
async function matrixDriver(backend) {
  if (backend === "sqlite") {
    if (!sqliteMatrix) {
      const directory = await mkdtemp(join(tmpdir(), "astro-places-matrix-"));
      const driver = createDatabaseDriver({
        databasePath: join(directory, "portal.sqlite"),
      });
      await applyMigrations(driver, "sqlite");
      sqliteMatrix = { directory, driver };
    }
    return sqliteMatrix.driver;
  }
  if (!postgresMatrix) {
    if (!/\/astro_test(?:_[0-9a-z_]+)?(?:\?|$)/.test(postgresUrl))
      throw new Error(
        "ASTRO_PORTAL_TEST_DATABASE_URL must target astro_test or a throwaway astro_test_<name>.",
      );
    const reset = PostgresDriver.open(postgresUrl);
    try {
      await reset.run("DROP SCHEMA public CASCADE");
      await reset.run("CREATE SCHEMA public");
    } finally {
      await reset.close();
    }
    const driver = createDatabaseDriver({ databaseUrl: postgresUrl });
    await applyMigrations(driver, "postgres");
    postgresMatrix = { driver };
  }
  return postgresMatrix.driver;
}
after(async () => {
  if (sqliteMatrix) {
    await sqliteMatrix.driver.close();
    await rm(sqliteMatrix.directory, { force: true, recursive: true });
  }
  if (postgresMatrix) {
    await postgresMatrix.driver.close();
    const reset = PostgresDriver.open(postgresUrl);
    try {
      await reset.run("DROP SCHEMA public CASCADE");
      await reset.run("CREATE SCHEMA public");
    } finally {
      await reset.close();
    }
  }
});
for (const entry of conflict.cases) {
  test(`the most recent edit, ${entry.id}, on scratch SQLite`, async () => {
    await playConflictCase(await matrixDriver("sqlite"), entry);
  });
  test(
    `the most recent edit, ${entry.id}, on PostgreSQL`,
    { skip: !postgresUrl },
    async () => {
      await playConflictCase(await matrixDriver("postgres"), entry);
    },
  );
}
