import { deflateRawSync } from "node:zlib";

/**
 * A ZIP writer of our own, for « Exporter mes données »: no dependency
 * (deflate from `node:zlib`, the CRC-32 computed here): for each
 * entry a local header and its deflated bytes, then the central directory
 * and its end record. Names are UTF-8 (general purpose bit 11); no ZIP64:
 * a person's own records stay far below 4 GB.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** The CRC-32 (IEEE 802.3, the ZIP's) of some bytes, as an unsigned integer. */
export function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes)
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** The CRC-32 of a text's UTF-8 bytes (the fixture `data-export-crc32`). */
export function dataExportCrc32({ text } = {}) {
  return crc32(new TextEncoder().encode(String(text ?? "")));
}

/** MS-DOS time and date of an instant, read in UTC (the file is the same everywhere). */
function dosStamp(instant) {
  const at =
    instant instanceof Date && !Number.isNaN(instant.getTime())
      ? instant
      : new Date(0);
  const year = Math.min(Math.max(at.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (at.getUTCHours() << 11) |
      (at.getUTCMinutes() << 5) |
      Math.floor(at.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

const VERSION = 20;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;

/**
 * The archive of `entries` (`{ name, data }`, `data` a string — written as
 * UTF-8 — or bytes), every entry deflated and dated `modifiedAt`.
 */
export function zipArchive(entries, { modifiedAt = new Date() } = {}) {
  const { time, date } = dosStamp(modifiedAt);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(String(entry.name), "utf8");
    const raw =
      typeof entry.data === "string"
        ? Buffer.from(entry.data, "utf8")
        : Buffer.from(entry.data ?? []);
    const packed = deflateRawSync(raw);
    const checksum = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION, 4);
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + packed.length;
  }
  const directorySize = centrals.reduce((size, part) => size + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

/**
 * What one entry adds to an archive: its two headers, its name twice and
 * its deflated bytes — the « environ » of the file line, box by box.
 */
export function zipEntrySize(name, data) {
  const nameLength = Buffer.byteLength(String(name), "utf8");
  const raw =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return 30 + 46 + 2 * nameLength + deflateRawSync(raw).length;
}

/** The fixed part of an archive: its end record. */
export const ZIP_END_SIZE = 22;
