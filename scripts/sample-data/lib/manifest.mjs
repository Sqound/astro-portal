// Reading and writing the two manifests of the sample: the one of the
// records (sample/manifest.json, kept in the code repository) and the one of
// the image pack (build/sample-data/manifest.json, published by the site).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  ATTRIBUTION,
  FORMAT,
  FORMAT_VERSION,
  LICENSE_ID,
  LICENSE_NAME,
  LICENSE_URL,
  PACK_ROOT,
  SAMPLE_PLACE,
} from "./constants.mjs";
import { formatJson } from "./scrub.mjs";

export const PACK_FORMAT = `${FORMAT}-images`;

export const sha256Of = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export async function sha256OfFile(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .once("error", reject)
      .once("end", resolve);
  });
  return hash.digest("hex");
}

export async function writeText(root, relativePath, text) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return {
    path: relativePath,
    bytes: Buffer.byteLength(text),
    sha256: sha256Of(text),
  };
}

/** Every file under `root`, as sorted POSIX-style relative paths. */
export async function listFiles(root) {
  const found = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else found.push(relative(root, path).split(sep).join("/"));
    }
  };
  await visit(root);
  return found.sort();
}

export function recordsManifest({
  createdAt,
  packVersion,
  counts,
  imageCount,
  imageBytes,
  schemaVersion,
  report,
  files,
}) {
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    createdAt,
    packVersion,
    license: {
      id: LICENSE_ID,
      name: LICENSE_NAME,
      url: LICENSE_URL,
      file: "LICENSE",
    },
    attribution: ATTRIBUTION,
    place: {
      name: SAMPLE_PLACE.name,
      latitude: Number(SAMPLE_PLACE.latitude),
      longitude: Number(SAMPLE_PLACE.longitude),
      elevationMeters: Number(SAMPLE_PLACE.elevation),
      precision:
        "Rounded to a tenth of a degree, at the centre of the department; not the place of the shots.",
    },
    sourceSchemaVersion: schemaVersion,
    counts: { tables: counts, images: imageCount },
    pack: { root: PACK_ROOT, images: imageCount, bytes: imageBytes },
    anonymisation: report,
    files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}

export function packManifest({
  version,
  url,
  sizeBytes,
  sha256,
  createdAt,
  files,
}) {
  return {
    format: PACK_FORMAT,
    version,
    url: url ?? null,
    sizeBytes,
    sha256,
    license: { id: LICENSE_ID, name: LICENSE_NAME, url: LICENSE_URL },
    attribution: ATTRIBUTION,
    createdAt,
    files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}

export const manifestText = (manifest) => `${formatJson(manifest, "", 160)}\n`;

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
