// Cleaning of the two image formats the sample carries, JPEG and PNG. The
// pixels are never decoded or recompressed: a cleaned file is the original's
// header segments (or chunks) that are on a short list of kept ones, its scan
// (or pixel chunks) copied byte for byte, and nothing after the end marker.
// Whatever is not on the list of kept parts is removed, known or not — a
// whitelist, so a camera that invents a new metadata block cannot slip one in.

export class ImageError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageError";
  }
}

export function sniffImage(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes.toString("latin1", 1, 4) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "png";
  return null;
}

export const imageExtension = (format) => (format === "jpeg" ? ".jpg" : ".png");

// ---------------------------------------------------------------- JPEG

const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

function jpegMarkerName(marker) {
  if (marker >= 0xe0 && marker <= 0xef) return `APP${marker - 0xe0}`;
  if (marker === 0xfe) return "COM";
  return `0x${marker.toString(16).padStart(2, "0")}`;
}

/** Splits a JPEG into its segments; each scan includes its entropy-coded data. */
function parseJpeg(bytes) {
  if (sniffImage(bytes) !== "jpeg") throw new ImageError("Not a JPEG file.");
  const segments = [];
  let position = 2;
  for (;;) {
    if (position + 1 >= bytes.length)
      throw new ImageError("Truncated JPEG: no end-of-image marker.");
    if (bytes[position] !== 0xff)
      throw new ImageError(
        `Corrupt JPEG: a marker was expected at byte ${position}.`,
      );
    while (bytes[position + 1] === 0xff) position += 1; // fill bytes
    const marker = bytes[position + 1];
    if (marker === 0xd9) {
      segments.push({ marker, start: position, end: position + 2 });
      return { segments, end: position + 2 };
    }
    if (marker === 0x00)
      throw new ImageError("Corrupt JPEG: a stuffed byte outside a scan.");
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push({ marker, start: position, end: position + 2 });
      position += 2;
      continue;
    }
    if (position + 4 > bytes.length)
      throw new ImageError("Truncated JPEG segment.");
    const length = bytes.readUInt16BE(position + 2);
    const segmentEnd = position + 2 + length;
    if (length < 2 || segmentEnd > bytes.length)
      throw new ImageError("Truncated JPEG segment.");
    if (marker === 0xda) {
      let scan = segmentEnd;
      for (;;) {
        const at = bytes.indexOf(0xff, scan);
        if (at < 0 || at + 1 >= bytes.length)
          throw new ImageError("Truncated JPEG: the scan never ends.");
        const next = bytes[at + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          scan = at + 2;
          continue;
        }
        if (next === 0xff) {
          scan = at + 1;
          continue;
        }
        scan = at;
        break;
      }
      segments.push({ marker, start: position, end: scan, isScan: true });
      position = scan;
      continue;
    }
    segments.push({
      marker,
      start: position,
      end: segmentEnd,
      payloadStart: position + 4,
    });
    position = segmentEnd;
  }
}

const startsWith = (bytes, start, text) =>
  bytes.toString("latin1", start, start + text.length) === text;

/** Whether a header segment of a JPEG is one of the kept ones. */
function jpegKeeps(bytes, segment) {
  const { marker } = segment;
  if (segment.isScan) return true;
  if (marker === 0xe0) return startsWith(bytes, segment.payloadStart, "JFIF\0");
  if (marker === 0xe2)
    return startsWith(bytes, segment.payloadStart, "ICC_PROFILE\0");
  if (marker === 0xee) return startsWith(bytes, segment.payloadStart, "Adobe");
  if (marker === 0xdb || marker === 0xc4 || marker === 0xcc) return true; // DQT, DHT, DAC
  if (marker === 0xdd || marker === 0xdc) return true; // DRI, DNL
  if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) return true; // SOFn
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return true;
  return false;
}

function cleanJpeg(bytes) {
  const { segments, end } = parseJpeg(bytes);
  if (
    !segments.some(
      (s) =>
        s.marker >= 0xc0 &&
        s.marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(s.marker),
    ) ||
    !segments.some((s) => s.isScan)
  )
    throw new ImageError("This JPEG holds no image data.");
  const kept = [JPEG_SOI];
  const removed = [];
  for (const segment of segments) {
    if (segment.marker === 0xd9) continue;
    if (jpegKeeps(bytes, segment))
      kept.push(bytes.subarray(segment.start, segment.end));
    else
      removed.push({
        part: jpegMarkerName(segment.marker),
        bytes: segment.end - segment.start,
      });
  }
  kept.push(JPEG_EOI);
  if (end < bytes.length)
    removed.push({ part: "trailing-bytes", bytes: bytes.length - end });
  return { format: "jpeg", bytes: Buffer.concat(kept), removed };
}

function inspectJpeg(bytes) {
  const problems = [];
  let parsed;
  try {
    parsed = parseJpeg(bytes);
  } catch (error) {
    return ["malformed: " + error.message];
  }
  for (const segment of parsed.segments) {
    if (segment.marker === 0xd9) continue;
    if (!jpegKeeps(bytes, segment))
      problems.push(`jpeg segment ${jpegMarkerName(segment.marker)}`);
  }
  if (parsed.end < bytes.length) problems.push("jpeg trailing bytes");
  return problems;
}

// ---------------------------------------------------------------- PNG

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
/** Critical chunks and the ancillary ones that change how pixels look (no text, no time, no EXIF). */
const PNG_KEPT = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "bKGD",
  "pHYs",
  "hIST",
  "acTL",
  "fcTL",
  "fdAT",
]);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(bytes) {
  if (sniffImage(bytes) !== "png") throw new ImageError("Not a PNG file.");
  const chunks = [];
  let position = 8;
  for (;;) {
    if (position + 12 > bytes.length)
      throw new ImageError("Truncated PNG: no IEND chunk.");
    const length = bytes.readUInt32BE(position);
    const end = position + 12 + length;
    if (end > bytes.length) throw new ImageError("Truncated PNG chunk.");
    const type = bytes.toString("latin1", position + 4, position + 8);
    if (!/^[A-Za-z]{4}$/.test(type))
      throw new ImageError("Corrupt PNG chunk type.");
    const expected = bytes.readUInt32BE(end - 4);
    if (crc32(bytes.subarray(position + 4, end - 4)) !== expected)
      throw new ImageError(`PNG checksum mismatch in chunk ${type}.`);
    chunks.push({ type, start: position, end });
    position = end;
    if (type === "IEND") return { chunks, end: position };
  }
}

function pngKeeps(chunk) {
  return PNG_KEPT.has(chunk.type);
}

function cleanPng(bytes) {
  const { chunks, end } = parsePng(bytes);
  if (
    chunks[0].type !== "IHDR" ||
    !chunks.some((chunk) => chunk.type === "IDAT")
  )
    throw new ImageError("This PNG holds no image data.");
  const kept = [PNG_SIGNATURE];
  const removed = [];
  for (const chunk of chunks) {
    if (pngKeeps(chunk)) kept.push(bytes.subarray(chunk.start, chunk.end));
    else if (chunk.type.charCodeAt(0) < 0x61)
      throw new ImageError(
        `PNG uses a critical chunk this tool does not know (${chunk.type}).`,
      );
    else removed.push({ part: chunk.type, bytes: chunk.end - chunk.start });
  }
  if (end < bytes.length)
    removed.push({ part: "trailing-bytes", bytes: bytes.length - end });
  return { format: "png", bytes: Buffer.concat(kept), removed };
}

function inspectPng(bytes) {
  let parsed;
  try {
    parsed = parsePng(bytes);
  } catch (error) {
    return ["malformed: " + error.message];
  }
  const problems = [];
  for (const chunk of parsed.chunks)
    if (!pngKeeps(chunk)) problems.push(`png chunk ${chunk.type}`);
  if (parsed.end < bytes.length) problems.push("png trailing bytes");
  return problems;
}

// ---------------------------------------------------------------- entry points

/** The cleaned bytes and what was removed; throws ImageError on anything else than JPEG or PNG. */
export function cleanImage(bytes) {
  const format = sniffImage(bytes);
  if (format === "jpeg") return cleanJpeg(bytes);
  if (format === "png") return cleanPng(bytes);
  throw new ImageError("Only JPEG and PNG images are part of the sample.");
}

/** What a file still carries that a cleaned image must not (independent of the cleaning above). */
export function inspectImage(bytes) {
  const format = sniffImage(bytes);
  if (format === "jpeg") return { format, problems: inspectJpeg(bytes) };
  if (format === "png") return { format, problems: inspectPng(bytes) };
  return { format: null, problems: ["not a JPEG or PNG image"] };
}
