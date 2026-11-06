// The export: reads the source database and the folders of capture bytes,
// builds the records and the image pack in temporary folders, runs the
// independent verification on them, and only then moves them into place — a
// failed export leaves nothing behind.
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTRIBUTION,
  DEFAULT_MAX_PACK_BYTES,
  FORMAT,
  FORMAT_VERSION,
  RECORD_TABLES,
  packArchiveName,
} from "./constants.mjs";
import { buildRecords } from "./build-records.mjs";
import { CaptureFiles } from "./capture-files.mjs";
import {
  manifestText,
  packManifest,
  recordsManifest,
  sha256Of,
  writeText,
} from "./manifest.mjs";
import { parseNear, prepareForbidden } from "./patterns.mjs";
import { formatJson } from "./scrub.mjs";
import { selectSessions } from "./select.mjs";
import { openSource } from "./source.mjs";
import { writeTarGz } from "./tar.mjs";
import { verifyDataset, verifyReport } from "./verify-run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(here, "..", "..", "..");
export const templatesDir = join(here, "..", "templates");

export class ExportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ExportError";
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const RECORDS_ITEMS = ["manifest.json", "LICENSE", "README.md", "records"];

async function assertFree(directory, items, replace, label) {
  const present = [];
  for (const item of items)
    if (await exists(join(directory, item))) present.push(item);
  if (present.length && !replace)
    throw new ExportError(
      `${label} already holds a sample (${present.join(", ")}): pass --replace to overwrite it.`,
    );
}

async function moveInto(directory, temporary, items) {
  await mkdir(directory, { recursive: true });
  for (const item of items) {
    if (!(await exists(join(temporary, item)))) continue;
    await rm(join(directory, item), { recursive: true, force: true });
    await rename(join(temporary, item), join(directory, item));
  }
  await rm(temporary, { recursive: true, force: true });
}

export const today = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object} options see scripts/sample-data/export.mjs (--help)
 * @returns {Promise<object>} what was written, for the report
 */
export async function runExport(options) {
  const {
    database,
    capturesDirs = [],
    sessions = [],
    equipment = [],
    from = null,
    to = null,
    tenant = null,
    forbid: forbidWords = [],
    near: nearArgument = null,
    allowUrls = false,
    allowMediaLicences = [],
    withSessionDocuments = false,
    packVersion = 1,
    packUrl = null,
    date = today(),
    recordsOut = join(repositoryRoot, "sample"),
    packOut = join(repositoryRoot, "build", "sample-data"),
    replace = false,
    maxPackBytes = DEFAULT_MAX_PACK_BYTES,
  } = options;
  if (!database) throw new ExportError("--database is required.");
  if (!Number.isInteger(packVersion) || packVersion < 1)
    throw new ExportError("--pack-version must be a positive integer.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ExportError("--date expects YYYY-MM-DD.");
  const forbid = prepareForbidden(forbidWords);
  const near = nearArgument ? parseNear(nearArgument) : null;
  const archiveName = packArchiveName(packVersion);
  await assertFree(
    recordsOut,
    RECORDS_ITEMS,
    replace,
    `The folder ${recordsOut}`,
  );
  await assertFree(
    packOut,
    ["manifest.json", archiveName],
    replace,
    `The folder ${packOut}`,
  );

  const source = await openSource(database);
  let built;
  try {
    const selection = await selectSessions(source, {
      sessions,
      equipment,
      from,
      to,
      tenant,
    });
    built = await buildRecords({
      source,
      selection,
      captureFiles: new CaptureFiles(capturesDirs.map((path) => resolve(path))),
      options: {
        forbid,
        near,
        allowUrls,
        allowMediaLicences: allowMediaLicences.map(
          (pattern) => new RegExp(pattern, "i"),
        ),
        withSessionDocuments,
        maxPackBytes,
      },
    });
  } finally {
    await source.close();
  }
  const { records, images, report, sourceSchemaVersion } = built;

  // ---- write into temporary folders next to the final ones
  const suffix = randomBytes(4).toString("hex");
  const recordsTmp = join(
    dirname(recordsOut),
    `.${basename(recordsOut)}.partial-${suffix}`,
  );
  const packTmp = join(
    dirname(packOut),
    `.${basename(packOut)}.partial-${suffix}`,
  );
  await mkdir(recordsTmp, { recursive: true });
  await mkdir(packTmp, { recursive: true });
  try {
    const files = [];
    for (const table of RECORD_TABLES)
      files.push(
        await writeText(
          recordsTmp,
          `records/${table}.json`,
          `${formatJson(records[table])}\n`,
        ),
      );
    files.push(
      await writeText(
        recordsTmp,
        "records/images.json",
        `${formatJson(records.images)}\n`,
      ),
    );
    await copyFile(join(templatesDir, "LICENSE"), join(recordsTmp, "LICENSE"));
    const licenseBytes = await readFile(join(recordsTmp, "LICENSE"));
    files.push({
      path: "LICENSE",
      bytes: licenseBytes.length,
      sha256: sha256Of(licenseBytes),
    });
    const readme = (await readFile(join(templatesDir, "README.md"), "utf8"))
      .replaceAll("{{FORMAT}}", FORMAT)
      .replaceAll("{{FORMAT_VERSION}}", String(FORMAT_VERSION))
      .replaceAll("{{CREATED_AT}}", date)
      .replaceAll(
        "{{SESSION_COUNT}}",
        String(records.observation_sessions.length),
      )
      .replaceAll("{{IMAGE_COUNT}}", String(images.length))
      .replaceAll("{{PACK_VERSION}}", String(packVersion))
      .replaceAll("{{ATTRIBUTION}}", ATTRIBUTION);
    files.push(await writeText(recordsTmp, "README.md", readme));

    const imageBytes = images.reduce(
      (sum, image) => sum + image.bytes.length,
      0,
    );
    const counts = Object.fromEntries(
      RECORD_TABLES.map((table) => [table, records[table].length]),
    );
    const manifest = recordsManifest({
      createdAt: date,
      packVersion,
      counts,
      imageCount: images.length,
      imageBytes,
      schemaVersion: sourceSchemaVersion,
      report: report.toObject(),
      files,
    });
    await writeText(recordsTmp, "manifest.json", manifestText(manifest));

    const archive = await writeTarGz(join(packTmp, archiveName), images);
    await writeText(
      packTmp,
      "manifest.json",
      manifestText(
        packManifest({
          version: packVersion,
          url: packUrl,
          sizeBytes: archive.sizeBytes,
          sha256: archive.sha256,
          createdAt: date,
          files: images.map((image) => ({
            path: image.path,
            bytes: image.bytes.length,
            sha256: sha256Of(image.bytes),
          })),
        }),
      ),
    );

    const verification = await verifyDataset({
      recordsDir: recordsTmp,
      packFile: join(packTmp, archiveName),
      forbid,
      near,
      allowUrls,
    });
    if (!verification.ok)
      throw new ExportError(
        `The verification of what was just built failed; nothing was written.\n${verifyReport(verification)}`,
      );

    await moveInto(recordsOut, recordsTmp, RECORDS_ITEMS);
    await moveInto(packOut, packTmp, ["manifest.json", archiveName]);
    return {
      recordsOut,
      packOut,
      archive: join(packOut, archiveName),
      archiveBytes: archive.sizeBytes,
      archiveSha256: archive.sha256,
      counts,
      images: images.length,
      imageBytes,
      report: report.toObject(),
      verification: verifyReport(verification),
    };
  } catch (error) {
    await rm(recordsTmp, { recursive: true, force: true });
    await rm(packTmp, { recursive: true, force: true });
    throw error;
  }
}
