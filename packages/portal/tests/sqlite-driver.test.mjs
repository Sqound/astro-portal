import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteDriver } from "../dist/persistence/sqlite-driver.js";

// A service backup (persistence/backup/) reads the database through its own
// connection, on the thread pool, while the service keeps writing through
// its driver. While a backup step holds its read lock, a write cannot
// commit: the driver must wait for it asynchronously, never fail the request
// with "database is locked" at once, and never block the event loop.
test("SQLite driver waits for a lock held by another connection, without blocking the event loop", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-sqlite-lock-"));
  const path = join(directory, "portal.sqlite");
  const driver = SqliteDriver.open(path);
  const reader = new DatabaseSync(path);
  const timers = new Set();
  const holdReadLock = (milliseconds) => {
    reader.exec("BEGIN");
    reader.prepare("SELECT COUNT(*) AS count FROM entries").get();
    const timer = setTimeout(() => {
      timers.delete(timer);
      reader.exec("COMMIT");
    }, milliseconds);
    timers.add(timer);
  };
  let ticker = null;
  try {
    await driver.run("CREATE TABLE entries (id TEXT PRIMARY KEY)");

    let turns = 0;
    ticker = setInterval(() => {
      turns += 1;
    }, 5);
    holdReadLock(150);
    await driver.run("INSERT INTO entries (id) VALUES (?)", ["single"]);
    holdReadLock(150);
    await driver.transaction(async (transaction) => {
      await transaction.run("INSERT INTO entries (id) VALUES (?)", ["inside"]);
    });
    clearInterval(ticker);
    assert.ok(
      turns >= 20,
      `the event loop turned only ${turns} times while the driver waited`,
    );
    assert.deepEqual(
      (await driver.query("SELECT id FROM entries ORDER BY id")).rows,
      [{ id: "inside" }, { id: "single" }],
    );

    // Past its budget, the driver reports the lock instead of waiting forever.
    const impatient = SqliteDriver.open(path, { lockWaitMs: 50 });
    try {
      holdReadLock(400);
      await assert.rejects(
        impatient.run("INSERT INTO entries (id) VALUES (?)", ["late"]),
        /database is locked/,
      );
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 450));
    } finally {
      await impatient.close();
    }
    assert.equal(
      (await driver.query("SELECT id FROM entries WHERE id = ?", ["late"]))
        .rowCount,
      0,
    );
  } finally {
    clearInterval(ticker);
    for (const timer of timers) clearTimeout(timer);
    if (reader.isTransaction) reader.exec("ROLLBACK");
    reader.close();
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("SQLite driver keeps portable bindings and rolls back failed transactions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-portal-sqlite-"));
  const driver = SqliteDriver.open(join(directory, "portal.sqlite"));
  try {
    await driver.run("CREATE TABLE entries (id TEXT PRIMARY KEY, value TEXT)");
    await driver.run(
      "CREATE TABLE child_entries (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES entries(id))",
    );
    await driver.run("INSERT INTO entries (id, value) VALUES (?, ?)", [
      "one",
      "first",
    ]);
    const result = await driver.query(
      "SELECT value FROM entries WHERE id = ?",
      ["one"],
    );
    assert.deepEqual(result, { rows: [{ value: "first" }], rowCount: 1 });
    await assert.rejects(
      driver.run("INSERT INTO child_entries (id, parent_id) VALUES (?, ?)", [
        "orphan",
        "missing",
      ]),
      /foreign key/i,
    );

    await assert.rejects(
      driver.transaction(async (transaction) => {
        await transaction.run("INSERT INTO entries (id, value) VALUES (?, ?)", [
          "two",
          "second",
        ]);
        throw new Error("abort");
      }),
      /abort/,
    );
    assert.equal(
      (await driver.query("SELECT id FROM entries WHERE id = ?", ["two"]))
        .rowCount,
      0,
    );
  } finally {
    await driver.close();
    await rm(directory, { force: true, recursive: true });
  }
});
