import { inflateRawSync } from "node:zlib";
import { crc32 } from "../data-export/zip.js";

/**
 * A ZIP reader of our own, for « Importer mes données »: the counterpart of
 * the writer of « Exporter mes données » (`../data-export/zip.js`), without
 * a dependency. It reads the end record, then the central directory, and
 * for each entry its local header and its bytes — stored or raw deflate
 * through `node:zlib` — and checks the size and the CRC-32 the directory
 * announces. What it does not read (ZIP64, encryption, another compression,
 * a name twice) is refused: the file is then not an export this portal can
 * read.
 */

/** A file this reader cannot take: `reason` says why, `entry` names the entry. */
export class ZipReadError extends Error {
  constructor(reason, message, { entry = null } = {}) {
    super(message);
    this.name = "ZipReadError";
    this.reason = reason;
    this.entry = entry;
  }
}

/** The archive's content is larger than the reader's ceiling. */
export class ZipTooLargeError extends Error {
  constructor(limit) {
    super(`The archive's content exceeds ${limit} bytes.`);
    this.name = "ZipTooLargeError";
    this.limit = limit;
  }
}

const END = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const END_SIZE = 22;
const ENCRYPTED = 0x0001;
const STORED = 0;
const DEFLATE = 8;

/**
 * The ceiling of what an archive may hold once inflated (512 MiB): a
 * technical bound that keeps a small file announcing huge entries from
 * filling the memory of the service. A person's own records stay far
 * below it.
 */
export const ZIP_CONTENT_LIMIT = 512 * 1024 * 1024;

function endRecord(bytes) {
  const lowest = Math.max(0, bytes.length - END_SIZE - 0xffff);
  for (let at = bytes.length - END_SIZE; at >= lowest; at -= 1)
    if (bytes.readUInt32LE(at) === END) return at;
  throw new ZipReadError("not_a_zip", "No end of central directory record.");
}

/**
 * The entries of a ZIP as a `Map` of name → bytes, in the order of its
 * central directory. Directories (a name ending with `/`) are left out.
 * Throws `ZipReadError` for a file that is not a ZIP this reader takes, or
 * whose entry is damaged (`reason: "damaged"`), and `ZipTooLargeError`
 * above `limit` bytes of content.
 */
export function readZip(input, { limit = ZIP_CONTENT_LIMIT } = {}) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  if (bytes.length < END_SIZE)
    throw new ZipReadError("not_a_zip", "Too short to be a ZIP.");
  const end = endRecord(bytes);
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (
    count === 0xffff ||
    directoryOffset === 0xffffffff ||
    directoryOffset + directorySize > end
  )
    throw new ZipReadError("not_a_zip", "Unreadable central directory.");

  const entries = new Map();
  let total = 0;
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== CENTRAL)
      throw new ZipReadError("not_a_zip", "Unreadable central directory.");
    const flags = bytes.readUInt16LE(at + 8);
    const method = bytes.readUInt16LE(at + 10);
    const checksum = bytes.readUInt32LE(at + 16);
    const packedSize = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localOffset = bytes.readUInt32LE(at + 42);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (entries.has(name))
      throw new ZipReadError("not_a_zip", "A name appears twice.", {
        entry: name,
      });
    if (flags & ENCRYPTED)
      throw new ZipReadError("unsupported", "Encrypted entry.", {
        entry: name,
      });
    if (method !== STORED && method !== DEFLATE)
      throw new ZipReadError("unsupported", "Unsupported compression.", {
        entry: name,
      });
    if (size === 0xffffffff || packedSize === 0xffffffff)
      throw new ZipReadError("unsupported", "ZIP64 entry.", { entry: name });
    total += size;
    if (total > limit) throw new ZipTooLargeError(limit);

    if (
      localOffset + 30 > bytes.length ||
      bytes.readUInt32LE(localOffset) !== LOCAL
    )
      throw new ZipReadError("damaged", "Missing local header.", {
        entry: name,
      });
    const start =
      localOffset +
      30 +
      bytes.readUInt16LE(localOffset + 26) +
      bytes.readUInt16LE(localOffset + 28);
    if (start + packedSize > bytes.length)
      throw new ZipReadError("damaged", "Truncated entry.", { entry: name });
    const packed = bytes.subarray(start, start + packedSize);
    let data;
    try {
      data =
        method === STORED
          ? Buffer.from(packed)
          : inflateRawSync(packed, { maxOutputLength: Math.max(size, 1) });
    } catch {
      throw new ZipReadError("damaged", "The entry does not inflate.", {
        entry: name,
      });
    }
    if (data.length !== size || crc32(data) !== checksum)
      throw new ZipReadError("damaged", "Size or CRC-32 mismatch.", {
        entry: name,
      });
    entries.set(name, data);
  }
  return entries;
}
