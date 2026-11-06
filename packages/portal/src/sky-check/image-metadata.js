/**
 * The EXIF and XMP of an image file, read for the sky check: the camera's
 * maker and model, the exposure time and sensitivity, the processing
 * software, whether GPS is recorded, and whether the file is a camera's
 * raw file (CR2, NEF, ARW, DNG: TIFF structures). JPEG (APP1), PNG
 * (`eXIf`, `tEXt`/`iTXt`), WebP (`EXIF`, `XMP `) and TIFF are read; AVIF
 * keeps its metadata in boxes this reader does not walk.
 *
 * Every value is a signal, never a proof: metadata is whatever the file's
 * last program wrote, and it can be removed or changed by anyone. The
 * verdict keeps derived signals only (a maker class, an exposure class,
 * booleans), never a value read here.
 */

const TAG = {
  make: 0x010f,
  model: 0x0110,
  software: 0x0131,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  xmp: 0x02bc,
  dngVersion: 0xc612,
  exposureTime: 0x829a,
  iso: 0x8827,
  lensModel: 0xa434,
  gpsLatitude: 0x0002,
};

const TYPE_BYTES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
const MAX_IFD_ENTRIES = 512;

/** A reader of `length` bytes at `offset` over a buffer. */
export function bufferReader(buffer) {
  return {
    size: buffer.length,
    readAt: async (offset, length) =>
      buffer.subarray(
        Math.max(0, offset),
        Math.max(0, Math.min(buffer.length, offset + length)),
      ),
  };
}

/**
 * The tags of a TIFF structure that starts at byte `base` of `reader`
 * (a TIFF file starts at 0; a JPEG's EXIF block after `Exif\0\0`).
 * Answers `null` when the structure is not TIFF.
 */
export async function readTiffTags(reader, base = 0) {
  const header = await reader.readAt(base, 10);
  if (header.length < 8) return null;
  const order = header.toString("latin1", 0, 2);
  const little = order === "II";
  if (!little && order !== "MM") return null;
  const u16 = (buffer, at) =>
    little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
  const u32 = (buffer, at) =>
    little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
  const magic = u16(header, 2);
  if (magic === 43) return { bigTiff: true, tags: new Map(), little };
  if (magic !== 42) return null;

  async function readIfd(offset) {
    const tags = new Map();
    if (!offset || offset + 2 > reader.size - base) return tags;
    const countBytes = await reader.readAt(base + offset, 2);
    if (countBytes.length < 2) return tags;
    const count = Math.min(u16(countBytes, 0), MAX_IFD_ENTRIES);
    const entries = await reader.readAt(base + offset + 2, count * 12);
    for (let index = 0; index + 12 <= entries.length; index += 12) {
      const tag = u16(entries, index);
      const type = u16(entries, index + 2);
      const items = u32(entries, index + 4);
      const size = (TYPE_BYTES[type] ?? 1) * items;
      let data;
      if (size <= 4) data = entries.subarray(index + 8, index + 8 + size);
      else if (size <= 1 << 20)
        data = await reader.readAt(base + u32(entries, index + 8), size);
      else continue;
      tags.set(tag, { type, items, data });
    }
    return tags;
  }

  const value = (entry) => {
    if (!entry) return null;
    const { type, data } = entry;
    if (type === 2)
      return data.toString("latin1").replace(/\0.*$/s, "").trim() || null;
    if (type === 3 && data.length >= 2) return u16(data, 0);
    if (type === 4 && data.length >= 4) return u32(data, 0);
    if ((type === 5 || type === 10) && data.length >= 8) {
      const numerator = u32(data, 0);
      const denominator = u32(data, 4);
      return denominator ? numerator / denominator : null;
    }
    if (type === 1 || type === 7) return data;
    return null;
  };

  const ifd0 = await readIfd(u32(header, 4));
  const exifOffset = value(ifd0.get(TAG.exifIfd));
  const exif =
    typeof exifOffset === "number" ? await readIfd(exifOffset) : new Map();
  const gpsOffset = value(ifd0.get(TAG.gpsIfd));
  const gps =
    typeof gpsOffset === "number" ? await readIfd(gpsOffset) : new Map();
  const xmpEntry = ifd0.get(TAG.xmp);
  return {
    bigTiff: false,
    little,
    // A Canon CR2 is a TIFF with « CR » right after its header.
    canonRaw: header.toString("latin1", 8, 10) === "CR",
    make: value(ifd0.get(TAG.make)),
    model: value(ifd0.get(TAG.model)),
    software: value(ifd0.get(TAG.software)),
    dng: ifd0.has(TAG.dngVersion),
    exposureSeconds: value(exif.get(TAG.exposureTime)),
    iso: value(exif.get(TAG.iso)),
    lensModel: value(exif.get(TAG.lensModel)),
    gps: gps.has(TAG.gpsLatitude),
    xmp: xmpEntry ? xmpEntry.data.toString("utf8") : null,
  };
}

/** The processing program an XMP packet names (`CreatorTool`). */
export function xmpCreatorTool(xmp) {
  if (!xmp) return null;
  const match =
    /<xmp:CreatorTool>([^<]*)<\/xmp:CreatorTool>/i.exec(xmp) ||
    /\bxmp:CreatorTool\s*=\s*"([^"]*)"/i.exec(xmp);
  return match ? match[1].trim() || null : null;
}

/** Whether an XMP packet carries a position (`exif:GPSLatitude`). */
const xmpHasGps = (xmp) => Boolean(xmp && /exif:GPSLatitude/i.test(xmp));

async function jpegMetadata(reader) {
  let offset = 2;
  let tiff = null;
  let xmp = null;
  for (let guard = 0; guard < 64 && offset + 4 <= reader.size; guard += 1) {
    const marker = await reader.readAt(offset, 4);
    if (marker.length < 4 || marker[0] !== 0xff) break;
    const kind = marker[1];
    if (kind === 0xd8 || (kind >= 0xd0 && kind <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (kind === 0xda || kind === 0xd9) break; // start of scan: no more metadata
    const length = marker.readUInt16BE(2);
    if (kind === 0xe1) {
      const segment = await reader.readAt(offset + 4, length - 2);
      if (segment.toString("latin1", 0, 6) === "Exif\0\0" && !tiff)
        tiff = await readTiffTags(bufferReader(segment.subarray(6)));
      else if (
        segment.toString("latin1", 0, 29) === "http://ns.adobe.com/xap/1.0/\0"
      )
        xmp = segment.toString("utf8", 29);
    }
    offset += 2 + length;
  }
  return { tiff, xmp };
}

async function pngMetadata(reader) {
  let offset = 8;
  let tiff = null;
  let xmp = null;
  let software = null;
  for (let guard = 0; guard < 256 && offset + 8 <= reader.size; guard += 1) {
    const head = await reader.readAt(offset, 8);
    if (head.length < 8) break;
    const length = head.readUInt32BE(0);
    const type = head.toString("latin1", 4, 8);
    if (type === "IDAT" || type === "IEND") break;
    if (length <= 1 << 20) {
      if (type === "eXIf") {
        const data = await reader.readAt(offset + 8, length);
        tiff = await readTiffTags(bufferReader(data));
      } else if (type === "tEXt" || type === "iTXt") {
        const data = await reader.readAt(offset + 8, length);
        const zero = data.indexOf(0);
        const keyword = data.toString("latin1", 0, Math.max(0, zero));
        if (keyword === "Software") {
          software = data
            .toString("latin1", zero + 1)
            .replace(/\0/g, "")
            .trim();
        } else if (keyword === "XML:com.adobe.xmp") {
          xmp = data.toString("utf8", zero + 1);
        }
      }
    }
    offset += 12 + length;
  }
  return { tiff, xmp, software };
}

async function webpMetadata(reader) {
  let offset = 12;
  let tiff = null;
  let xmp = null;
  for (let guard = 0; guard < 64 && offset + 8 <= reader.size; guard += 1) {
    const head = await reader.readAt(offset, 8);
    if (head.length < 8) break;
    const type = head.toString("latin1", 0, 4);
    const length = head.readUInt32LE(4);
    if (length <= 1 << 20) {
      if (type === "EXIF") {
        let data = await reader.readAt(offset + 8, length);
        if (data.toString("latin1", 0, 6) === "Exif\0\0")
          data = data.subarray(6);
        tiff = await readTiffTags(bufferReader(data));
      } else if (type === "XMP ") {
        xmp = (await reader.readAt(offset + 8, length)).toString("utf8");
      }
    }
    offset += 8 + length + (length % 2);
  }
  return { tiff, xmp };
}

/** The extensions of the camera raw files Astro Sync sends (TIFF structures). */
export const RAW_EXTENSIONS = new Set(["cr2", "nef", "arw", "dng"]);

/**
 * The metadata of an image file, from a reader over the file and its
 * raster type (`rasterImageTypeOf`, or `null` for a TIFF-structured raw a
 * browser cannot show): `{ make, model, software, exposureSeconds, iso,
 * gps, raw }` where `raw` is `cr2`, `nef`, `arw`, `dng` or `null`.
 */
export async function readImageMetadata(reader, { type, extension } = {}) {
  let found = { tiff: null, xmp: null, software: null };
  try {
    if (type === "image/jpeg") found = await jpegMetadata(reader);
    else if (type === "image/png") found = await pngMetadata(reader);
    else if (type === "image/webp") found = await webpMetadata(reader);
    else if (type === "image/tiff" || type === null)
      found = { tiff: await readTiffTags(reader), xmp: null };
  } catch {
    // A damaged block is the same as no metadata: a signal, never a proof.
  }
  const tiff = found.tiff;
  const xmp = found.xmp || tiff?.xmp || null;
  const make = tiff?.make || null;
  const ext = String(extension || "").toLowerCase();
  let raw = null;
  if (tiff && !tiff.bigTiff) {
    if (tiff.canonRaw) raw = "cr2";
    else if (tiff.dng) raw = "dng";
    else if (RAW_EXTENSIONS.has(ext) && /^nikon/i.test(make || "")) raw = "nef";
    else if (RAW_EXTENSIONS.has(ext) && /^sony/i.test(make || "")) raw = "arw";
    else if (RAW_EXTENSIONS.has(ext)) raw = ext;
  }
  return {
    make,
    model: tiff?.model || null,
    software: tiff?.software || found.software || xmpCreatorTool(xmp),
    exposureSeconds:
      typeof tiff?.exposureSeconds === "number" ? tiff.exposureSeconds : null,
    iso: typeof tiff?.iso === "number" ? tiff.iso : null,
    gps: Boolean(tiff?.gps) || xmpHasGps(xmp),
    hasExif: Boolean(tiff),
    raw,
  };
}

const PHONE_MAKERS =
  /^(?:apple|samsung|google|huawei|honor|xiaomi|redmi|poco|oneplus|oppo|vivo|realme|motorola|lge|lg electronics|nokia|hmd global|fairphone|asus|zte|nothing|tecno|infinix|sharp|fcnt|kyocera)\b/i;
const CAMERA_MAKERS =
  /^(?:canon|nikon|sony|fujifilm|olympus|om digital|panasonic|pentax|ricoh|leica|sigma|hasselblad|dji|gopro|kodak|minolta|konica|casio|samsung techwin|phase one|zwo|qhy|player one|touptek|svbony)\b/i;
const ASTRO_SOFTWARE =
  /pixinsight|siril|deep ?sky ?stacker|astro ?pixel ?processor|sequator|starry ?landscape|asiair|asistudio|asi ?studio|sharpcap|n\.i\.n\.a|nighttime imaging|graxpert|starnet|astap|maxim ?dl|nebulosity|seestar|vaonis|vespera|stellina|singularity|dwarf ?lab|unistellar|registax|autostakkert|firecapture|astrosurface|imppg|astroart|theli|starstax|astro ?photography ?tool|kstars|ekos|ccdciel|sequence generator|astrometry\.net|planetary ?system ?stacker|affinity photo.*astro/i;

/**
 * The derived signals the verdict keeps: never a maker, a model, a
 * program's name or a number read from the file, only classes.
 */
export function metadataSignals(metadata) {
  const make = metadata.make || "";
  const exposure = metadata.exposureSeconds;
  return {
    hasExif: metadata.hasExif,
    makerClass: !make
      ? "none"
      : PHONE_MAKERS.test(make)
        ? "phone"
        : CAMERA_MAKERS.test(make)
          ? "camera"
          : "other",
    exposureClass:
      typeof exposure !== "number"
        ? "none"
        : exposure < 1 / 30
          ? "short"
          : exposure < 1
            ? "medium"
            : "long",
    highIso: typeof metadata.iso === "number" && metadata.iso >= 1600,
    astroSoftware: ASTRO_SOFTWARE.test(metadata.software || ""),
    gps: metadata.gps,
    raw: metadata.raw,
  };
}

/**
 * The processing program a photo names (`Software`, XMP
 * `CreatorTool`), kept as the proposal of the capture's
 * `processing.software` with the source `photo` (« D'après la photo »).
 * Never a GPS value nor a date: only this one name, trimmed, 120
 * characters at most (a longer one is not shortened: it is left out).
 */
export function photoSoftware(metadata) {
  const text =
    typeof metadata?.software === "string"
      ? metadata.software.replace(/\0/g, "").trim()
      : "";
  if (!text || [...text].length > 120) return null;
  return text;
}

/**
 * `photoSoftware` of an image file on disk (`path`), its raster type read
 * from its first bytes; `null` for a file that names none — the cleaned
 * PNG of the import, a FITS — or that cannot be read.
 */
export async function readPhotoSoftware(path, { extension = "" } = {}) {
  const { open } = await import("node:fs/promises");
  const { rasterImageTypeOf } = await import("../uploads/media-type.js");
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    const reader = {
      size,
      async readAt(offset, length) {
        const start = Math.max(0, offset);
        const bounded = Math.max(0, Math.min(length, size - start));
        const buffer = Buffer.alloc(bounded);
        if (!bounded) return buffer;
        const { bytesRead } = await handle.read(buffer, 0, bounded, start);
        return buffer.subarray(0, bytesRead);
      },
    };
    const head = await reader.readAt(0, 64);
    const type = rasterImageTypeOf(head);
    const tiffLike =
      head.length >= 4 && ["II", "MM"].includes(head.toString("latin1", 0, 2));
    if (!type && !tiffLike) return null;
    return photoSoftware(
      await readImageMetadata(reader, { type: type ?? null, extension }),
    );
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}
