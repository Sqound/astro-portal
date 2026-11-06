import assert from "node:assert/strict";
import { persistenceTest } from "../../../tests/helpers/persistence-backends.mjs";
import { CONTRIBUTION_RECORD_FIELDS } from "../dist/calibration/contribution-record.js";
import { createCalibrationContributionRepository } from "../dist/persistence/calibration-contribution-repository.js";

// The store of the project's calibration set, on SQLite and PostgreSQL —
// the consent off by default, what switching it on keeps, a changed value
// replacing its row, a removed one leaving, a withdrawal deleting the
// space's rows and ledger only. The places are
// the captures' synthetic ones (45° N, 30° W, in the Atlantic).

/** One scenario on a fresh, fully migrated SQLite and PostgreSQL. */
function scenario(name, run) {
  persistenceTest(name, async ({ open: openBackend }) => {
    const backend = await openBackend();
    try {
      await run(backend);
    } finally {
      await backend.close();
    }
  });
}

const AT = "2026-10-11T00:00:00.000Z";
const COL = { id: "col-des-melezes", latitude: 45.0, longitude: -30.0 };
const LAC = { id: "camping-du-lac-noir", latitude: 45.18, longitude: -30.0 };

/** A global 1° grid with every cell at level 140. */
const GRID = {
  cellSizeDegrees: 1,
  data: Buffer.alloc(360 * 180, 140),
  height: 180,
  north: 90,
  west: -180,
  width: 360,
};

async function open({ driver, dialect }, { grid = GRID } = {}) {
  let keys = 0;
  const clock = { now: Date.parse(AT) };
  const repository = await createCalibrationContributionRepository({
    driver,
    dialect,
    skyQualityGrid: async () => grid,
    clock: () => new Date(clock.now),
    rowKey: () => `row-${(keys += 1)}`,
  });
  return { repository, clock };
}

async function space(driver, tenantId) {
  await driver.run(
    "INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)",
    [tenantId, tenantId, AT],
  );
}

async function place(
  driver,
  tenantId,
  { id, latitude, longitude },
  extra = {},
) {
  await driver.run(
    `INSERT INTO known_locations (id, tenant_id, client_id, details_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, client_id) DO UPDATE SET details_json = excluded.details_json`,
    [
      `${tenantId}-${id}`,
      tenantId,
      id,
      JSON.stringify({ id, name: id, latitude, longitude, ...extra }),
      AT,
      AT,
    ],
  );
}

async function measure(driver, tenantId, placeId, night, sqm) {
  await driver.run(
    `INSERT INTO place_sky_measures (id, tenant_id, place_id, night, sqm, pose_count, method_version, observed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 14, 'astro-sync-sky/1', ?, ?, ?)
     ON CONFLICT (tenant_id, place_id, night) DO UPDATE SET sqm = excluded.sqm`,
    [
      `${tenantId}-${placeId}-${night}`,
      tenantId,
      placeId,
      night,
      sqm,
      AT,
      AT,
      AT,
    ],
  );
}

const rows = async (driver) =>
  (
    await driver.query(
      "SELECT * FROM calibration_contributions ORDER BY row_key",
    )
  ).rows;
const ledger = async (driver, tenantId) =>
  (
    await driver.query(
      "SELECT row_key FROM calibration_ledger WHERE tenant_id = ? ORDER BY row_key",
      [tenantId],
    )
  ).rows.map((row) => row.row_key);

scenario(
  "the consent is off by default and nothing is kept",
  async (backend) => {
    const { repository } = await open(backend);
    await space(backend.driver, "tenant-a");
    await place(backend.driver, "tenant-a", COL);
    await measure(backend.driver, "tenant-a", COL.id, "2026-10-10", 21.04);
    assert.deepEqual(await repository.status("tenant-a"), {
      enabled: false,
      consentedAt: null,
      kept: 0,
      lastKeptAt: null,
    });
    assert.equal(await repository.refresh("tenant-a"), null);
    assert.deepEqual(await rows(backend.driver), []);
  },
);

scenario(
  "switching on keeps the measured nights and the entered values the space holds, as records only",
  async (backend) => {
    const { repository } = await open(backend);
    const { driver } = backend;
    await space(driver, "tenant-a");
    await place(driver, "tenant-a", COL, {
      skyEntered: { sqm: 20.5, enteredAt: "2026-09-01T20:00:00.000Z" },
    });
    await measure(driver, "tenant-a", COL.id, "2026-10-10", 21.04);
    // A place the service knows only through a plan (the phone's way).
    await driver.run(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ('user-a', 'a@exemple.fr', NULL, ?)",
      [AT],
    );
    await driver.run(
      `INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, name, plan_date, location_json, created_at, updated_at)
       VALUES ('plan-1', 'tenant-a', 'user-a', 'browser-plan-1', 'Nuit', '2026-10-10', ?, ?, ?)`,
      [
        JSON.stringify({
          ...LAC,
          name: "Camping du Lac Noir",
          skyEntered: { sqm: 19.8, enteredAt: "2027-02-01T20:00:00.000Z" },
        }),
        AT,
        AT,
      ],
    );
    const status = await repository.setConsent({
      tenantId: "tenant-a",
      enabled: true,
    });
    assert.equal(status.enabled, true);
    assert.equal(status.consentedAt, AT);
    assert.equal(status.kept, 3);
    assert.equal(status.lastKeptAt, AT);
    const kept = (await rows(driver)).map((row) => ({
      kind: row.kind,
      sqm: Number(row.sqm),
      band: row.band,
      year: Number(row.year),
    }));
    assert.deepEqual(
      kept.sort((a, b) => a.sqm - b.sqm),
      [
        { kind: "entered", sqm: 19.8, band: "sqm", year: 2027 },
        { kind: "entered", sqm: 20.5, band: "sqm", year: 2026 },
        { kind: "measured", sqm: 21.04, band: "camera", year: 2026 },
      ],
    );
    for (const row of await rows(driver)) {
      assert.deepEqual(Object.keys(row).sort(), [
        "band",
        "kind",
        "method_version",
        "radiance_level",
        "region",
        "row_key",
        "sqm",
        "year",
      ]);
      const text = JSON.stringify(row);
      for (const secret of ["tenant-a", COL.id, LAC.id, "Lac Noir", "45.18"])
        assert.ok(!text.includes(secret), `${secret} in ${text}`);
    }
    assert.equal(CONTRIBUTION_RECORD_FIELDS.length, 7);
  },
);

scenario(
  "a changed value replaces its row, an unchanged one keeps it, a removed one leaves",
  async (backend) => {
    const { repository, clock } = await open(backend);
    const { driver } = backend;
    await space(driver, "tenant-a");
    await place(driver, "tenant-a", COL);
    await place(driver, "tenant-a", LAC);
    await measure(driver, "tenant-a", COL.id, "2026-10-10", 21.04);
    await measure(driver, "tenant-a", LAC.id, "2026-10-12", 20.1);
    await repository.setConsent({ tenantId: "tenant-a", enabled: true });
    assert.deepEqual(await ledger(driver, "tenant-a"), ["row-1", "row-2"]);
    const colRow = (await rows(driver)).find(
      (row) => Number(row.sqm) === 21.04,
    ).row_key;
    // Nothing changed: nothing is written again.
    assert.deepEqual(await repository.refresh("tenant-a"), {
      kept: 0,
      replaced: 0,
      removed: 0,
    });
    // The night of the Col sent again with another value.
    clock.now += 3600_000;
    await measure(driver, "tenant-a", COL.id, "2026-10-10", 20.95);
    assert.deepEqual(await repository.refresh("tenant-a"), {
      kept: 0,
      replaced: 1,
      removed: 0,
    });
    const after = await rows(driver);
    assert.equal(after.length, 2);
    assert.deepEqual(after.map((row) => Number(row.sqm)).sort(), [20.1, 20.95]);
    assert.ok(!after.some((row) => row.row_key === colRow));
    assert.ok(
      after.some((row) => row.row_key === "row-3"),
      "a new row key",
    );
    // The place of the lake deleted: its night leaves the set.
    await driver.run(
      "DELETE FROM known_locations WHERE tenant_id = ? AND client_id = ?",
      ["tenant-a", LAC.id],
    );
    assert.deepEqual(await repository.refresh("tenant-a"), {
      kept: 0,
      replaced: 0,
      removed: 1,
    });
    assert.equal((await repository.status("tenant-a")).kept, 1);
  },
);

scenario(
  "switching off keeps what is kept; withdrawing deletes the space's rows and ledger, and only them",
  async (backend) => {
    const { repository } = await open(backend);
    const { driver } = backend;
    for (const tenant of ["tenant-a", "tenant-b"]) {
      await space(driver, tenant);
      await place(driver, tenant, COL);
      await measure(driver, tenant, COL.id, "2026-10-10", 21.04);
      await repository.setConsent({ tenantId: tenant, enabled: true });
    }
    const off = await repository.setConsent({
      tenantId: "tenant-a",
      enabled: false,
    });
    assert.equal(off.enabled, false);
    assert.equal(off.kept, 1);
    // Off: a new night is not kept.
    await measure(driver, "tenant-a", COL.id, "2026-10-11", 20.5);
    assert.equal(await repository.refresh("tenant-a"), null);
    assert.equal((await repository.status("tenant-a")).kept, 1);
    const withdrawn = await repository.withdraw("tenant-a");
    assert.equal(withdrawn.withdrawn, 1);
    assert.deepEqual(withdrawn.consent, {
      enabled: false,
      consentedAt: null,
      kept: 0,
      lastKeptAt: null,
    });
    assert.deepEqual(await ledger(driver, "tenant-a"), []);
    assert.equal((await rows(driver)).length, 1, "the other space's row stays");
    assert.equal((await repository.status("tenant-b")).kept, 1);
  },
);

scenario(
  "without the sky-quality raster nothing is kept, and nothing kept is deleted",
  async (backend) => {
    const { driver } = backend;
    await space(driver, "tenant-a");
    await place(driver, "tenant-a", COL);
    await measure(driver, "tenant-a", COL.id, "2026-10-10", 21.04);
    const { repository } = await open(backend);
    await repository.setConsent({ tenantId: "tenant-a", enabled: true });
    assert.equal((await repository.status("tenant-a")).kept, 1);
    const blind = (await open(backend, { grid: null })).repository;
    await driver.run("DELETE FROM place_sky_measures WHERE tenant_id = ?", [
      "tenant-a",
    ]);
    assert.equal(await blind.refresh("tenant-a"), null);
    assert.equal((await blind.status("tenant-a")).kept, 1);
  },
);
