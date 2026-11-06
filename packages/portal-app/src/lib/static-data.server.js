import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { staticDataDir } from "./config.server.js";
import {
  defaultStaticDataDocuments,
  validateStaticDataPayload,
} from "./static-data-defaults.js";
import {
  createDatabaseDriver,
  databaseDriver,
} from "portal/persistence/database.js";
import { applyMigrations } from "portal/persistence/migration-runner.js";

const now = () => new Date().toISOString();
const documentDirectory = (directory = staticDataDir) =>
  join(directory, "documents");
const manifestPath = (directory = staticDataDir) =>
  join(directory, "manifest.json");
const maximumDocumentBytes = 5_000_000;

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function stableJson(value) {
  return JSON.stringify(value);
}

function revisionFor(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function key(value) {
  const result = String(value || "").trim();
  if (!/^[a-z][a-z0-9-]{1,99}$/.test(result))
    throw new Error("Invalid static data key.");
  return result;
}

function title(value) {
  const result = String(value || "")
    .trim()
    .slice(0, 200);
  if (!result) throw new Error("Static data title is required.");
  return result;
}

function payload(value) {
  if (value === null || value === undefined)
    throw new Error("Static data payload is required.");
  const serialized = stableJson(value);
  if (Buffer.byteLength(serialized) > maximumDocumentBytes)
    throw new Error("Static data document is too large.");
  return { value, serialized };
}

function documentFromRow(row) {
  if (!row) return null;
  return {
    key: row.data_key,
    title: row.title,
    schemaVersion: row.schema_version,
    payload: parseJson(row.payload_json, {}),
    sourcePayload: parseJson(row.source_payload_json, {}),
    sourceRevision: row.source_revision,
    isCustomized: row.payload_json !== row.source_payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exportedAt: row.exported_at || null,
  };
}

async function fileSeed(defaultDocument, directory = staticDataDir) {
  const path = join(
    documentDirectory(directory),
    `${defaultDocument.key}.json`,
  );
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (
      parsed?.key !== defaultDocument.key ||
      !Object.hasOwn(parsed || {}, "payload")
    )
      throw new Error("invalid static data document");
    return {
      key: defaultDocument.key,
      title: title(parsed.title || defaultDocument.title),
      schemaVersion:
        Number(parsed.schemaVersion) || defaultDocument.schemaVersion,
      payload: parsed.payload,
    };
  } catch {
    return defaultDocument;
  }
}

async function writeAtomically(path, content) {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function modifiedAt(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Creates the repository for editable instance data.
 *
 * This is deliberately asynchronous even on SQLite: repository code must not
 * know which persistence backend is active, and PostgreSQL transactions stay
 * off the request's synchronous call stack.
 */
export async function createStaticDataRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = databaseUrl ? "postgres" : "sqlite",
  directory = staticDataDir,
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  let seededPackageModifiedAt = null;
  let seedPromise = null;

  const listDocuments = async () => {
    const result = await db.query(
      "SELECT * FROM static_data_documents ORDER BY lower(data_key)",
    );
    return result.rows.map(documentFromRow);
  };

  const seedDefaults = async () => {
    const defaults = defaultStaticDataDocuments();
    const packageModifiedAt = await modifiedAt(manifestPath(directory));
    const count = (
      await db.query("SELECT COUNT(*) AS count FROM static_data_documents")
    ).rows[0].count;
    if (
      seededPackageModifiedAt === packageModifiedAt &&
      count >= defaults.length
    )
      return;
    const seeds = await Promise.all(
      defaults.map((item) => fileSeed(item, directory)),
    );
    const timestamp = now();
    await db.transaction(async (transaction) => {
      for (const seed of seeds) {
        const dataKey = key(seed.key);
        validateStaticDataPayload(dataKey, seed.payload);
        const source = payload(seed.payload);
        const sourceRevision = revisionFor(seed.payload);
        const row = (
          await transaction.query(
            "SELECT * FROM static_data_documents WHERE data_key = ?",
            [dataKey],
          )
        ).rows[0];
        if (!row) {
          await transaction.run(
            `INSERT INTO static_data_documents (
              data_key, title, schema_version, source_payload_json, payload_json,
              source_revision, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              dataKey,
              title(seed.title),
              Number(seed.schemaVersion) || 1,
              source.serialized,
              source.serialized,
              sourceRevision,
              timestamp,
              timestamp,
            ],
          );
          continue;
        }
        if (row.source_revision === sourceRevision) continue;
        const untouched = row.payload_json === row.source_payload_json;
        await transaction.run(
          `UPDATE static_data_documents SET
            title = ?, schema_version = ?, source_payload_json = ?,
            payload_json = CASE WHEN ? THEN ? ELSE payload_json END,
            source_revision = ?, updated_at = ?
           WHERE data_key = ?`,
          [
            title(seed.title),
            Number(seed.schemaVersion) || 1,
            source.serialized,
            untouched ? 1 : 0,
            source.serialized,
            sourceRevision,
            timestamp,
            dataKey,
          ],
        );
      }
    });
    seededPackageModifiedAt = packageModifiedAt;
  };

  // One seeding at a time, shared by every concurrent caller.
  const ensureSeeded = async () => {
    if (seedPromise) return await seedPromise;
    const pending = seedDefaults();
    seedPromise = pending;
    try {
      return await pending;
    } finally {
      if (seedPromise === pending) seedPromise = null;
    }
  };

  return {
    async close() {
      if (ownsDriver) await db.close();
    },
    async list() {
      return await listDocuments();
    },
    async get(dataKey) {
      const result = await db.query(
        "SELECT * FROM static_data_documents WHERE data_key = ?",
        [key(dataKey)],
      );
      return documentFromRow(result.rows[0]);
    },
    async seed() {
      await ensureSeeded();
      return await listDocuments();
    },
    /** `seed()` without reading every document back: what a reader of one
     * document needs. Every catalogue page asks for three documents, and
     * used to parse all of them (payload and source payload) for each. */
    async ensureSeeded() {
      await ensureSeeded();
    },
    async revisionStamp() {
      const row = (
        await db.query(
          "SELECT COUNT(*) AS count, MAX(updated_at) AS updated FROM static_data_documents",
        )
      ).rows[0];
      return `${Number(row?.count || 0)}:${row?.updated || ""}`;
    },
    async save({ dataKey, nextTitle, schemaVersion, nextPayload }) {
      const existing = await this.get(dataKey);
      if (!existing) throw new Error("Static data document was not found.");
      validateStaticDataPayload(existing.key, nextPayload);
      const next = payload(nextPayload);
      await db.run(
        `UPDATE static_data_documents SET
          title = ?, schema_version = ?, payload_json = ?, updated_at = ?
         WHERE data_key = ?`,
        [
          title(nextTitle || existing.title),
          Number(schemaVersion) || existing.schemaVersion,
          next.serialized,
          now(),
          existing.key,
        ],
      );
      return await this.get(existing.key);
    },
    async export({ additionalDocuments = [] } = {}) {
      const documents = await this.list();
      const exportedAt = now();
      await mkdir(documentDirectory(directory), { recursive: true });
      const manifest = {
        schemaVersion: 1,
        exportedAt,
        documents: [
          ...documents.map((item) => ({
            key: item.key,
            title: item.title,
            schemaVersion: item.schemaVersion,
            revision: revisionFor(item.payload),
            path: `documents/${item.key}.json`,
          })),
          ...additionalDocuments,
        ],
      };
      for (const item of documents) {
        await writeAtomically(
          join(documentDirectory(directory), `${item.key}.json`),
          `${JSON.stringify(
            {
              key: item.key,
              title: item.title,
              schemaVersion: item.schemaVersion,
              exportedAt,
              payload: item.payload,
            },
            null,
            2,
          )}\n`,
        );
      }
      await writeAtomically(
        manifestPath(directory),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      const packageRevision = revisionFor(manifest);
      const timestamp = now();
      await db.transaction(async (transaction) => {
        const update = `UPDATE static_data_documents SET
          source_payload_json = payload_json,
          source_revision = ?, exported_at = ?, updated_at = ?
         WHERE data_key = ?`;
        for (const item of documents)
          await transaction.run(update, [
            revisionFor(item.payload),
            timestamp,
            timestamp,
            item.key,
          ]);
        await transaction.run(
          `INSERT INTO static_data_exports (
            id, package_revision, manifest_json, exported_at
          ) VALUES (?, ?, ?, ?)`,
          [randomUUID(), packageRevision, stableJson(manifest), timestamp],
        );
      });
      return { manifest, packageRevision, directory };
    },
  };
}

let sharedRepository = null;
let sharedConfigurationKey = null;
let sharedRepositoryPromise = null;
let sharedRepositoryPromiseKey = null;

export async function staticDataRepository(
  databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH,
) {
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const configurationKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedRepository) {
    if (sharedConfigurationKey !== configurationKey)
      throw new Error(
        "Static data database configuration cannot change during a process.",
      );
    return sharedRepository;
  }
  if (sharedRepositoryPromise) {
    if (sharedRepositoryPromiseKey !== configurationKey)
      throw new Error(
        "Static data database configuration cannot change during a process.",
      );
    return await sharedRepositoryPromise;
  }
  sharedRepositoryPromiseKey = configurationKey;
  const pending = createStaticDataRepository({
    databasePath,
    databaseUrl,
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  }).then((repository) => {
    sharedRepository = repository;
    sharedConfigurationKey = configurationKey;
    return repository;
  });
  sharedRepositoryPromise = pending;
  try {
    return await pending;
  } finally {
    if (sharedRepositoryPromise === pending) {
      sharedRepositoryPromise = null;
      sharedRepositoryPromiseKey = null;
    }
  }
}

export async function staticDataDocument(dataKey) {
  const repository = await staticDataRepository();
  if (!repository) return null;
  await repository.ensureSeeded();
  return await repository.get(dataKey);
}

/**
 * A cheap stamp that changes whenever any static-data document does (an
 * edit in administration, a new package seeded, new built-in defaults): two
 * aggregate columns of one small table. `null` without a database, where
 * the documents are the application's own defaults.
 */
export async function staticDataRevisionStamp() {
  const repository = await staticDataRepository();
  if (!repository) return null;
  await repository.ensureSeeded();
  return await repository.revisionStamp();
}

export async function staticDataPackageModifiedAt() {
  try {
    return (await stat(manifestPath())).mtimeMs;
  } catch {
    return 0;
  }
}
