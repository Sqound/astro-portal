import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { staticDataDir } from "./config.server.js";

/*
 * The demo-mode panoramas (`demo-panoramas`): the 360° backgrounds the
 * mobile demo mode shows in place of the camera of the horizon survey. Poly
 * Haven photos, CC0 1.0, cut and resized, installed next to the other static
 * data as `<static data>/demo-panoramas/` (`manifest.json`, the panoramas
 * and their 512-px thumbnails). Not a component of `GET /v1/offline-pack`:
 * the demo build of the app asks for `manifest.json` and downloads the file
 * of the panorama the person picks. A portal without the folder answers 404.
 */

export const demoPanoramasManifestName = "manifest.json";

export const demoPanoramasDirectory = () =>
  join(staticDataDir, "demo-panoramas");

// The only shapes a file name may take: the manifest, or a panorama / a
// thumbnail named by it (`<id>.jpg`, `<id>.webp`, `<id>-512.jpg`).
const fileNamePattern = /^[a-z0-9][a-z0-9-]{0,63}\.(?:jpg|webp)$/;

const contentTypes = new Map([
  [".json", "application/json"],
  [".jpg", "image/jpeg"],
  [".webp", "image/webp"],
]);

export function demoPanoramaContentType(file) {
  return contentTypes.get(file.slice(file.lastIndexOf("."))) || null;
}

const kept = new Map();

/**
 * What the installed file called [file] is: `{ path, size, checksum,
 * contentType }`, or `null` when the name is not one of the manifest and of
 * the files it lists, or the file is not installed. The name is checked
 * against the manifest's own list before anything reaches the filesystem
 * (and against a strict pattern first): a request never names a path. The
 * digest is kept while the file's size and modification time do not move.
 */
export async function installedDemoPanoramaFile(file) {
  if (typeof file !== "string") return null;
  const contentType =
    file === demoPanoramasManifestName
      ? contentTypes.get(".json")
      : fileNamePattern.test(file)
        ? demoPanoramaContentType(file)
        : null;
  if (!contentType) return null;

  const directory = demoPanoramasDirectory();
  if (file !== demoPanoramasManifestName) {
    const listed = await listedFiles(directory);
    if (!listed?.has(file)) return null;
  }
  const path = join(directory, file);
  let info;
  try {
    info = await stat(path);
  } catch {
    kept.delete(path);
    return null;
  }
  if (!info.isFile() || info.size === 0) return null;
  const previous = kept.get(path);
  if (
    previous &&
    previous.size === info.size &&
    previous.mtimeMs === info.mtimeMs
  )
    return previous;
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    return null;
  }
  const installed = {
    path,
    size: info.size,
    mtimeMs: info.mtimeMs,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    contentType,
  };
  kept.set(path, installed);
  return installed;
}

/** The names the installed manifest lists (files and thumbnails), or null. */
async function listedFiles(directory) {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(join(directory, demoPanoramasManifestName), "utf8"),
    );
  } catch {
    return null;
  }
  if (!Array.isArray(manifest?.panoramas)) return null;
  const names = new Set();
  for (const entry of manifest.panoramas)
    for (const name of [entry?.file, entry?.thumbnail])
      if (typeof name === "string" && fileNamePattern.test(name))
        names.add(name);
  return names;
}
