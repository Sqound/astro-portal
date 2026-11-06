// The media manifest of a backup: every file under the media directory by
// relative path, byte size and SHA-256. Media bytes are never copied by
// the manifest itself.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathExists, sha256File } from "./files.js";

/**
 * A media directory may link whole subtrees with symlinks; a
 * manifest that skipped them would silently omit most of the tree, so a
 * symlink is followed (via `stat`) and treated like the file or directory it
 * points at.
 *
 * `previous` (entries of an earlier manifest written with
 * `recordModifiedTime`) lets a file whose size and modification time are
 * unchanged keep its recorded digest instead of being read again: the
 * service takes a backup at every rollout, and re-reading every capture over
 * a network share each time would delay its start for nothing.
 *
 * `skipVanished` (the service, which manifests media while uploads come
 * and go) skips a file or directory that disappears during the walk — an
 * upload's `.part` file renamed into place, a dangling link — instead of
 * failing the whole backup; the scripts keep failing on it.
 */
export async function mediaManifest(
  mediaDir,
  { previous = null, recordModifiedTime = false, skipVanished = false } = {},
) {
  if (!mediaDir || !(await pathExists(mediaDir)))
    return { entries: [], missing: true };
  const known = new Map(
    (previous || [])
      .filter((entry) => typeof entry?.modifiedMs === "number")
      .map((entry) => [entry.path, entry]),
  );
  const entries = [];
  const vanished = (error) => skipVanished && error?.code === "ENOENT";
  async function visit(absolute, relativePath, dirent) {
    const directoryLike = dirent.isSymbolicLink()
      ? (await stat(absolute)).isDirectory()
      : dirent.isDirectory();
    if (directoryLike) {
      await walk(absolute, relativePath);
      return;
    }
    const fileStat = await stat(absolute);
    if (!fileStat.isFile()) return;
    const earlier = known.get(relativePath);
    const sha256 =
      earlier &&
      earlier.bytes === fileStat.size &&
      earlier.modifiedMs === fileStat.mtimeMs
        ? earlier.sha256
        : await sha256File(absolute);
    entries.push({
      path: relativePath,
      bytes: fileStat.size,
      sha256,
      ...(recordModifiedTime ? { modifiedMs: fileStat.mtimeMs } : {}),
    });
  }
  async function walk(directory, relativePrefix) {
    let dirents;
    try {
      dirents = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (vanished(error)) return;
      throw error;
    }
    for (const dirent of dirents) {
      const relativePath = relativePrefix
        ? `${relativePrefix}/${dirent.name}`
        : dirent.name;
      try {
        await visit(join(directory, dirent.name), relativePath, dirent);
      } catch (error) {
        if (!vanished(error)) throw error;
      }
    }
  }
  await walk(mediaDir, "");
  entries.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return { entries, missing: false };
}

export function compareMediaManifests(expected, actual) {
  const failures = [];
  const actualByPath = new Map(actual.map((entry) => [entry.path, entry]));
  for (const entry of expected) {
    const found = actualByPath.get(entry.path);
    if (!found) {
      failures.push(`missing media file: ${entry.path}`);
      continue;
    }
    if (found.bytes !== entry.bytes)
      failures.push(
        `media size mismatch for ${entry.path}: expected ${entry.bytes}, got ${found.bytes}`,
      );
    else if (found.sha256 !== entry.sha256)
      failures.push(`media checksum mismatch for ${entry.path}`);
    actualByPath.delete(entry.path);
  }
  for (const leftover of actualByPath.keys())
    failures.push(`unexpected media file: ${leftover}`);
  return failures;
}
