/**
 * Where a capture's original bytes live on disk, outside the database
 * (media bytes remain outside the database). This package must not import
 * `portal-app/lib/config.server.js` (the application's, above this package) — the same rule
 * `packages/portal/src/sky-tiles/mirror.js` states for itself — so the
 * `ASTRO_PORTAL_SERVICE_DIR` / `ASTRO_PORTAL_RUNTIME_DIR` resolution is
 * duplicated here rather than shared.
 *
 * Layout: `<capturesDir>/<tenantId>/<sha256[0:2]>/<sha256[2:4]>/<sha256>` —
 * content-addressed, so the path never depends on the person's original
 * filename (no traversal, no collision across unrelated files) and two
 * uploads of the same bytes by the same tenant always name the same file.
 * `originalName` is kept only in the `captures` row, bounded and never
 * interpolated into a path.
 *
 * Beside the originals, under the same space's directory, the files derived
 * from them: `<capturesDir>/<tenantId>/derived/<sha256>/` holds the thumbnail
 * (`thumbnail.webp`) and the shared copy (`shared.jpg`), the only file the public
 * gallery and a private gallery ever serve. A two-character prefix directory cannot
 * be named `derived` (nor `uploads`, the resumable parts below), so nothing
 * collides. The originals are served to their owner alone
 * (`/api/v1/manage/captures/{id}/media`); the derived files never count in the
 * space's storage (`usedBytes` sums `captures.byte_size`), and go with the space's
 * directory when the space is erased.
 *
 * This module is the core's **disk store** (`createDiskCaptureStore` at
 * the end), the default of the storage seam (`capture-store.js`). The services
 * read and write through the seam, never through the paths above, so that a
 * composition can keep the same files elsewhere; the paths stay for the disk
 * store itself, its tests, and the tools that work on a captures directory.
 */

import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { MEDIA_HEAD_BYTES, readFileHead } from "./media-type.js";

const sha256Pattern = /^[0-9a-f]{64}$/;
const tenantIdPattern = /^[A-Za-z0-9_-]{1,200}$/;
const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function capturesDirectory() {
  const explicit = process.env.ASTRO_PORTAL_CAPTURES_DIR;
  if (explicit) return resolve(explicit);
  const serviceDirectory = resolve(
    process.env.ASTRO_PORTAL_SERVICE_DIR || process.cwd(),
  );
  const runtimeDirectory = resolve(
    process.env.ASTRO_PORTAL_RUNTIME_DIR ||
      join(serviceDirectory, ".astro-portal"),
  );
  return join(runtimeDirectory, "captures");
}

/**
 * The final, content-addressed path for a tenant's capture. `tenantId` is
 * always an authenticated organization id (never client-chosen path input);
 * it is still pattern-checked here as a last line of defense against path
 * traversal, alongside the `sha256` shape check every caller already applies
 * before this is reached.
 */
export function capturePathFor(tenantId, sha256) {
  if (!tenantIdPattern.test(String(tenantId || "")))
    throw new Error("A valid tenant id is required.");
  if (!sha256Pattern.test(String(sha256 || "")))
    throw new Error("A valid sha256 digest is required.");
  return join(
    capturesDirectory(),
    tenantId,
    sha256.slice(0, 2),
    sha256.slice(2, 4),
    sha256,
  );
}

/** The directory of the files derived from one original of a space. */
export function derivedDirectoryFor(tenantId, sha256) {
  if (!tenantIdPattern.test(String(tenantId || "")))
    throw new Error("A valid tenant id is required.");
  if (!sha256Pattern.test(String(sha256 || "")))
    throw new Error("A valid sha256 digest is required.");
  return join(capturesDirectory(), tenantId, "derived", sha256);
}

/** The thumbnail of a capture: WebP, oriented, reduced, without metadata. */
export const thumbnailPathFor = (tenantId, sha256) =>
  join(derivedDirectoryFor(tenantId, sha256), "thumbnail.webp");

/**
 * The shared copy of a capture: the file a gallery serves, JPEG, without
 * EXIF, XMP or IPTC, its long side at 4096 px at most.
 */
export const sharedCopyPathFor = (tenantId, sha256) =>
  join(derivedDirectoryFor(tenantId, sha256), "shared.jpg");

/** Removes every file derived from one original (none is not an error). */
export async function removeDerivedFiles(tenantId, sha256) {
  await rm(derivedDirectoryFor(tenantId, sha256), {
    recursive: true,
    force: true,
  });
}

export class CaptureStorageError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "CaptureStorageError";
    this.code = code;
    Object.assign(this, details);
  }
}

/**
 * A push-style sink for one upload's bytes, built to be fed chunk by chunk
 * from the multipart parser as they stream in — never buffering the whole
 * file in memory. Nothing touches disk until the first `write()` call, so a
 * caller that validates metadata (capability checks, plan/target existence)
 * before ever calling `write()` never creates a stray directory or file for
 * a request that was always going to be refused.
 *
 * Writes go to a per-request `.part` sibling of the content-addressed
 * destination (named from the *declared* sha256, with a random suffix so two
 * concurrent uploads never share a temp path) and are renamed into place
 * only once `finish()` confirms the digest. `abort()` (called by `write()`
 * itself on overflow, and by the caller on any other failure) removes the
 * `.part` file — a failed upload leaves nothing behind.
 */
export function createCaptureSink({ tenantId, declaredSha256, maxBytes }) {
  const finalPath = capturePathFor(tenantId, declaredSha256);
  return createStagedSink({
    partPath: `${finalPath}.${randomBytes(8).toString("hex")}.part`,
    declaredSha256,
    maxBytes,
    // `rename` atomically replaces an existing destination on POSIX, so a
    // concurrent duplicate upload racing to the same content-addressed
    // path is harmless: both write identical bytes, and whichever rename
    // lands last leaves the same content in place. No existence check
    // is needed first.
    publish: async (partPath) => {
      await rename(partPath, finalPath);
      return finalPath;
    },
  });
}

/**
 * The sink above with its two ends named by the store that uses it: where
 * the bytes accumulate (`partPath`, on this machine) and how the verified
 * file is published (`publish(partPath)`, resolving to the published path
 * when the store has one). The disk store renames the part into the
 * content-addressed tree; another store sends it away and removes it.
 */
export function createStagedSink({
  partPath,
  declaredSha256,
  maxBytes,
  publish,
}) {
  const hash = createHash("sha256");
  let byteSize = 0;
  let sink = null;
  let aborted = false;

  async function ensureStarted() {
    if (sink) return;
    await mkdir(dirname(partPath), { recursive: true });
    sink = createWriteStream(partPath);
  }

  async function abort() {
    if (aborted) return;
    aborted = true;
    // Wait for the stream to close: a destroy() issued while the file's
    // open() is still in flight would otherwise let that open() recreate
    // the `.part` after the rm() below.
    if (sink && !sink.closed) {
      await new Promise((resolveClose) => {
        sink.once("close", resolveClose);
        sink.destroy();
      });
    }
    await rm(partPath, { force: true });
  }

  return {
    /** Hashes, counts and writes one chunk. Aborts and throws past `maxBytes`. */
    async write(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteSize += buffer.length;
      if (byteSize > maxBytes) {
        await abort();
        throw new CaptureStorageError(
          "file_too_large",
          "This file exceeds the per-file limit.",
        );
      }
      await ensureStarted();
      hash.update(buffer);
      if (!sink.write(buffer))
        await new Promise((resolveDrain) => sink.once("drain", resolveDrain));
    },

    abort,

    /**
     * Confirms the digest and atomically publishes the file. Never called
     * after `abort()`; the caller's overall try/catch is expected to call
     * `abort()` on any error instead, including one `finish()` itself threw.
     */
    async finish() {
      if (!sink) {
        // A zero-byte "file" part: still a real, empty upload attempt.
        await ensureStarted();
      }
      await new Promise((resolveFinish, rejectFinish) => {
        sink.once("error", rejectFinish);
        sink.end(resolveFinish);
      });
      const actualSha256 = hash.digest("hex");
      if (actualSha256 !== declaredSha256) {
        await rm(partPath, { force: true });
        throw new CaptureStorageError(
          "checksum_mismatch",
          "The received bytes do not hash to the declared sha256.",
        );
      }
      const path = await publish(partPath, {
        sha256: actualSha256,
        byteSize,
      });
      return { path, sha256: actualSha256, byteSize };
    },
  };
}

/** Only used by tests that want to assert a file is genuinely absent. */
export async function captureFileExists(tenantId, sha256) {
  try {
    await stat(capturePathFor(tenantId, sha256));
    return true;
  } catch {
    return false;
  }
}

/**
 * 4 (resumable uploads, `api/uploads.md`): where one upload session's bytes
 * accumulate across several `PUT` calls, before their digest is known to be
 * correct. Deliberately outside the content-addressed tree above — the whole
 * reason that tree is keyed by `sha256` is that the id is only trustworthy
 * once fully received, which is exactly what this file is building towards.
 * Keyed by `(tenantId, uploadId)`, not by the declared digest, so two
 * sessions racing to upload the same bytes never share a part file before
 * either has proven anything.
 */
export function uploadPartPathFor(tenantId, uploadId) {
  if (!tenantIdPattern.test(String(tenantId || "")))
    throw new Error("A valid tenant id is required.");
  if (!uploadIdPattern.test(String(uploadId || "")))
    throw new Error("A valid upload id is required.");
  return join(capturesDirectory(), tenantId, "uploads", `${uploadId}.part`);
}

/**
 * The durable ground truth for "how many bytes has this session actually
 * received", independent of whatever `upload_sessions.offset_bytes` last
 * recorded. Every status/resume path reconciles against this rather than
 * trusting the database cache alone, so a crash between a chunk's write and
 * its row update self-heals on the next request (`0` for a session that has
 * not received its first chunk yet — no file, no error).
 */
export async function uploadPartByteSize(tenantId, uploadId) {
  try {
    const info = await stat(uploadPartPathFor(tenantId, uploadId));
    return info.size;
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
}

/**
 * Appends one already fully-buffered chunk (the caller reads the whole `PUT`
 * body into memory first — bounded by the session's own `chunkSize`, never
 * the whole file) to a resumable upload's part file. The caller is
 * responsible for confirming, in the same request, that `Upload-Offset`
 * equalled `uploadPartByteSize` immediately before calling this: appending
 * is a single `write(2)`-scale operation precisely so that a connection
 * dropped mid-chunk leaves the previous, already-durable offset untouched
 * rather than a half-written tail — the interrupted chunk is simply retried
 * whole from that same offset.
 */
export async function appendUploadChunk(tenantId, uploadId, buffer) {
  const partPath = uploadPartPathFor(tenantId, uploadId);
  await mkdir(dirname(partPath), { recursive: true });
  await new Promise((resolveWrite, rejectWrite) => {
    const stream = createWriteStream(partPath, { flags: "a" });
    stream.once("error", rejectWrite);
    stream.end(buffer, () => stream.close(() => resolveWrite()));
  });
}

/** Discards a session's accumulated bytes — a fresh restart after a hash mismatch, or the aftermath of a purged/expired session. Never called on a still-wanted transfer. */
export async function abortUploadPart(tenantId, uploadId) {
  await rm(uploadPartPathFor(tenantId, uploadId), { force: true });
}

/**
 * Computes the assembled part file's real digest and size WITHOUT touching
 * it — `finalize`'s hash-verification step. Deliberately does not rename or
 * delete anything: the caller decides what happens next (the capability/
 * entitlement gates in `upload-resources.js`'s `finalizeUpload` still run
 * after this, and must find the part file exactly as it was if they refuse,
 * so a client can retry finalize later without re-uploading).
 */
export async function hashUploadPart(tenantId, uploadId) {
  const partPath = uploadPartPathFor(tenantId, uploadId);
  const hash = createHash("sha256");
  let byteSize = 0;
  await new Promise((resolveRead, rejectRead) => {
    const stream = createReadStream(partPath);
    stream.on("data", (chunk) => {
      byteSize += chunk.length;
      hash.update(chunk);
    });
    stream.once("error", rejectRead);
    stream.once("end", resolveRead);
  });
  return { sha256: hash.digest("hex"), byteSize };
}

/**
 * The last step of a successful finalize: publishes an already
 * hash-verified part file into the content-addressed store, exactly like
 * `createCaptureSink`'s own `finish()`. Called only once every capability
 * gate has passed, so a part file is never renamed into place and then left
 * behind by a capture insert that did not happen.
 */
export async function publishUploadPart(tenantId, uploadId, sha256) {
  const partPath = uploadPartPathFor(tenantId, uploadId);
  const finalPath = capturePathFor(tenantId, sha256);
  await mkdir(dirname(finalPath), { recursive: true });
  // Same atomic-replace reasoning as createCaptureSink.finish(): a
  // concurrent duplicate publishing identical bytes is harmless.
  await rename(partPath, finalPath);
  return finalPath;
}

export function defaultUploadChunkBytes() {
  const raw = Number(process.env.ASTRO_PORTAL_UPLOAD_CHUNK_BYTES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 8 * 1024 * 1024;
}

// ——— The disk store: the functions above behind the four gestures ———

const derivedFileNames = Object.freeze({
  thumbnail: "thumbnail.webp",
  shared: "shared.jpg",
});

/**
 * The path of a reference (`capture-store.js`) in the captures directory:
 * the original in the content-addressed tree, a derived file beside it.
 */
export function capturePathOf({ tenantId, sha256, file = "original" }) {
  if (file === "original") return capturePathFor(tenantId, sha256);
  const name = derivedFileNames[file];
  if (!name) throw new Error(`"${file}" is not a file of a capture.`);
  return join(derivedDirectoryFor(tenantId, sha256), name);
}

/** The directory of one space's files in the captures directory. */
export function spaceDirectoryFor(tenantId) {
  if (!tenantIdPattern.test(String(tenantId || "")))
    throw new Error("A valid tenant id is required.");
  return join(capturesDirectory(), tenantId);
}

/**
 * Writes through a temporary sibling, then renames it into place: a reader
 * never meets half a file, and two writers of the same derived file leave
 * the same bytes.
 */
export async function writeAtomically(path, write) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await write(temporary);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const missing = (error) => error?.code === "ENOENT";

async function fileInfo(path) {
  try {
    const info = await stat(path);
    return info.isFile() ? info : null;
  } catch (error) {
    if (missing(error) || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

/**
 * The bytes of an upload being received, on this machine — the first
 * gesture of every store (`capture-store.js`): the disk store keeps them in
 * `<captures>/<space>/uploads/`, and so does a store that publishes
 * elsewhere, since a digest is checked before anything is published.
 */
export const diskStaging = Object.freeze({
  /** Appends `chunk` at `offset`, which must be the bytes already received. */
  async write({ tenantId, uploadId }, chunk, offset) {
    const received = await uploadPartByteSize(tenantId, uploadId);
    if (offset !== received)
      throw new CaptureStorageError(
        "upload_offset_mismatch",
        "This chunk does not start where the received bytes end.",
        { offset: received },
      );
    await appendUploadChunk(tenantId, uploadId, chunk);
    return received + chunk.length;
  },
  stagedBytes: ({ tenantId, uploadId }) =>
    uploadPartByteSize(tenantId, uploadId),
  stagedDigest: ({ tenantId, uploadId }) => hashUploadPart(tenantId, uploadId),
  stagedHead: ({ tenantId, uploadId }, length = MEDIA_HEAD_BYTES) =>
    readFileHead(uploadPartPathFor(tenantId, uploadId), length),
  discard: ({ tenantId, uploadId }) => abortUploadPart(tenantId, uploadId),
  stagedPathOf: ({ tenantId, uploadId }) =>
    uploadPartPathFor(tenantId, uploadId),
});

/**
 * The core's store (`capture-store.js`): every file in the captures
 * directory of this machine, read at each call. Nothing of today's layout
 * changes: the originals content-addressed, the derived files beside them,
 * the uploads in progress apart.
 */
export function createDiskCaptureStore() {
  return Object.freeze({
    kind: "disk",
    pathOf: capturePathOf,
    ...diskStaging,

    /**
     * Publishes the received bytes as the original of `sha256`, once their
     * size is the one expected (the digest was read by `stagedDigest`).
     * Bytes already published and no part left: nothing to do.
     */
    async finalize({ tenantId, uploadId, sha256, byteSize = null }) {
      const finalPath = capturePathFor(tenantId, sha256);
      const part = await fileInfo(uploadPartPathFor(tenantId, uploadId));
      if (!part) {
        const published = await fileInfo(finalPath);
        if (published && (byteSize == null || published.size === byteSize))
          return { sha256, byteSize: published.size, path: finalPath };
      }
      if (byteSize != null && part?.size !== byteSize)
        throw new CaptureStorageError(
          "checksum_mismatch",
          "The received bytes are not the size declared.",
        );
      const path = await publishUploadPart(tenantId, uploadId, sha256);
      return { sha256, byteSize: part?.size ?? byteSize, path };
    },

    sink: ({ tenantId, sha256, maxBytes }) =>
      createCaptureSink({ tenantId, declaredSha256: sha256, maxBytes }),

    async put(reference, write) {
      const path = capturePathOf(reference);
      await writeAtomically(path, write);
      return { path };
    },

    async stat(reference) {
      const info = await fileInfo(capturePathOf(reference));
      return info ? { size: info.size, lastModified: info.mtime } : null;
    },

    async read(reference, { start = null, end = null } = {}) {
      const path = capturePathOf(reference);
      const info = await fileInfo(path);
      if (!info) return null;
      const range = {};
      if (start != null) range.start = start;
      if (end != null) range.end = end;
      return {
        stream: createReadStream(path, range),
        size: info.size,
        lastModified: info.mtime,
      };
    },

    async head(reference, length = MEDIA_HEAD_BYTES) {
      try {
        return await readFileHead(capturePathOf(reference), length);
      } catch (error) {
        if (missing(error) || error?.code === "ENOTDIR") return null;
        throw error;
      }
    },

    withLocalFile: (reference, use) => use(capturePathOf(reference)),

    async remove({ tenantId, sha256, file = null }) {
      if (file === null || file === "original")
        await rm(capturePathFor(tenantId, sha256), { force: true });
      if (file === null || file === "derived")
        await removeDerivedFiles(tenantId, sha256);
      else if (file !== "original")
        await rm(capturePathOf({ tenantId, sha256, file }), { force: true });
    },

    async removeSpace(tenantId) {
      await rm(spaceDirectoryFor(tenantId), { recursive: true, force: true });
    },

    async spaceHolds(tenantId) {
      try {
        await stat(spaceDirectoryFor(tenantId));
        return true;
      } catch (error) {
        if (missing(error)) return false;
        throw error;
      }
    },

    /** The spaces that have a directory here (their ids). */
    async *listSpaces() {
      let entries;
      try {
        entries = await readdir(capturesDirectory(), { withFileTypes: true });
      } catch (error) {
        if (missing(error)) return;
        throw error;
      }
      for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1)))
        if (entry.isDirectory() && tenantIdPattern.test(entry.name))
          yield entry.name;
    },

    /**
     * Every file the space's directory holds as a capture's: `{ sha256,
     * file, size, lastModified }`, `file` being `original`, `thumbnail` or
     * `shared`. The uploads being received, the temporary files and
     * anything else are not listed.
     */
    async *list(tenantId) {
      const directory = spaceDirectoryFor(tenantId);
      const names = async (path) => {
        try {
          return (await readdir(path, { withFileTypes: true })).sort((a, b) =>
            a.name < b.name ? -1 : 1,
          );
        } catch (error) {
          if (missing(error) || error?.code === "ENOTDIR") return [];
          throw error;
        }
      };
      for (const first of await names(directory)) {
        if (!first.isDirectory()) continue;
        if (first.name === "derived") {
          for (const holder of await names(join(directory, "derived"))) {
            if (!holder.isDirectory() || !sha256Pattern.test(holder.name))
              continue;
            for (const [file, name] of Object.entries(derivedFileNames)) {
              const info = await fileInfo(
                join(directory, "derived", holder.name, name),
              );
              if (info)
                yield {
                  sha256: holder.name,
                  file,
                  size: info.size,
                  lastModified: info.mtime,
                };
            }
          }
          continue;
        }
        if (!/^[0-9a-f]{2}$/.test(first.name)) continue;
        for (const second of await names(join(directory, first.name))) {
          if (!second.isDirectory() || !/^[0-9a-f]{2}$/.test(second.name))
            continue;
          for (const leaf of await names(
            join(directory, first.name, second.name),
          )) {
            if (!leaf.isFile() || !sha256Pattern.test(leaf.name)) continue;
            if (!leaf.name.startsWith(first.name + second.name)) continue;
            const info = await fileInfo(
              join(directory, first.name, second.name, leaf.name),
            );
            if (info)
              yield {
                sha256: leaf.name,
                file: "original",
                size: info.size,
                lastModified: info.mtime,
              };
          }
        }
      }
    },
  });
}
