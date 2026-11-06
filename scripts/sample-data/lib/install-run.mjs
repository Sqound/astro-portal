// The installation of the sample into a portal that has an owner and no data
// yet: find the space of that owner (the sample has no account and no space of
// its own, and creates no `users` row: a row like that would close the
// bootstrap of a portal that is not set up), check the records, get the image
// pack (a local archive, or the one the manifest names — after showing what it
// is and asking), check its SHA-256 before anything is extracted, extract with
// the strict reader, then write the records in one transaction, in the space
// of the owner. All or nothing: any failure leaves no record and no image.
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { Readable } from "node:stream";
import { createDatabaseDriver } from "portal/persistence/database.js";
import { applyMigrations } from "portal/persistence/migration-runner.js";
import { capturesDirectory } from "portal/uploads/capture-storage.js";
import {
  DEFAULT_MANIFEST_URL,
  JSON_COLUMNS,
  RECORD_FILES,
  RECORD_TABLES,
  TABLE_COLUMNS,
  recordCountSql,
} from "./constants.mjs";
import { repositoryRoot } from "./export-run.mjs";
import { OWNER_PLACEHOLDER, TENANT_PLACEHOLDER } from "./ids.mjs";
import { PACK_FORMAT, sha256Of, sha256OfFile } from "./manifest.mjs";
import { stableStringify } from "./scrub.mjs";
import { isPostgresUrl, openSource } from "./source.mjs";
import { readTarGz } from "./tar.mjs";
import { verifyDataset, verifyReport } from "./verify-run.mjs";

export class InstallError extends Error {
  constructor(message) {
    super(message);
    this.name = "InstallError";
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function assertFetchable(url, label) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new InstallError(`${label} is not a URL: ${url}`);
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && LOOPBACK.has(parsed.hostname))
  )
    throw new InstallError(
      `${label} must be an https address (plain http is only accepted for this machine).`,
    );
  return parsed;
}

const megabytes = (bytes) => `${(bytes / 1_000_000).toFixed(1)} MB`;

async function defaultConfirm(question) {
  if (!process.stdin.isTTY)
    throw new InstallError(
      "This needs your confirmation and there is no terminal to ask on: pass --yes to go ahead.",
    );
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return /^y(?:es)?$/i.test(
      (await readline.question(`${question} [y/N] `)).trim(),
    );
  } finally {
    readline.close();
  }
}

/** The tables of the target that hold data (looked at without writing anything). */
async function tablesWithData(source) {
  const occupied = [];
  for (const table of RECORD_TABLES) {
    if (table === "target_media") continue;
    if (!(await source.has(table))) continue;
    const [row] = await source.query(recordCountSql(table));
    if (Number(row.count) > 0) occupied.push(table);
  }
  return occupied;
}

const OWNERS_SQL = `SELECT memberships.tenant_id AS tenant_id, memberships.user_id AS user_id
   FROM memberships JOIN users ON users.id = memberships.user_id
   WHERE memberships.role = 'owner' AND users.disabled_at IS NULL
   ORDER BY memberships.created_at, memberships.id`;

const NOT_SET_UP = (database) =>
  `This portal is not set up yet: ${isPostgresUrl(database) ? "its database" : database} has no owner. ` +
  "The sample goes into the space of the owner of the portal, and it creates no account of its own " +
  "(that would prevent you from setting the portal up afterwards). " +
  "Set the portal up first (create the owner's account: open the portal and sign in for the first time), " +
  "then run this command again. Nothing was installed.";

/**
 * The space of the owner of the portal, from the rows `rows` of the owners
 * (an active user with the `owner` membership). The sample only goes into a
 * portal of one person: no owner, or the owners of several spaces, is refused.
 */
function ownerSpaceOf(rows, database) {
  if (!rows.length) throw new InstallError(NOT_SET_UP(database));
  const spaces = new Set(rows.map((row) => row.tenant_id));
  if (spaces.size > 1)
    throw new InstallError(
      `This portal holds ${spaces.size} spaces. The sample goes into the space of the single owner of a private portal, and there is no option to choose one. Nothing was installed.`,
    );
  return { tenantId: rows[0].tenant_id, userId: rows[0].user_id };
}

/** Looks at the target without writing: its owner's space, and that it holds no data yet. */
async function inspectTarget(database) {
  if (!isPostgresUrl(database) && !existsSync(database))
    throw new InstallError(NOT_SET_UP(database));
  const source = await openSource(database);
  try {
    if (!(await source.has("users")) || !(await source.has("memberships")))
      throw new InstallError(NOT_SET_UP(database));
    const owner = ownerSpaceOf(await source.query(OWNERS_SQL), database);
    const occupied = await tablesWithData(source);
    if (occupied.length)
      throw new InstallError(
        `The portal is not empty (${occupied.join(", ")}): the sample goes into an empty space only. Nothing was installed.`,
      );
    return owner;
  } finally {
    await source.close();
  }
}

async function loadRecords(recordsDir) {
  if (!existsSync(join(recordsDir, "manifest.json")))
    throw new InstallError(
      `No sample records in ${recordsDir}. This checkout does not carry the sample (see docs/SAMPLE_DATA.md).`,
    );
  const verification = await verifyDataset({ recordsDir });
  if (!verification.ok)
    throw new InstallError(
      `The sample records are damaged; nothing was installed.\n${verifyReport(verification)}`,
    );
  const manifest = JSON.parse(
    await readFile(join(recordsDir, "manifest.json"), "utf8"),
  );
  const records = {};
  for (const name of RECORD_FILES)
    records[name.replace(/^records\//, "").replace(/\.json$/, "")] = JSON.parse(
      await readFile(join(recordsDir, name), "utf8"),
    );
  return { manifest, records };
}

async function fetchManifest(url, fetchImpl, packVersion, log, confirm, yes) {
  const parsed = assertFetchable(url, "The manifest address");
  let response;
  try {
    response = await fetchImpl(parsed, { redirect: "follow" });
  } catch (error) {
    throw new InstallError(
      `Cannot reach ${parsed.host} (${error.cause?.code || error.message}). Nothing was installed. ` +
        "Use --pack <archive> with a local archive, or --records-only.",
    );
  }
  if (!response.ok)
    throw new InstallError(
      `The manifest answered ${response.status}. Nothing was installed.`,
    );
  let manifest;
  try {
    manifest = await response.json();
  } catch {
    throw new InstallError(
      "The manifest is not valid JSON. Nothing was installed.",
    );
  }
  if (
    !Number.isInteger(manifest?.version) ||
    typeof manifest?.url !== "string" ||
    !manifest.url ||
    !Number.isInteger(manifest?.sizeBytes) ||
    !/^[0-9a-f]{64}$/.test(String(manifest?.sha256))
  )
    throw new InstallError(
      "The manifest lacks a version, an url, a size or a SHA-256. Nothing was installed.",
    );
  if (manifest.version !== packVersion)
    throw new InstallError(
      `The manifest offers image pack version ${manifest.version}, and the records of this checkout need version ${packVersion}. Nothing was installed.`,
    );
  const archiveUrl = assertFetchable(
    new URL(manifest.url, parsed).toString(),
    "The archive address",
  );
  log(
    `Sample images, version ${manifest.version}: ${megabytes(manifest.sizeBytes)}, SHA-256 ${manifest.sha256}`,
  );
  log(`Archive: ${archiveUrl}`);
  if (!yes && !(await confirm("Download and install it?")))
    throw new InstallError("Not confirmed. Nothing was installed.");
  return { manifest, archiveUrl };
}

async function download({ archiveUrl, manifest, fetchImpl, into }) {
  let response;
  try {
    response = await fetchImpl(archiveUrl, { redirect: "follow" });
  } catch (error) {
    throw new InstallError(
      `Cannot download the archive (${error.cause?.code || error.message}). Nothing was installed.`,
    );
  }
  if (!response.ok || !response.body)
    throw new InstallError(
      `The archive answered ${response.status}. Nothing was installed.`,
    );
  const path = join(into, "pack.tar.gz");
  const out = createWriteStream(path);
  const hash = createHash("sha256");
  let received = 0;
  try {
    for await (const chunk of Readable.fromWeb(response.body)) {
      received += chunk.length;
      if (received > manifest.sizeBytes)
        throw new InstallError(
          "The archive is larger than its manifest says. Nothing was installed.",
        );
      hash.update(chunk);
      if (!out.write(chunk)) await once(out, "drain");
    }
  } finally {
    out.end();
    await once(out, "close").catch(() => {});
  }
  if (received !== manifest.sizeBytes || hash.digest("hex") !== manifest.sha256)
    throw new InstallError(
      "The downloaded archive does not match the size and the SHA-256 of the manifest; it was not extracted. Nothing was installed.",
    );
  return path;
}

/** Extracts the archive into `temporary`, checking every file against the capture records. */
async function extractChecked({ archive, temporary, records }) {
  const capturesById = new Map(records.captures.map((row) => [row.id, row]));
  const expected = new Map(
    records.images.map((entry) => [
      entry.path,
      capturesById.get(entry.captureId),
    ]),
  );
  const seen = new Set();
  await readTarGz(archive, async (entry) => {
    if (entry.type !== "file") return;
    const capture = expected.get(entry.path);
    if (!capture)
      throw new InstallError(
        `The archive holds a file the records do not list (${entry.path}); nothing was installed.`,
      );
    if (
      capture.byte_size !== entry.size ||
      capture.sha256 !== sha256Of(entry.bytes)
    )
      throw new InstallError(
        `A file of the archive differs from its record (${entry.path}); nothing was installed.`,
      );
    const destination = resolve(temporary, entry.path);
    if (!destination.startsWith(resolve(temporary) + sep))
      throw new InstallError(
        "The archive names a path outside the folder; nothing was installed.",
      );
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.bytes, { flag: "wx" });
    seen.add(entry.path);
  });
  for (const path of expected.keys())
    if (!seen.has(path))
      throw new InstallError(
        `The archive lacks a listed image (${path}); nothing was installed.`,
      );
  return [...seen].sort();
}

/** Puts the space and the owner of the portal where the records carry their placeholders. */
function inSpaceOf(owner, value) {
  return typeof value === "string"
    ? value
        .replaceAll(TENANT_PLACEHOLDER, owner.tenantId)
        .replaceAll(OWNER_PLACEHOLDER, owner.userId)
    : value;
}

function columnValue(table, column, value) {
  if (value === null || value === undefined) return null;
  if (table === "observation_sessions" && column === "package_documents_json") {
    return JSON.stringify(
      value.map((document) => {
        const content = Buffer.from(document.text, "utf8");
        return {
          path: document.path,
          kind: document.kind,
          bytes: content.length,
          sha256: sha256Of(content),
          mimeType: document.mimeType ?? null,
          capturedAt: document.capturedAt ?? null,
          addedAt: document.addedAt,
          content: content.toString("base64"),
        };
      }),
    );
  }
  if (JSON_COLUMNS[table]?.includes(column)) return stableStringify(value);
  return value;
}

async function insertRecords(tx, records, report, owner) {
  for (const table of RECORD_TABLES) {
    const columnsAllowed = new Set(TABLE_COLUMNS[table]);
    for (const row of records[table]) {
      const columns = Object.keys(row);
      for (const column of columns)
        if (!columnsAllowed.has(column) || !/^[a-z][a-z0-9_]*$/.test(column))
          throw new InstallError(`Refused column ${table}.${column}.`);
      if (table === "target_media") {
        const found = await tx.query(
          "SELECT 1 AS present FROM target_catalogue_entries WHERE id = ?",
          [row.target_id],
        );
        if (!found.rows.length) {
          report.targetMediaSkipped += 1;
          continue;
        }
      }
      const values = columns.map((column) =>
        inSpaceOf(owner, columnValue(table, column, row[column])),
      );
      await tx.run(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})${table === "target_media" ? " ON CONFLICT(target_id, variant) DO NOTHING" : ""}`,
        values,
      );
      // An installed capture is a finished
      // one (`finalized`), and its file is its main image.
      if (table === "captures") {
        const value = (name) => values[columns.indexOf(name)];
        await tx.run(
          "UPDATE captures SET stage = 'finalized', finalized_at = COALESCE(finalized_at, created_at) WHERE id = ?",
          [value("id")],
        );
        await tx.run(
          `INSERT INTO capture_variants
             (id, capture_id, tenant_id, sha256, byte_size, original_name, is_main, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            value("id"),
            value("id"),
            value("tenant_id"),
            value("sha256"),
            value("byte_size"),
            value("original_name"),
            value("created_at"),
          ],
        );
      }
    }
  }
}

/**
 * @returns {Promise<{ tables: object, images: number, recordsOnly: boolean, ... }>}
 */
export async function runInstall(options) {
  const {
    database,
    imagesDir = null,
    capturesDir = null,
    recordsDir = join(repositoryRoot, "sample"),
    pack = null,
    manifestUrl = DEFAULT_MANIFEST_URL,
    yes = false,
    recordsOnly = false,
    confirm = defaultConfirm,
    log = (line) => console.log(line),
    fetchImpl = fetch,
  } = options;
  if (!database) throw new InstallError("--database is required.");
  if (!recordsOnly && !imagesDir)
    throw new InstallError("--images-dir is required (or --records-only).");
  if (pack && recordsOnly)
    throw new InstallError("--pack and --records-only exclude each other.");

  const { manifest, records } = await loadRecords(resolve(recordsDir));
  const owner = await inspectTarget(database);
  log("The portal has an owner: the sample goes into their space.");

  const work = await mkdtemp(join(tmpdir(), "astro-sample-install-"));
  const imagesRoot = imagesDir ? resolve(imagesDir) : null;
  let temporary = null;
  const placed = [];
  const copied = [];
  const report = { targetMediaSkipped: 0 };
  try {
    let archive = null;
    if (!recordsOnly) {
      if (pack) {
        archive = resolve(pack);
        if (!existsSync(archive))
          throw new InstallError(`The archive does not exist: ${archive}`);
        const beside = join(dirname(archive), "manifest.json");
        if (existsSync(beside)) {
          const info = JSON.parse(
            await readFile(beside, "utf8").catch(() => "null"),
          );
          if (info?.format === PACK_FORMAT) {
            const size = (await stat(archive)).size;
            if (
              info.sizeBytes !== size ||
              info.sha256 !== (await sha256OfFile(archive))
            )
              throw new InstallError(
                "The archive does not match the manifest beside it; it was not extracted. Nothing was installed.",
              );
          }
        }
      } else {
        const { manifest: remote, archiveUrl } = await fetchManifest(
          manifestUrl,
          fetchImpl,
          manifest.packVersion,
          log,
          confirm,
          yes,
        );
        archive = await download({
          archiveUrl,
          manifest: remote,
          fetchImpl,
          into: work,
        });
      }
      await mkdir(imagesRoot, { recursive: true });
      temporary = join(
        imagesRoot,
        `.astro-sample-${randomBytes(4).toString("hex")}`,
      );
      await mkdir(temporary);
      const files = await extractChecked({ archive, temporary, records });
      for (const path of files)
        if (existsSync(join(imagesRoot, path)))
          throw new InstallError(
            `A file of the sample already exists in the images folder (${path}); nothing was installed.`,
          );
    }

    const dialect = isPostgresUrl(database) ? "postgres" : "sqlite";
    const driver = createDatabaseDriver(
      dialect === "postgres"
        ? { databaseUrl: database }
        : { databasePath: database },
    );
    try {
      await applyMigrations(driver, dialect);
      await driver.transaction(async (tx) => {
        // Seen again inside the transaction: the owner is still the one whose space was chosen.
        const current = ownerSpaceOf(
          (await tx.query(OWNERS_SQL)).rows,
          database,
        );
        if (
          current.tenantId !== owner.tenantId ||
          current.userId !== owner.userId
        )
          throw new InstallError(
            "The owner of the portal changed during the installation. Nothing was installed.",
          );
        for (const table of RECORD_TABLES)
          if (table !== "target_media") {
            const found = await tx.query(recordCountSql(table));
            if (Number(found.rows[0].count) > 0)
              throw new InstallError(
                `The portal is not empty (${table}). Nothing was installed.`,
              );
          }
        await insertRecords(tx, records, report, owner);
        for (const table of RECORD_TABLES) {
          const expected =
            manifest.counts.tables[table] -
            (table === "target_media" ? report.targetMediaSkipped : 0);
          const found = await tx.query(recordCountSql(table));
          if (
            table !== "target_media" &&
            Number(found.rows[0].count) !== expected
          )
            throw new InstallError(
              `The count of ${table} is not the one of the records; nothing was installed.`,
            );
        }
        if (recordsOnly) return;
        // The files go in place inside the transaction: a failure here rolls the records back.
        const store = resolve(capturesDir || capturesDirectory());
        const tenantId = owner.tenantId;
        for (const entry of records.images) {
          const from = join(temporary, entry.path);
          const to = join(imagesRoot, entry.path);
          await mkdir(dirname(to), { recursive: true });
          await rename(from, to);
          placed.push(to);
          const capture = records.captures.find(
            (row) => row.id === entry.captureId,
          );
          const copy = join(
            store,
            tenantId,
            capture.sha256.slice(0, 2),
            capture.sha256.slice(2, 4),
            capture.sha256,
          );
          if (!existsSync(copy)) {
            await mkdir(dirname(copy), { recursive: true });
            await copyFile(to, copy);
            copied.push(copy);
          }
        }
      });
    } finally {
      await driver.close();
    }
    if (temporary) await rm(temporary, { recursive: true, force: true });
    return {
      recordsOnly,
      counts: Object.fromEntries(
        RECORD_TABLES.map((table) => [table, records[table].length]),
      ),
      images: recordsOnly ? 0 : records.images.length,
      capturesWithoutImage: recordsOnly ? records.captures.length : 0,
      targetMediaSkipped: report.targetMediaSkipped,
    };
  } catch (error) {
    for (const path of [...placed, ...copied]) {
      await rm(path, { force: true }).catch(() => {});
      // Folders this install created, and only those: an empty folder is removed, a used one stays.
      for (
        let folder = dirname(path);
        folder.length > 1;
        folder = dirname(folder)
      ) {
        if (imagesRoot && folder === imagesRoot) break;
        if (
          !(await rmdir(folder).then(
            () => true,
            () => false,
          ))
        )
          break;
      }
    }
    if (temporary) await rm(temporary, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
