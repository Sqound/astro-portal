// The independent check of a finished sample. It reads what is on disk — the
// records folder and, when given, the image pack — and replays every rule on
// it, trusting nothing the exporter says about itself: not the manifest, not
// the names, not that a file was cleaned. Findings say where and which rule,
// never the value that broke it.
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  ATTRIBUTION,
  DEFAULT_MAX_PACK_BYTES,
  FORMAT,
  FORMAT_VERSION,
  LICENSE_ID,
  RECORD_FILES,
  RECORD_TABLES,
  SAMPLE_PLACE,
} from "./constants.mjs";
import { inspectImage } from "./images.mjs";
import { PACK_FORMAT, listFiles, sha256Of, sha256OfFile } from "./manifest.mjs";
import {
  forbiddenWordCount,
  forbiddenWordInBytes,
  textRules,
} from "./patterns.mjs";
import {
  IMAGE_PATH,
  formatFinding,
  imageListFindings,
  recordFindings,
  structureFindings,
} from "./record-checks.mjs";
import { readTarGz } from "./tar.mjs";

const TEXT_FILES = new Set(["manifest.json", "LICENSE", "README.md"]);
const ALLOWED_FILES = new Set([...RECORD_FILES, ...TEXT_FILES]);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ ok: boolean, problems: {scope: string, message: string}[], stats: object }>}
 */
export async function verifyDataset({
  recordsDir,
  packFile = null,
  packManifestFile = null,
  forbid = [],
  near = null,
  allowUrls = false,
}) {
  const problems = [];
  const add = (scope, message) => problems.push({ scope, message });
  const stats = { files: 0, tables: 0, rows: 0, images: 0, packBytes: 0 };

  // ---- the manifest
  let manifest = null;
  try {
    manifest = JSON.parse(
      await readFile(join(recordsDir, "manifest.json"), "utf8"),
    );
  } catch {
    add("manifest.json", "missing or not valid JSON");
    return { ok: false, problems, stats };
  }
  if (manifest.format !== FORMAT) add("manifest.json", "unknown format");
  if (manifest.formatVersion !== FORMAT_VERSION)
    add(
      "manifest.json",
      `format version ${manifest.formatVersion} is not ${FORMAT_VERSION}`,
    );
  if (manifest.license?.id !== LICENSE_ID)
    add("manifest.json", `the licence is not ${LICENSE_ID}`);
  if (manifest.attribution !== ATTRIBUTION)
    add("manifest.json", "the attribution is not the expected one");
  if (!Number.isInteger(manifest.packVersion) || manifest.packVersion < 1)
    add("manifest.json", "packVersion is not a positive integer");
  const place = manifest.place || {};
  if (
    place.name !== SAMPLE_PLACE.name ||
    place.latitude !== Number(SAMPLE_PLACE.latitude) ||
    place.longitude !== Number(SAMPLE_PLACE.longitude) ||
    place.elevationMeters !== Number(SAMPLE_PLACE.elevation)
  )
    add("manifest.json", "the place is not the sample place");

  // ---- the files on disk against the manifest
  const onDisk = await listFiles(recordsDir);
  stats.files = onDisk.length;
  const listed = new Map(
    (manifest.files || []).map((file) => [file.path, file]),
  );
  for (const path of onDisk) {
    if (path === "manifest.json") continue;
    if (!ALLOWED_FILES.has(path))
      add(path, "a file that has no place in the sample");
    if (!listed.has(path)) add(path, "a file the manifest does not list");
  }
  for (const [path, file] of listed) {
    if (!onDisk.includes(path)) {
      add(path, "listed in the manifest but missing");
      continue;
    }
    const bytes = await readFile(join(recordsDir, path));
    if (bytes.length !== file.bytes)
      add(path, "the size differs from the manifest");
    if (sha256Of(bytes) !== file.sha256)
      add(path, "the SHA-256 differs from the manifest");
  }
  for (const path of ["LICENSE", "README.md"])
    if (!onDisk.includes(path)) add(path, "missing");

  // ---- the text files: forbidden words everywhere, the patterns in the two that are ours
  for (const path of onDisk.filter((entry) => TEXT_FILES.has(entry))) {
    const text = await readFile(join(recordsDir, path), "utf8");
    if (forbiddenWordCount(text, forbid)) add(path, "a forbidden word");
    if (path !== "LICENSE")
      for (const rule of textRules(text, { forbid: [], allowUrls: true }))
        add(path, rule);
  }

  // ---- the records
  const records = {};
  for (const name of RECORD_FILES) {
    const table = name.replace(/^records\//, "").replace(/\.json$/, "");
    if (!onDisk.includes(name)) {
      add(name, "missing");
      continue;
    }
    try {
      records[table] = JSON.parse(
        await readFile(join(recordsDir, name), "utf8"),
      );
    } catch {
      add(name, "not valid JSON");
    }
  }
  stats.tables = Object.keys(records).length;
  stats.rows = Object.entries(records)
    .filter(([table]) => table !== "images")
    .reduce(
      (sum, [, rows]) => sum + (Array.isArray(rows) ? rows.length : 0),
      0,
    );
  const findings = [
    ...structureFindings(records),
    ...recordFindings(records, { forbid, near, allowUrls }),
    ...imageListFindings(records.images, records.captures),
  ];
  for (const finding of findings) add("records", formatFinding(finding));
  for (const table of RECORD_TABLES)
    if (
      Array.isArray(records[table]) &&
      manifest.counts?.tables?.[table] !== records[table].length
    )
      add("manifest.json", `the count of ${table} differs from the records`);
  if (
    Array.isArray(records.images) &&
    manifest.counts?.images !== records.images.length
  )
    add("manifest.json", "the count of images differs from the records");

  // ---- the pack
  if (packFile) {
    const capturesById = new Map(
      (records.captures || []).map((row) => [row.id, row]),
    );
    const expected = new Map(
      (records.images || []).map((entry) => [
        entry.path,
        capturesById.get(entry.captureId),
      ]),
    );
    const seen = new Map();
    try {
      const packStat = await stat(packFile);
      stats.packBytes = packStat.size;
      if (packStat.size > DEFAULT_MAX_PACK_BYTES)
        add("pack", "the archive is larger than 200 MB");
      await readTarGz(packFile, async (entry) => {
        if (entry.type !== "file") return;
        stats.images += 1;
        const scope = `pack:${entry.path}`;
        seen.set(entry.path, {
          bytes: entry.size,
          sha256: sha256Of(entry.bytes),
        });
        if (!IMAGE_PATH.test(entry.path))
          add(scope, "a name that is not of the stable pattern");
        const capture = expected.get(entry.path);
        if (!capture) add(scope, "an image that no record lists");
        else {
          if (capture.byte_size !== entry.size)
            add(scope, "the size differs from the capture record");
          if (capture.sha256 !== seen.get(entry.path).sha256)
            add(scope, "the SHA-256 differs from the capture record");
        }
        for (const problem of inspectImage(entry.bytes).problems)
          add(scope, problem);
        if (forbiddenWordInBytes(entry.bytes, forbid))
          add(scope, "a forbidden word in the bytes");
      });
    } catch (error) {
      add("pack", `unreadable: ${error.message}`);
    }
    for (const path of expected.keys())
      if (!seen.has(path))
        add("pack", `a listed image is missing from the archive (${path})`);

    const beside = packManifestFile || join(dirname(packFile), "manifest.json");
    if (await exists(beside)) {
      let packManifest = null;
      try {
        packManifest = JSON.parse(await readFile(beside, "utf8"));
      } catch {
        add(beside, "not valid JSON");
      }
      if (packManifest?.format === PACK_FORMAT) {
        if (packManifest.version !== manifest.packVersion)
          add(
            "pack manifest",
            "its version is not the pack version of the records",
          );
        const packStat = await stat(packFile);
        if (packManifest.sizeBytes !== packStat.size)
          add("pack manifest", "the size differs from the archive");
        if (packManifest.sha256 !== (await sha256OfFile(packFile)))
          add("pack manifest", "the SHA-256 differs from the archive");
        const listedFiles = new Map(
          (packManifest.files || []).map((file) => [file.path, file]),
        );
        for (const [path, info] of seen) {
          const file = listedFiles.get(path);
          if (!file || file.bytes !== info.bytes || file.sha256 !== info.sha256)
            add(
              "pack manifest",
              `the entry of ${path} does not match the archive`,
            );
        }
        if (listedFiles.size !== seen.size)
          add("pack manifest", "it lists files the archive does not hold");
        for (const rule of textRules(JSON.stringify(packManifest), {
          forbid,
          allowUrls: true,
        }))
          add("pack manifest", rule);
      }
    }
  }

  return { ok: problems.length === 0, problems, stats };
}

export function verifyReport(result) {
  const lines = [];
  if (result.ok) lines.push("Verification passed: no finding.");
  else {
    lines.push(`Verification FAILED: ${result.problems.length} finding(s).`);
    for (const problem of result.problems.slice(0, 200))
      lines.push(`  - ${problem.scope}: ${problem.message}`);
    if (result.problems.length > 200)
      lines.push(`  … and ${result.problems.length - 200} more`);
  }
  const { stats } = result;
  lines.push(
    `Checked ${stats.files} file(s), ${stats.tables} table(s), ${stats.rows} row(s), ${stats.images} image(s) in the pack.`,
  );
  return lines.join("\n");
}
