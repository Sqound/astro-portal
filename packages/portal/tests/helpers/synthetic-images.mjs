import { crc32 } from "node:zlib";
import sharp from "sharp";

/**
 * Images made inside the tests: a field of stars, and the metadata a camera
 * or a program leaves in a file — a position in the EXIF and in the XMP, an
 * IPTC record, a PNG text chunk — so that the tests can prove that the
 * files derived from a capture carry none of it. The position is the
 * captures' own, in the middle of the Atlantic.
 */

/** A seeded generator: the same field at every run. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Grey pixels (0–255) of a dark sky with `stars` round stars. */
export function starPixels({ width, height, stars = 200, seed = 5 }) {
  const next = random(seed);
  const pixels = new Uint8Array(width * height);
  for (let index = 0; index < pixels.length; index += 1)
    pixels[index] = 12 + Math.floor(next() * 6);
  for (let star = 0; star < stars; star += 1) {
    const x = 3 + Math.floor(next() * (width - 6));
    const y = 3 + Math.floor(next() * (height - 6));
    for (let dy = -2; dy <= 2; dy += 1)
      for (let dx = -2; dx <= 2; dx += 1) {
        const value = 230 * Math.exp(-(dx * dx + dy * dy) / 2);
        const at = (y + dy) * width + x + dx;
        pixels[at] = Math.min(255, pixels[at] + Math.round(value));
      }
  }
  return pixels;
}

/** A colour star field as a `sharp` pipeline, `width` × `height`. */
export function starField({ width, height, seed = 5 }) {
  return sharp(Buffer.from(starPixels({ width, height, seed })), {
    raw: { width, height, channels: 1 },
  }).toColourspace("srgb");
}

export const XMP_WITH_POSITION = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:exif="http://ns.adobe.com/exif/1.0/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" exif:GPSLatitude="45,0.0N" exif:GPSLongitude="30,0.0W" photoshop:City="Col des Mélèzes"/></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

/** The EXIF of a camera: its serial, a comment, and a position. */
export const EXIF_WITH_POSITION = {
  IFD0: {
    Make: "Exemple",
    Model: "Caméra de test",
    ImageDescription: "Col des Mélèzes",
  },
  IFD2: { BodySerialNumber: "SN-000-TEST", UserComment: "Camping du Lac Noir" },
  IFD3: {
    GPSLatitudeRef: "N",
    GPSLatitude: "45/1 0/1 0/1",
    GPSLongitudeRef: "W",
    GPSLongitude: "30/1 0/1 0/1",
  },
};

/**
 * Adds an IPTC record (APP13, « Photoshop 3.0 », resource 0x0404) naming a
 * city to a JPEG, right after its start marker: `sharp` writes none itself.
 */
export function withIptc(jpeg, city = "Col des Mélèzes") {
  const value = Buffer.from(city, "utf8");
  const record = Buffer.concat([
    Buffer.from([0x1c, 0x02, 0x5a, value.length >> 8, value.length & 0xff]),
    value,
  ]);
  const padded =
    record.length % 2 ? Buffer.concat([record, Buffer.alloc(1)]) : record;
  const size = Buffer.alloc(4);
  size.writeUInt32BE(record.length);
  const resource = Buffer.concat([
    Buffer.from("8BIM", "latin1"),
    Buffer.from([0x04, 0x04, 0x00, 0x00]),
    size,
    padded,
  ]);
  const payload = Buffer.concat([
    Buffer.from("Photoshop 3.0\0", "latin1"),
    resource,
  ]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([0xff, 0xed]),
    length,
    payload,
    jpeg.subarray(2),
  ]);
}

/** Adds a `tEXt` chunk (`keyword`, `text`) before a PNG's `IEND`. */
export function withPngText(png, keyword, text) {
  const data = Buffer.concat([
    Buffer.from(keyword, "latin1"),
    Buffer.from([0]),
    Buffer.from(text, "latin1"),
  ]);
  const type = Buffer.from("tEXt", "latin1");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, data])));
  const end = png.length - 12;
  return Buffer.concat([
    png.subarray(0, end),
    length,
    type,
    data,
    crc,
    png.subarray(end),
  ]);
}

/** A JPEG with a position in its EXIF and its XMP, and an IPTC record. */
export async function jpegWithPosition({ width, height, orientation = null }) {
  let pipeline = starField({ width, height }).withExif(EXIF_WITH_POSITION);
  if (orientation) pipeline = pipeline.withMetadata({ orientation });
  const jpeg = await pipeline.withXmp(XMP_WITH_POSITION).jpeg().toBuffer();
  return withIptc(jpeg);
}

/**
 * A 16-bit RGB TIFF written by hand (`sharp` writes 8-bit TIFF only): a
 * description naming a place, and a GPS directory with a position.
 */
export function tiff16WithPosition({ width, height }) {
  const grey = starPixels({ width, height });
  const description = Buffer.from("Col des Mélèzes\0", "utf8");
  const describedLength = description.length + (description.length % 2);
  const entries = 12;
  const ifdStart = 8;
  const ifdEnd = ifdStart + 2 + entries * 12 + 4;
  const bitsAt = ifdEnd;
  const descriptionAt = bitsAt + 6;
  const gpsAt = descriptionAt + describedLength;
  const gpsEnd = gpsAt + 2 + 4 * 12 + 4;
  const latitudeAt = gpsEnd;
  const longitudeAt = latitudeAt + 24;
  const pixelsAt = longitudeAt + 24;
  const pixelBytes = width * height * 3 * 2;
  const file = Buffer.alloc(pixelsAt + pixelBytes);
  file.write("II", 0, "latin1");
  file.writeUInt16LE(42, 2);
  file.writeUInt32LE(ifdStart, 4);
  const SHORT = 3;
  const LONG = 4;
  const ASCII = 2;
  const RATIONAL = 5;
  const entry = (at, index, tag, type, count, value) => {
    const offset = at + 2 + index * 12;
    file.writeUInt16LE(tag, offset);
    file.writeUInt16LE(type, offset + 2);
    file.writeUInt32LE(count, offset + 4);
    if (type === SHORT && count === 1) file.writeUInt16LE(value, offset + 8);
    else if (typeof value === "number") file.writeUInt32LE(value, offset + 8);
    else value.copy(file, offset + 8);
  };
  file.writeUInt16LE(entries, ifdStart);
  [
    [256, LONG, 1, width],
    [257, LONG, 1, height],
    [258, SHORT, 3, bitsAt],
    [259, SHORT, 1, 1],
    [262, SHORT, 1, 2],
    [270, ASCII, description.length, descriptionAt],
    [273, LONG, 1, pixelsAt],
    [277, SHORT, 1, 3],
    [278, LONG, 1, height],
    [279, LONG, 1, pixelBytes],
    [284, SHORT, 1, 1],
    [34853, LONG, 1, gpsAt],
  ].forEach(([tag, type, count, value], index) =>
    entry(ifdStart, index, tag, type, count, value),
  );
  file.writeUInt32LE(0, ifdStart + 2 + entries * 12);
  for (let channel = 0; channel < 3; channel += 1)
    file.writeUInt16LE(16, bitsAt + channel * 2);
  description.copy(file, descriptionAt);
  file.writeUInt16LE(4, gpsAt);
  const rational = (at, [degrees, minutes, seconds]) => {
    for (const [index, value] of [degrees, minutes, seconds].entries()) {
      file.writeUInt32LE(value, at + index * 8);
      file.writeUInt32LE(1, at + index * 8 + 4);
    }
  };
  [
    [1, ASCII, 2, Buffer.from("N\0\0\0", "latin1")],
    [2, RATIONAL, 3, latitudeAt],
    [3, ASCII, 2, Buffer.from("W\0\0\0", "latin1")],
    [4, RATIONAL, 3, longitudeAt],
  ].forEach(([tag, type, count, value], index) =>
    entry(gpsAt, index, tag, type, count, value),
  );
  file.writeUInt32LE(0, gpsAt + 2 + 4 * 12);
  rational(latitudeAt, [45, 0, 0]);
  rational(longitudeAt, [30, 0, 0]);
  for (let index = 0; index < grey.length; index += 1)
    for (let channel = 0; channel < 3; channel += 1)
      file.writeUInt16LE(
        grey[index] * 257,
        pixelsAt + (index * 3 + channel) * 2,
      );
  return file;
}

/** A PNG whose text chunk names a place and a position. */
export async function pngWithText({ width, height }) {
  const png = await starField({ width, height }).png().toBuffer();
  return withPngText(
    png,
    "Comment",
    "Lieu : Col des Melezes, GPS 45.0 N 30.0 W",
  );
}

/** A FITS file: 16-bit data with `BZERO` 32768, and its header cards. */
export function fitsFile({ width, height, cards = [], seed = 3 }) {
  const card = (text) => text.padEnd(80, " ").slice(0, 80);
  const lines = [
    card("SIMPLE  =                    T"),
    card("BITPIX  =                   16"),
    card("NAXIS   =                    2"),
    card(`NAXIS1  = ${String(width).padStart(20)}`),
    card(`NAXIS2  = ${String(height).padStart(20)}`),
    card("BZERO   =                32768"),
    card("BSCALE  =                    1"),
    ...cards.map(([key, value]) =>
      card(`${key.padEnd(8)}= ${String(value).padStart(20)}`),
    ),
    card("END"),
  ].join("");
  const header = Buffer.from(
    lines.padEnd(Math.ceil(lines.length / 2880) * 2880, " "),
    "latin1",
  );
  const pixels = starPixels({ width, height, seed });
  const data = Buffer.alloc(Math.ceil((width * height * 2) / 2880) * 2880);
  for (let index = 0; index < width * height; index += 1)
    data.writeInt16BE(pixels[index] * 64 + 400 - 32768, index * 2);
  return Buffer.concat([header, data]);
}
