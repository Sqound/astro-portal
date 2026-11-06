// Small file helpers shared by the backup module
// (packages/portal/src/persistence/backup/). Everything here is
// asynchronous: a backup runs next to live requests.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, open, stat } from "node:fs/promises";

/**
 * A copy of the database is as private as the database itself: readable and
 * writable by the service's own user only, like the JSON files written next
 * to it (`writeJsonDurably`). SQLite's backup API and `copyFile` create their
 * file with the process's umask (usually 0644), hence this second step. It is
 * best effort on purpose: a share that ignores POSIX modes (a network
 * volume) must not make a backup fail.
 */
export async function restrictToOwner(path) {
  await chmod(path, 0o600).catch(() => {});
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The SHA-256 of a file, streamed: its cost is a read of the whole file, so
 * it follows the size of what is hashed (the backup's artifact, a medium).
 * Chunks of 1 MiB rather than the default 64 KiB: on a network share each
 * read is a round trip.
 */
export async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, {
    highWaterMark: 1024 * 1024,
  }))
    hash.update(chunk);
  return hash.digest("hex");
}

/**
 * Writes a JSON document and flushes it to storage before returning, so a
 * directory renamed into place right after never holds a half-written file
 * (the backup directory may live on a network share).
 */
export async function writeJsonDurably(path, value) {
  const handle = await open(path, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** `2026-09-29T10:15:42.123Z` → `2026-09-29T10-15-42-123Z`: sortable, and
 * valid in a file name on every file system and on an SMB share. */
export function timestampForName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
