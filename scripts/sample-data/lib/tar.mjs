// A small ustar + gzip writer and a strict reader, without dependency. The
// writer produces the same bytes for the same files, whatever the machine or
// the day (sorted names, fixed times, a fixed gzip header). The reader is the
// one thing the installer trusts an archive to: it accepts regular files and
// folders with plain names, and refuses everything else (links, devices,
// extended headers, a path that leaves the folder, a wrong checksum).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import { createGunzip, createGzip } from "node:zlib";

const BLOCK = 512;
/** 2000-01-01T00:00:00Z: every entry carries this time, so nothing depends on the day of the build. */
const FIXED_MTIME = 946684800;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

export class TarError extends Error {
  constructor(message) {
    super(message);
    this.name = "TarError";
  }
}

/** Validates the path of an entry: relative, plain segments, no dot segments. */
export function assertSafeEntryPath(path) {
  if (typeof path !== "string" || !path || path.length > 255)
    throw new TarError("An entry has an unusable path.");
  const segments = path.split("/");
  for (const segment of segments) {
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      !SEGMENT.test(segment)
    )
      throw new TarError(
        `Refused entry path (not a plain relative path): ${JSON.stringify(path)}.`,
      );
  }
  return path;
}

function octal(value, width) {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

function splitName(path) {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  for (
    let index = path.lastIndexOf("/");
    index > 0;
    index = path.lastIndexOf("/", index - 1)
  ) {
    const prefix = path.slice(0, index);
    const name = path.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100)
      return { name, prefix };
  }
  throw new TarError(
    `This path is too long for a ustar archive: ${path.length} characters.`,
  );
}

function headerFor(path, size) {
  const { name, prefix } = splitName(path);
  const header = Buffer.alloc(BLOCK);
  header.write(name, 0, "utf8");
  header.write("0000644\0", 100, "latin1");
  header.write("0000000\0", 108, "latin1");
  header.write("0000000\0", 116, "latin1");
  header.write(octal(size, 12), 124, "latin1");
  header.write(octal(FIXED_MTIME, 12), 136, "latin1");
  header.fill(0x20, 148, 156);
  header.write("0", 156, "latin1");
  header.write("ustar\0", 257, "latin1");
  header.write("00", 263, "latin1");
  header.write("0000000\0", 329, "latin1");
  header.write("0000000\0", 337, "latin1");
  header.write(prefix, 345, "utf8");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(octal(sum, 7).slice(0, 6) + "\0 ", 148, "latin1");
  return header;
}

/** Fixes the bytes of the gzip header that would differ from one machine to another. */
function fixedGzipHeader() {
  let first = true;
  return new Transform({
    transform(chunk, _encoding, callback) {
      if (first) {
        first = false;
        chunk = Buffer.from(chunk);
        if (chunk.length >= 10) {
          chunk.fill(0, 4, 8); // modification time
          chunk[8] = 0; // extra flags
          chunk[9] = 3; // Unix
        }
      }
      callback(null, chunk);
    },
  });
}

/**
 * Writes `entries` ({ path, bytes } or { path, size, read }) as a tar.gz,
 * sorted by path, and returns the size and SHA-256 of the archive.
 */
export async function writeTarGz(outFile, entries) {
  const sorted = [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
  const seen = new Set();
  for (const entry of sorted) {
    assertSafeEntryPath(entry.path);
    if (seen.has(entry.path))
      throw new TarError(`Duplicate path in the archive: ${entry.path}.`);
    seen.add(entry.path);
    splitName(entry.path);
  }
  async function* blocks() {
    for (const entry of sorted) {
      const bytes = entry.bytes ?? (await entry.read());
      yield headerFor(entry.path, bytes.length);
      yield bytes;
      const padding = (BLOCK - (bytes.length % BLOCK)) % BLOCK;
      if (padding) yield Buffer.alloc(padding);
    }
    yield Buffer.alloc(BLOCK * 2);
  }
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const measure = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      sizeBytes += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.from(blocks()),
    createGzip({ level: 9 }),
    fixedGzipHeader(),
    measure,
    createWriteStream(outFile),
  );
  return { sizeBytes, sha256: hash.digest("hex") };
}

class ByteQueue {
  #chunks = [];
  length = 0;
  push(chunk) {
    this.#chunks.push(chunk);
    this.length += chunk.length;
  }
  take(count) {
    if (count === 0) return Buffer.alloc(0);
    const taken = [];
    let have = 0;
    while (have < count) {
      const chunk = this.#chunks.shift();
      if (have + chunk.length <= count) {
        taken.push(chunk);
        have += chunk.length;
      } else {
        const cut = count - have;
        taken.push(chunk.subarray(0, cut));
        this.#chunks.unshift(chunk.subarray(cut));
        have = count;
      }
    }
    this.length -= count;
    return taken.length === 1 ? taken[0] : Buffer.concat(taken);
  }
}

const field = (block, start, end) => {
  const raw = block.subarray(start, end);
  const nul = raw.indexOf(0);
  return raw.subarray(0, nul < 0 ? raw.length : nul).toString("utf8");
};

function parseHeader(block) {
  let expected = 0;
  for (let index = 0; index < BLOCK; index += 1)
    expected += index >= 148 && index < 156 ? 0x20 : block[index];
  const stored = parseInt(field(block, 148, 156).trim() || "x", 8);
  if (stored !== expected) throw new TarError("Tar header checksum mismatch.");
  if (block.toString("latin1", 257, 262) !== "ustar")
    throw new TarError("Not a ustar archive.");
  const type = String.fromCharCode(block[156] || 0x30);
  if (type !== "0" && type !== "5")
    throw new TarError(
      `Refused entry: not a regular file or a folder (type ${JSON.stringify(type)}).`,
    );
  if (block[124] & 0x80)
    throw new TarError("Refused entry: unsupported size encoding.");
  const sizeText = field(block, 124, 136).trim();
  if (!/^[0-7]+$/.test(sizeText))
    throw new TarError("Refused entry: unreadable size.");
  const size = parseInt(sizeText, 8);
  const name = field(block, 0, 100);
  const prefix = field(block, 345, 500);
  let path = prefix ? `${prefix}/${name}` : name;
  if (type === "5") {
    if (size !== 0) throw new TarError("Refused entry: a folder with content.");
    if (path.endsWith("/")) path = path.slice(0, -1);
  }
  assertSafeEntryPath(path);
  return { path, size, type: type === "5" ? "directory" : "file" };
}

/**
 * Reads a tar.gz and calls `onEntry({ path, type, size, bytes })` for each
 * entry in order (folders have no bytes). Refuses whatever does not meet the
 * rules above, and archives beyond the limits.
 */
export async function readTarGz(
  archivePath,
  onEntry,
  {
    maxEntries = 10000,
    maxFileBytes = 250_000_000,
    maxTotalBytes = 400_000_000,
  } = {},
) {
  const source = createReadStream(archivePath).pipe(createGunzip());
  const iterator = source[Symbol.asyncIterator]();
  const queue = new ByteQueue();
  let unpacked = 0;
  const need = async (count) => {
    while (queue.length < count) {
      const { done, value } = await iterator.next();
      if (done) return false;
      unpacked += value.length;
      if (unpacked > maxTotalBytes)
        throw new TarError("The archive is too large once unpacked.");
      queue.push(value);
    }
    return true;
  };
  const seen = new Set();
  let entries = 0;
  try {
    for (;;) {
      if (!(await need(BLOCK)))
        throw new TarError("Truncated archive: no end of archive marker.");
      const block = queue.take(BLOCK);
      if (block.every((byte) => byte === 0)) {
        if (!(await need(BLOCK)))
          throw new TarError("Truncated archive: no end of archive marker.");
        queue.take(BLOCK);
        return;
      }
      const header = parseHeader(block);
      entries += 1;
      if (entries > maxEntries)
        throw new TarError(
          `The archive holds more than ${maxEntries} entries.`,
        );
      if (seen.has(header.path))
        throw new TarError(`Duplicate path in the archive: ${header.path}.`);
      seen.add(header.path);
      if (header.size > maxFileBytes)
        throw new TarError(`An entry is larger than ${maxFileBytes} bytes.`);
      const padded = Math.ceil(header.size / BLOCK) * BLOCK;
      if (!(await need(padded)))
        throw new TarError("Truncated archive: an entry is cut short.");
      const content = queue.take(padded);
      await onEntry({
        path: header.path,
        type: header.type,
        size: header.size,
        bytes: content.subarray(0, header.size),
      });
    }
  } finally {
    source.destroy();
  }
}
