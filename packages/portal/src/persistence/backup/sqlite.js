// SQLite side of the backup module: snapshots through SQLite's own backup
// API (never a file copy of an open database), and inspections run on a
// worker thread so that an integrity check or a row count of a large
// database never blocks the event loop of a running service.
import { Worker } from "node:worker_threads";
import { backup, DatabaseSync } from "node:sqlite";
import { restrictToOwner } from "./files.js";

/** The largest step node:sqlite accepts: more pages than any database here. */
const everyPageAtOnce = 2_147_483_647;

/**
 * Copies the database at `databasePath` into a new file `artifactPath`.
 *
 * `rate: everyPageAtOnce` copies every page in a single step (a step of
 * more pages than the database holds copies what remains). A negative rate
 * means the same to SQLite, but node:sqlite refuses it from Node 24.21 on
 * (« options.rate must be a positive integer »), while 24.13 accepted it:
 * the image and CI run the newer one. node:sqlite runs each step
 * on the thread pool, so the event loop stays free; a single step also
 * means a write from another connection cannot restart the copy (SQLite
 * restarts a multi-step backup whenever the source changes), so a busy
 * service cannot keep a backup from finishing. Writers wait for that one
 * step (persistence/sqlite-driver.ts retries on SQLITE_BUSY on timers).
 *
 * `readOnly: false` lets the connection roll back a hot journal left by a
 * process that was stopped mid-transaction (a read-only connection cannot,
 * and would fail); the service uses it, the 12.1 scripts keep reading only.
 */
export async function snapshotSqlite({
  databasePath,
  artifactPath,
  readOnly = true,
}) {
  const source = new DatabaseSync(databasePath, { readOnly });
  try {
    await backup(source, artifactPath, { rate: everyPageAtOnce });
  } finally {
    source.close();
  }
  await restrictToOwner(artifactPath);
}

/**
 * Writes the database at `sourcePath` over `targetPath` through the backup
 * API: SQLite takes the target's write lock, rolls back a hot journal the
 * target may have, and replaces its pages in one transaction, so an
 * interruption leaves the target as it was.
 */
export async function restoreSqliteInto({ sourcePath, targetPath }) {
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(source, targetPath, { rate: everyPageAtOnce });
  } finally {
    source.close();
  }
}

// Evaluated source (`eval: true`): no file to resolve, which keeps this
// module usable from the Next.js bundle as well as from Node. The worker
// inherits the process's flags, so it may be read as CommonJS or as an ES
// module (`--input-type=module`): `process.getBuiltinModule` works in both.
// The main process already printed node:sqlite's experimental warning once;
// each worker would print it again, twice per backup in the service's log.
const inspectionWorkerSource = `
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const text = typeof warning === "string" ? warning : warning && warning.message;
  if (/SQLite is an experimental feature/.test(String(text))) return;
  return emitWarning.call(this, warning, ...rest);
};
const { parentPort, workerData } = process.getBuiltinModule("node:worker_threads");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
let database = null;
try {
  database = new DatabaseSync(workerData.path, { readOnly: true });
  let integrity = null;
  if (workerData.integrity !== "none") {
    const pragma =
      workerData.integrity === "full" ? "PRAGMA integrity_check" : "PRAGMA quick_check";
    const messages = database
      .prepare(pragma)
      .all()
      .map((row) => String(Object.values(row)[0]));
    integrity =
      messages.length === 1 && messages[0] === "ok"
        ? "ok"
        : messages.slice(0, 10).join("; ");
  }
  const tables = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name);
  const tableCounts = {};
  for (const table of tables)
    tableCounts[table] = Number(
      database
        .prepare('SELECT COUNT(*) AS count FROM "' + table.replaceAll('"', '""') + '"')
        .get().count,
    );
  let schemaVersion = null;
  let appliedVersions = [];
  if (tables.includes("schema_migrations")) {
    appliedVersions = database
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => Number(row.version));
    schemaVersion = appliedVersions.length
      ? appliedVersions[appliedVersions.length - 1]
      : null;
  }
  parentPort.postMessage({ ok: true, integrity, tableCounts, schemaVersion, appliedVersions });
} catch (error) {
  parentPort.postMessage({ ok: false, message: String(error && error.message || error) });
} finally {
  if (database) database.close();
}
`;

/**
 * Reads a database file on a worker thread: the integrity check
 * (`"none"`, `"quick"` or `"full"`), the row count of every table and the
 * schema version recorded in `schema_migrations`.
 *
 * A file that SQLite cannot read at all is reported as an integrity failure
 * (`{ integrity: "<SQLite's message>" }`), never thrown.
 */
export function inspectSqlite(path, { integrity = "none" } = {}) {
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(inspectionWorkerSource, {
      eval: true,
      workerData: { path, integrity },
    });
    let settled = false;
    worker.once("message", (message) => {
      settled = true;
      if (message.ok)
        resolvePromise({
          integrity: message.integrity,
          tableCounts: message.tableCounts,
          schemaVersion: message.schemaVersion,
          appliedVersions: message.appliedVersions,
        });
      else
        resolvePromise({
          integrity: `unreadable database: ${message.message}`,
          tableCounts: null,
          schemaVersion: null,
          appliedVersions: [],
        });
    });
    worker.once("error", (error) => {
      if (!settled) reject(error);
    });
    worker.once("exit", (code) => {
      if (!settled)
        reject(new Error(`SQLite inspection worker exited with code ${code}`));
    });
  });
}

/** SQLITE_READONLY_ROLLBACK: a read-only connection met a hot journal. */
const READONLY_ROLLBACK = 776;

function recordedVersions(database) {
  const table = database
    .prepare(
      "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get();
  if (!table) return [];
  return database
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all()
    .map((row) => Number(row.version));
}

/**
 * The migrations recorded in a live database, read on the main thread
 * before the service starts (nothing else runs yet, and the process holds
 * the SQLite lease: persistence/sqlite-lease.js).
 *
 * Read-only: the startup check that refuses a database migrated by a newer
 * version (startup.js) must write nothing. The one exception is a hot
 * journal, left by a process stopped in the middle of a transaction: SQLite
 * cannot read the database before rolling it back (a read-only connection
 * fails with SQLITE_READONLY_ROLLBACK), so the database is then opened
 * read-write, which rolls the unfinished transaction back — the state it
 * restores is the last one committed, and nothing of this code is recorded.
 */
export function appliedMigrationVersions(databasePath) {
  let database;
  try {
    database = new DatabaseSync(databasePath, { readOnly: true });
    return recordedVersions(database);
  } catch (error) {
    if (error?.errcode !== READONLY_ROLLBACK) throw error;
  } finally {
    database?.close();
    database = undefined;
  }
  database = new DatabaseSync(databasePath);
  try {
    return recordedVersions(database);
  } finally {
    database.close();
  }
}

export function compareTableCounts(expected, actual) {
  const failures = [];
  const expectedTables = Object.keys(expected || {}).sort();
  const actualTables = Object.keys(actual || {}).sort();
  const missing = expectedTables.filter(
    (table) => !actualTables.includes(table),
  );
  const unexpected = actualTables.filter(
    (table) => !expectedTables.includes(table),
  );
  for (const table of missing) failures.push(`missing table: ${table}`);
  for (const table of unexpected) failures.push(`unexpected table: ${table}`);
  for (const table of expectedTables) {
    if (missing.includes(table)) continue;
    if (Number(expected[table]) !== Number(actual[table]))
      failures.push(
        `row count mismatch for ${table}: expected ${expected[table]}, got ${actual[table]}`,
      );
  }
  return failures;
}
