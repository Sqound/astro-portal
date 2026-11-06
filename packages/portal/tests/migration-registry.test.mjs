import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach } from "node:test";
import {
  composedMigrations,
  registerMigrations,
  registeredMigrationSources,
  unregisterMigrations,
} from "../dist/persistence/migration-registry.js";
import {
  DatabaseAheadOfCodeError,
  applyMigrations,
  unknownMigrationVersions,
} from "../dist/persistence/migration-runner.js";
import { migrations, statementsFor } from "../dist/persistence/migrations.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

const lastCoreVersion = migrations.at(-1).version;
const newVersion = lastCoreVersion + 100;

afterEach(() => {
  for (const source of registeredMigrationSources())
    unregisterMigrations(source);
});

async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), "migration-registry-"));
  const driver = SqliteDriver.open(join(directory, "registry.sqlite"));
  try {
    return await run(driver);
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
}

const whole = (version, table = `registry_probe_${version}`) => ({
  version,
  name: `registry-probe-${version}`,
  statements: { common: `CREATE TABLE ${table} (id TEXT PRIMARY KEY)` },
});

async function columnsOf(driver, table) {
  return (await driver.query(`PRAGMA table_info(${table})`)).rows.map(
    (row) => row.name,
  );
}

/** Every table's definition and row count: what a version leaves behind. */
async function fingerprintOf(driver) {
  const tables = (
    await driver.query(
      "SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
    )
  ).rows;
  const counts = {};
  for (const { name, sql } of tables)
    if (/^CREATE TABLE/i.test(sql))
      counts[name] = Number(
        (await driver.query(`SELECT COUNT(*) AS count FROM "${name}"`)).rows[0]
          .count,
      );
  delete counts.schema_migrations;
  return { definitions: tables.map(({ name, sql }) => [name, sql]), counts };
}

test("nothing registered: the composed chain is the core's own list", () => {
  assert.equal(composedMigrations(), migrations);
});

test("a whole migration is composed in version order, the core's untouched", () => {
  registerMigrations("probe", [whole(newVersion + 1), whole(newVersion)]);
  const composed = composedMigrations();
  assert.equal(composed.length, migrations.length + 2);
  assert.deepEqual(
    composed.map((migration) => migration.version),
    [
      ...migrations.map((migration) => migration.version),
      newVersion,
      newVersion + 1,
    ],
  );
  for (const migration of migrations)
    assert.equal(
      composed.find((entry) => entry.version === migration.version),
      migration,
    );
});

test("a registered version can sit between two versions of the core", () => {
  const gap = [36, 38, 39, 40, 42, 43, 44].find((version) =>
    migrations.every((migration) => migration.version !== version),
  );
  assert.ok(gap, "the core has a gap in its numbering");
  registerMigrations("probe", [whole(gap)]);
  const versions = composedMigrations().map((migration) => migration.version);
  assert.deepEqual(
    versions,
    [...versions].sort((left, right) => left - right),
  );
  assert.ok(versions.includes(gap));
});

test("a version the core has is refused, and nothing is kept", () => {
  assert.throws(
    () => registerMigrations("probe", [whole(newVersion), whole(1)]),
    /registers version 1, which the core already has/,
  );
  assert.equal(composedMigrations(), migrations);
  assert.deepEqual(registeredMigrationSources(), []);
});

test("a version registered twice, in one list or by two sources, is refused", () => {
  assert.throws(
    () => registerMigrations("probe", [whole(newVersion), whole(newVersion)]),
    /registers version \d+ twice/,
  );
  registerMigrations("first", [whole(newVersion)]);
  assert.throws(
    () => registerMigrations("second", [whole(newVersion, "other_probe")]),
    /registered by "second" and by "first"/,
  );
  assert.deepEqual(registeredMigrationSources(), ["first"]);
  assert.equal(composedMigrations().length, migrations.length + 1);
});

test("registering a source again replaces what it registered", () => {
  registerMigrations("probe", [whole(newVersion)]);
  registerMigrations("probe", [whole(newVersion)]);
  assert.equal(composedMigrations().length, migrations.length + 1);
  registerMigrations("probe", [whole(newVersion + 5)]);
  assert.deepEqual(
    composedMigrations()
      .slice(-1)
      .map((migration) => migration.version),
    [newVersion + 5],
  );
});

test("a failed re-registration keeps the previous registration of the source", () => {
  registerMigrations("probe", [whole(newVersion)]);
  assert.throws(() => registerMigrations("probe", [whole(1)]));
  assert.deepEqual(
    composedMigrations()
      .slice(-1)
      .map((migration) => migration.version),
    [newVersion],
  );
});

test("a malformed entry is refused", () => {
  assert.throws(
    () => registerMigrations("", [whole(newVersion)]),
    /needs a name/,
  );
  assert.throws(
    () => registerMigrations("probe", [{ ...whole(newVersion), version: 0 }]),
    /positive integer/,
  );
  assert.throws(
    () => registerMigrations("probe", [{ ...whole(newVersion), version: 1.5 }]),
    /positive integer/,
  );
  assert.throws(
    () => registerMigrations("probe", [{ ...whole(newVersion), name: " " }]),
    /has no name/,
  );
  assert.throws(
    () =>
      registerMigrations("probe", [
        { ...whole(newVersion), statements: { common: "  " } },
      ]),
    /has no statement/,
  );
  assert.throws(
    () =>
      registerMigrations("probe", [
        { complements: lastCoreVersion, statements: {} },
      ]),
    /has no statement/,
  );
  assert.deepEqual(registeredMigrationSources(), []);
});

test("a complement joins the core's version: same number, same name, its statements after", () => {
  const target = migrations.at(-1);
  registerMigrations("probe", [
    {
      complements: target.version,
      statements: {
        sqlite: "ALTER TABLE capture_variants ADD COLUMN sqlite_extra TEXT",
        postgres: "ALTER TABLE capture_variants ADD COLUMN postgres_extra TEXT",
      },
    },
  ]);
  const composed = composedMigrations();
  assert.equal(composed.length, migrations.length);
  const joined = composed.find((entry) => entry.version === target.version);
  assert.equal(joined.name, target.name);
  for (const dialect of ["sqlite", "postgres"]) {
    const sql = statementsFor(joined, dialect).join(";");
    assert.equal(statementsFor(joined, dialect).length, 1);
    assert.ok(
      sql.indexOf("processing_json") < sql.indexOf(`${dialect}_extra`),
      `${dialect}: the core's statements come first`,
    );
  }
  // The other versions are the core's own objects.
  for (const migration of migrations.slice(0, -1))
    assert.equal(
      composed.find((entry) => entry.version === migration.version),
      migration,
    );
});

test("a complement keeps the rebuild flag of the core's version, or adds its own", () => {
  const rebuilt = migrations.find(
    (migration) => migration.sqliteRebuildsReferencedTable,
  );
  assert.ok(rebuilt);
  registerMigrations("probe", [
    { complements: rebuilt.version, statements: { common: "SELECT 1" } },
    {
      complements: migrations.at(-1).version,
      statements: { common: "SELECT 1" },
      sqliteRebuildsReferencedTable: true,
    },
  ]);
  const composed = composedMigrations();
  assert.equal(
    composed.find((entry) => entry.version === rebuilt.version)
      .sqliteRebuildsReferencedTable,
    true,
  );
  assert.equal(composed.at(-1).sqliteRebuildsReferencedTable, true);
});

test("a complement of a version the core does not have, or registered whole, is refused", () => {
  assert.throws(
    () =>
      registerMigrations("probe", [
        { complements: newVersion, statements: { common: "SELECT 1" } },
      ]),
    /not a version of the core/,
  );
  assert.throws(
    () =>
      registerMigrations("probe", [
        whole(newVersion),
        { complements: newVersion, statements: { common: "SELECT 1" } },
      ]),
    /not a version of the core/,
  );
  assert.deepEqual(registeredMigrationSources(), []);
});

test("one version is complemented once", () => {
  const complement = {
    complements: lastCoreVersion,
    statements: { common: "SELECT 1" },
  };
  assert.throws(
    () => registerMigrations("probe", [complement, complement]),
    /complements version \d+ twice/,
  );
  registerMigrations("first", [complement]);
  assert.throws(
    () => registerMigrations("second", [complement]),
    /complemented by "second" and by "first"/,
  );
});

test("the runner applies the composed chain by default, a complement in the core's transaction", async () => {
  registerMigrations("probe", [
    whole(newVersion),
    {
      complements: lastCoreVersion,
      statements: {
        common: "ALTER TABLE capture_variants ADD COLUMN complement_extra TEXT",
      },
    },
  ]);
  await withDatabase(async (driver) => {
    await applyMigrations(driver, "sqlite");
    assert.ok(
      (await columnsOf(driver, "capture_variants")).includes("processing_json"),
    );
    assert.ok(
      (await columnsOf(driver, "capture_variants")).includes(
        "complement_extra",
      ),
    );
    assert.deepEqual(await columnsOf(driver, `registry_probe_${newVersion}`), [
      "id",
    ]);
    const recorded = (
      await driver.query(
        "SELECT version, name FROM schema_migrations ORDER BY version",
      )
    ).rows.map((row) => ({ version: Number(row.version), name: row.name }));
    assert.deepEqual(
      recorded,
      composedMigrations().map(({ version, name }) => ({ version, name })),
    );
    // Applied again, nothing changes.
    await applyMigrations(driver, "sqlite");
    const again = await driver.query(
      "SELECT COUNT(*) AS count FROM schema_migrations",
    );
    assert.equal(Number(again.rows[0].count), composedMigrations().length);
  });
});

test("a failing complement rolls back the core's part of its version", async () => {
  registerMigrations("probe", [
    {
      complements: lastCoreVersion,
      statements: {
        common: "ALTER TABLE no_such_table ADD COLUMN broken TEXT",
      },
    },
  ]);
  await withDatabase(async (driver) => {
    await assert.rejects(
      () => applyMigrations(driver, "sqlite"),
      /no_such_table/,
    );
    // Whatever the last core version does (a column, a table, seed rows), none
    // of it is left: the database is as the version before it leaves it.
    const before = await withDatabase(async (reference) => {
      await applyMigrations(reference, "sqlite", migrations.slice(0, -1));
      return fingerprintOf(reference);
    });
    assert.deepEqual(await fingerprintOf(driver), before);
    const recorded = (
      await driver.query("SELECT MAX(version) AS last FROM schema_migrations")
    ).rows[0].last;
    assert.ok(Number(recorded) < lastCoreVersion);
  });
});

test("a definitions list passed to the runner is used as it is", async () => {
  registerMigrations("probe", [whole(newVersion)]);
  await withDatabase(async (driver) => {
    await applyMigrations(driver, "sqlite", migrations.slice(0, 3));
    const tables = (
      await driver.query("SELECT name FROM sqlite_master WHERE name = ?", [
        `registry_probe_${newVersion}`,
      ])
    ).rows;
    assert.deepEqual(tables, []);
  });
});

test("a database that recorded a registered version is refused without the registration", async () => {
  registerMigrations("probe", [whole(newVersion)]);
  await withDatabase(async (driver) => {
    await applyMigrations(driver, "sqlite");
    unregisterMigrations("probe");
    await assert.rejects(
      () => applyMigrations(driver, "sqlite"),
      (error) => {
        assert.ok(error instanceof DatabaseAheadOfCodeError);
        assert.equal(error.code, "database_ahead_of_code");
        assert.deepEqual(error.unknownVersions, [newVersion]);
        return true;
      },
    );
    registerMigrations("probe", [whole(newVersion)]);
    await applyMigrations(driver, "sqlite");
  });
});

test("the versions a code knows include the registered ones", () => {
  assert.deepEqual(unknownMigrationVersions([1, newVersion]), [newVersion]);
  registerMigrations("probe", [whole(newVersion)]);
  assert.deepEqual(unknownMigrationVersions([1, newVersion]), []);
});

test("the registry is shared by the copies of the module", async () => {
  const copy =
    await import("../dist/persistence/migration-registry.js?second-copy");
  assert.notEqual(copy.registerMigrations, registerMigrations);
  copy.registerMigrations("probe", [whole(newVersion)]);
  assert.equal(composedMigrations().length, migrations.length + 1);
  assert.deepEqual(registeredMigrationSources(), ["probe"]);
});
