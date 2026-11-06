import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyMigrations } from "../dist/persistence/migration-runner.js";
import { migrations } from "../dist/persistence/migrations.js";
import {
  REIMPORTED_TABLES,
  TEXTS_SCHEMA,
  textsDatabasePath,
} from "../dist/persistence/reimported-data.js";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";
import {
  dumpedTableCounts,
  pgDumpExclusions,
} from "../dist/persistence/backup/postgres.js";
import { snapshotSqlite } from "../dist/persistence/backup/sqlite.js";

// The catalogue texts are re-imported from the static data, so they stay out
// of the backups. Under SQLite they live in a second file next to the main
// one, attached by the driver; migration 94 drops the copies migration 92
// made in the main file.

async function scratch(t) {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-texts-db-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const tablesOf = (path) => {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
  } finally {
    database.close();
  }
};

const textRow = (targetId, locale = "en") => [
  targetId,
  locale,
  "001",
  "B",
  `rev-${targetId}`,
  JSON.stringify({ story: `A page about ${targetId}.` }),
  "2026-10-21T00:00:00.000Z",
];
const insertText =
  "INSERT INTO target_texts (target_id, locale, shard, tier, revision, content, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)";

test("the texts database is named after the main file, next to it", () => {
  assert.equal(
    textsDatabasePath("/data/db/astro-portal.sqlite"),
    "/data/db/astro-portal.texts.sqlite",
  );
  assert.equal(textsDatabasePath("/srv/portal.db"), "/srv/portal.texts.sqlite");
  assert.equal(textsDatabasePath("/srv/portal"), "/srv/portal.texts.sqlite");
  assert.equal(textsDatabasePath(":memory:"), ":memory:");
  assert.deepEqual(
    [...REIMPORTED_TABLES],
    ["target_texts", "target_text_shards"],
  );
});

test("a migrated SQLite database keeps the texts in the attached file, and a backup of the main file holds none", async (t) => {
  const directory = await scratch(t);
  const path = join(directory, "portal.sqlite");
  const driver = SqliteDriver.open(path);
  try {
    await applyMigrations(driver, "sqlite");
    await driver.run(insertText, textRow("m31"));
    await driver.run(
      "INSERT INTO target_text_shards (locale, shard, revision, targets, imported_at) VALUES ('en', '001', 'r1', 1, '2026-10-21')",
    );
    assert.deepEqual(
      (await driver.query("SELECT target_id FROM target_texts")).rows,
      [{ target_id: "m31" }],
    );
    // `temp` appears once something used SQLite's temporary schema.
    const schemas = (await driver.query("PRAGMA database_list")).rows
      .map((row) => row.name)
      .filter((name) => name !== "temp");
    assert.deepEqual(schemas, ["main", TEXTS_SCHEMA]);
  } finally {
    await driver.close();
  }
  const texts = textsDatabasePath(path);
  assert.ok(existsSync(texts));
  for (const table of REIMPORTED_TABLES) {
    assert.ok(!tablesOf(path).includes(table), `${table} left the main file`);
    assert.ok(tablesOf(texts).includes(table), `${table} is in the texts file`);
  }
  const artifactPath = join(directory, "backup.sqlite");
  await snapshotSqlite({ databasePath: path, artifactPath });
  assert.ok(tablesOf(artifactPath).includes("schema_migrations"));
  for (const table of REIMPORTED_TABLES)
    assert.ok(!tablesOf(artifactPath).includes(table));
});

test("migration 94 drops the texts of the main file; the attached file starts empty and is re-imported", async (t) => {
  const directory = await scratch(t);
  const path = join(directory, "portal.sqlite");
  const driver = SqliteDriver.open(path);
  try {
    // The layout before migration 94: migration 92 made the tables in the main
    // file, where the unqualified names reach first.
    await applyMigrations(
      driver,
      "sqlite",
      migrations.filter(({ version }) => version <= 93),
    );
    await driver.run(insertText, textRow("m42"));
    assert.ok(tablesOf(path).includes("target_texts"));
    await applyMigrations(driver, "sqlite");
    assert.equal(
      Number(
        (await driver.query("SELECT COUNT(*) AS count FROM target_texts"))
          .rows[0].count,
      ),
      0,
    );
    assert.equal(
      Number(
        (await driver.query("SELECT COUNT(*) AS count FROM target_text_shards"))
          .rows[0].count,
      ),
      0,
      "no shard is recorded: the import reads them all again",
    );
    await driver.run(insertText, textRow("m42"));
  } finally {
    await driver.close();
  }
  assert.ok(!tablesOf(path).includes("target_texts"));
  assert.ok(tablesOf(textsDatabasePath(path)).includes("target_texts"));
});

test("a missing texts file is created again, a damaged one is moved aside", async (t) => {
  const directory = await scratch(t);
  const path = join(directory, "portal.sqlite");
  let driver = SqliteDriver.open(path);
  await applyMigrations(driver, "sqlite");
  await driver.run(insertText, textRow("ngc7000"));
  await driver.close();

  await rm(textsDatabasePath(path));
  driver = SqliteDriver.open(path);
  try {
    assert.deepEqual(
      (await driver.query("SELECT COUNT(*) AS count FROM target_texts")).rows,
      [{ count: 0 }],
    );
    await driver.run(insertText, textRow("ngc7000"));
  } finally {
    await driver.close();
  }

  await writeFile(textsDatabasePath(path), "not a database at all".repeat(64));
  const warnings = [];
  const warn = console.warn;
  console.warn = (line) => warnings.push(String(line));
  try {
    driver = SqliteDriver.open(path);
  } finally {
    console.warn = warn;
  }
  try {
    assert.deepEqual(
      (await driver.query("SELECT COUNT(*) AS count FROM target_texts")).rows,
      [{ count: 0 }],
    );
    assert.equal(
      (await driver.query("SELECT COUNT(*) AS count FROM schema_migrations"))
        .rows[0].count,
      migrations.length,
      "the main file is untouched",
    );
  } finally {
    await driver.close();
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /moved aside/);
  assert.ok(
    (await readdir(directory)).some((name) =>
      name.startsWith("portal.texts.sqlite.unreadable-"),
    ),
  );
});

test("a PostgreSQL dump leaves out the rows of the re-imported tables, not their definition", () => {
  assert.equal(
    pgDumpExclusions(),
    "--exclude-table-data=public.target_texts --exclude-table-data=public.target_text_shards",
  );
  assert.deepEqual(
    dumpedTableCounts({
      plans: 3,
      target_texts: 164_800,
      target_text_shards: 320,
    }),
    { plans: 3, target_texts: 0, target_text_shards: 0 },
  );
  assert.deepEqual(dumpedTableCounts({ plans: 3 }), { plans: 3 });
});
