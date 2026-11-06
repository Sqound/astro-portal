import {
  FILE_DELETION_SCOPES,
  createFileDeletionRunner,
  recordFileDeletions,
} from "../persistence/capture-file-deletions.js";

/**
 * The sweep of the orphans of the capture store: the files with no row, and
 * the rows with no file (`scripts/captures-orphans.mjs`, and the
 * administration's `GET /api/admin/captures/orphans`, which return this
 * report).
 *
 * For each space, the digests the database holds (`capture_variants.sha256`,
 * the main image included, and `captures.sha256`) are crossed with the files
 * the store lists (`list(tenantId)` of the capture store):
 *
 * - an **orphan file** is a file whose digest no row of the space holds —
 *   an original, a thumbnail or a shared copy a deletion did not remove, or
 *   a file whose upload never wrote its row;
 * - a file whose digest has a **pending deletion** (`capture_file_deletions`)
 *   is not an orphan: the hourly maintenance is deleting it;
 * - a **missing file** is a digest a row holds whose original the store does
 *   not have. The derived files are not looked for: a thumbnail is made after
 *   the upload and a shared copy only for a public capture.
 *
 * A file younger than `minAgeMs` is reported with `young: true` and never
 * applied: an upload publishes its file before it writes its row. Applying
 * the report (`removeCaptureOrphans`) records a deletion task per orphan
 * digest and runs it, which checks once more that no image holds the digest
 * and keeps the task, to be tried again, when the store does not answer.
 * Rows are never deleted: a missing file is for a person to look at.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;

export class CaptureOrphanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CaptureOrphanError";
    this.code = code;
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

async function databaseSpaces(db) {
  const found = new Set();
  for (const table of ["capture_variants", "captures"])
    for (const row of (
      await db.query(`SELECT DISTINCT tenant_id FROM ${table}`)
    ).rows)
      found.add(String(row.tenant_id));
  return found;
}

async function spaceReport({ db, files, tenantId, now, minAgeMs }) {
  // What the rows hold: digest -> the capture and image that name it.
  const held = new Map();
  for (const row of (
    await db.query(
      "SELECT id, capture_id, sha256 FROM capture_variants WHERE tenant_id = ?",
      [tenantId],
    )
  ).rows)
    if (SHA256.test(String(row.sha256 ?? "")))
      held.set(String(row.sha256), {
        captureId: String(row.capture_id),
        imageId: String(row.id),
      });
  for (const row of (
    await db.query("SELECT id, sha256 FROM captures WHERE tenant_id = ?", [
      tenantId,
    ])
  ).rows)
    if (SHA256.test(String(row.sha256 ?? "")) && !held.has(String(row.sha256)))
      held.set(String(row.sha256), {
        captureId: String(row.id),
        imageId: null,
      });
  const waiting = new Set(
    (
      await db.query(
        "SELECT sha256 FROM capture_file_deletions WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows.map((row) => String(row.sha256)),
  );

  const originals = new Set();
  const orphans = [];
  const pending = [];
  let listed = 0;
  for await (const file of files.list(tenantId)) {
    listed += 1;
    if (file.file === "original") originals.add(file.sha256);
    if (held.has(file.sha256)) continue;
    const modified =
      file.lastModified == null ? null : new Date(file.lastModified);
    const entry = {
      sha256: file.sha256,
      file: file.file,
      size: Number(file.size ?? 0),
      lastModified: modified ? modified.toISOString() : null,
    };
    if (waiting.has(file.sha256)) {
      pending.push(entry);
      continue;
    }
    orphans.push({
      ...entry,
      young: modified ? now.getTime() - modified.getTime() < minAgeMs : false,
    });
  }
  const missing = [];
  for (const [sha256, owner] of held)
    if (!originals.has(sha256)) missing.push({ sha256, ...owner });
  orphans.sort((a, b) => (a.sha256 + a.file < b.sha256 + b.file ? -1 : 1));
  missing.sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1));
  return {
    tenantId,
    known: true,
    images: held.size,
    files: listed,
    orphans,
    pending,
    missing,
  };
}

/**
 * The report: `{ generatedAt, store, minAgeSeconds, spaces: [{ tenantId,
 * known, images, files, orphans, pending, missing }], totals }`.
 * `tenantId` limits it to one space; `strays` (default true) adds the
 * spaces the store holds files for and the database does not know. A
 * store without a listing is refused (`listing_unsupported`).
 */
export async function captureOrphanReport({
  db,
  files,
  tenantId = null,
  strays = true,
  minAgeMs = ORPHAN_MIN_AGE_MS,
  now = new Date(),
}) {
  if (!db) throw new Error("The sweep of orphans needs a database.");
  if (typeof files?.list !== "function")
    throw new CaptureOrphanError(
      "listing_unsupported",
      "This capture store cannot list its files.",
    );
  const known = await databaseSpaces(db);
  let spaces;
  if (tenantId) spaces = [tenantId];
  else {
    spaces = [...known];
    if (strays && typeof files.listSpaces === "function")
      for await (const space of files.listSpaces())
        if (!known.has(space)) spaces.push(space);
    spaces.sort();
  }
  const reports = [];
  for (const space of spaces) {
    const report = await spaceReport({
      db,
      files,
      tenantId: space,
      now,
      minAgeMs,
    });
    reports.push({ ...report, known: known.has(space) });
  }
  const sum = (pick) => reports.reduce((total, one) => total + pick(one), 0);
  return {
    generatedAt: now.toISOString(),
    store: files.kind ?? null,
    minAgeSeconds: Math.round(minAgeMs / 1000),
    spaces: reports,
    totals: {
      spaces: reports.length,
      files: sum((one) => one.files),
      orphanFiles: sum((one) => one.orphans.length),
      orphanBytes: sum((one) =>
        one.orphans.reduce((bytes, file) => bytes + file.size, 0),
      ),
      youngOrphanFiles: sum(
        (one) => one.orphans.filter((file) => file.young).length,
      ),
      pendingFiles: sum((one) => one.pending.length),
      missingFiles: sum((one) => one.missing.length),
    },
  };
}

/**
 * Deletes the orphan files of a report, except the young ones. Each orphan
 * digest becomes a deletion task that is run at once: the run checks that no
 * image holds the digest again, and a store that does not answer leaves the
 * task for the hourly maintenance. Answers `{ digests, done, cancelled,
 * deferred, failed }`.
 */
export async function removeCaptureOrphans({
  db,
  files,
  report,
  log = () => {},
  clock = () => new Date(),
}) {
  const runner = createFileDeletionRunner({ db, files, log, clock });
  const outcome = {
    digests: 0,
    done: 0,
    cancelled: 0,
    deferred: 0,
    failed: 0,
  };
  for (const space of report.spaces) {
    const digests = [
      ...new Set(
        space.orphans.filter((file) => !file.young).map((file) => file.sha256),
      ),
    ];
    if (!digests.length) continue;
    await recordFileDeletions(db, {
      tenantId: space.tenantId,
      digests,
      scope: FILE_DELETION_SCOPES.all,
      at: clock(),
    });
    const ran = await runner.attempt({ tenantId: space.tenantId, digests });
    outcome.digests += digests.length;
    outcome.done += ran.done;
    outcome.cancelled += ran.cancelled;
    outcome.deferred += ran.deferred;
    outcome.failed += ran.failed;
  }
  return outcome;
}
