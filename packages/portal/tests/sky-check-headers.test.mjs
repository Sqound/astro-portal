import assert from "node:assert/strict";
import test from "node:test";
import {
  fitsAcquisitionFacts,
  fitsCelestialWcs,
  fitsFrameKind,
  frameKindOfText,
  isFitsHead,
  parseFitsHeader,
} from "../dist/sky-check/fits-header.js";
import { isXisfHead, parseXisfHeader } from "../dist/sky-check/xisf-header.js";
import {
  bufferReader,
  metadataSignals,
  readImageMetadata,
} from "../dist/sky-check/image-metadata.js";

/** A FITS header from `[keyword, value]` pairs, padded to whole blocks. */
function fitsHeader(cards, { end = true } = {}) {
  const card = (text) => text.padEnd(80, " ").slice(0, 80);
  const lines = [
    card("SIMPLE  =                    T / conforms to FITS"),
    ...cards.map(([keyword, value]) =>
      card(`${keyword.padEnd(8)}= ${String(value).padStart(20)} / a comment`),
    ),
    ...(end ? [card("END")] : []),
  ];
  const text = lines.join("");
  return Buffer.from(text.padEnd(Math.ceil(text.length / 2880) * 2880, " "));
}

test("FITS cards are read up to END, quoted strings and comments apart", () => {
  const header = parseFitsHeader(
    fitsHeader([
      ["BITPIX", 16],
      ["NAXIS", 2],
      ["OBJECT", "'M 31 ''core'''"],
      ["EXPTIME", "1.8D2"],
    ]),
  );
  assert.equal(header.ok, true);
  assert.equal(header.dataOffset, 2880);
  const object = header.cards.find((card) => card.keyword === "OBJECT");
  assert.equal(object.value, "M 31 'core'");
  assert.equal(object.comment, "a comment");
  assert.equal(fitsAcquisitionFacts(header.cards).exposureSeconds, 180);
  assert.equal(isFitsHead(fitsHeader([])), true);
  assert.equal(isFitsHead(Buffer.from("not a fits file".padEnd(80))), false);
});

test("a FITS header that never closes, or is too short, is refused", () => {
  const unclosed = Buffer.concat(
    Array.from({ length: 70 }, () =>
      fitsHeader([["BITPIX", 16]], { end: false }),
    ),
  );
  assert.deepEqual(parseFitsHeader(unclosed), {
    ok: false,
    error: "missing_end",
  });
  assert.deepEqual(parseFitsHeader(Buffer.from("SIMPLE")), {
    ok: false,
    error: "too_short",
  });
  const binary = fitsHeader([["BITPIX", 16]]);
  binary[85] = 0x01;
  assert.deepEqual(parseFitsHeader(binary), { ok: false, error: "not_ascii" });
});

test("each frame kind is recognised in its usual spellings", () => {
  const cases = {
    light: ["Light Frame", "LIGHT", "Light", "object", "Master Light"],
    dark: ["Dark Frame", "DARK", "MasterDark", "dark"],
    flat: ["Flat Field", "FLAT", "Flat Frame", "SkyFlat", "Master Flat"],
    bias: ["Bias Frame", "BIAS", "Offset", "MasterBias"],
    dark_flat: ["Dark Flat", "DARKFLAT", "FlatDark", "dark_flat"],
  };
  for (const [kind, spellings] of Object.entries(cases))
    for (const spelling of spellings)
      assert.equal(frameKindOfText(spelling), kind, spelling);
  assert.equal(frameKindOfText("Focus"), null);
  assert.equal(frameKindOfText(""), null);
  assert.equal(
    fitsFrameKind(parseFitsHeader(fitsHeader([["FRAME", "'Bias'"]])).cards),
    "bias",
  );
  assert.equal(
    fitsFrameKind(
      parseFitsHeader(fitsHeader([["IMAGETYP", "'Dark Flat'"]])).cards,
    ),
    "dark_flat",
  );
});

test("a celestial WCS is found with CD or CDELT, and not without it", () => {
  const solved = parseFitsHeader(
    fitsHeader([
      ["CTYPE1", "'RA---TAN-SIP'"],
      ["CTYPE2", "'DEC--TAN-SIP'"],
      ["CRVAL1", "312.75"],
      ["CRVAL2", "30.71"],
      ["CRPIX1", "1504.5"],
      ["CRPIX2", "1504.5"],
      ["CD1_1", "-4.1E-4"],
      ["CD1_2", "0"],
      ["CD2_1", "0"],
      ["CD2_2", "4.1E-4"],
    ]),
  ).cards;
  const wcs = fitsCelestialWcs(solved);
  assert.equal(wcs.projection, "TAN-SIP");
  assert.ok(Math.abs(wcs.arcsecPerPixel - 1.476) < 0.001);
  const cdelt = parseFitsHeader(
    fitsHeader([
      ["CTYPE1", "'RA---TAN'"],
      ["CTYPE2", "'DEC--TAN'"],
      ["CRVAL1", "10.68"],
      ["CRVAL2", "41.27"],
      ["CDELT1", "-0.001"],
      ["CDELT2", "0.001"],
      ["CROTA2", "12"],
    ]),
  ).cards;
  assert.ok(fitsCelestialWcs(cdelt));
  const pixelOnly = parseFitsHeader(
    fitsHeader([
      ["CTYPE1", "'PIXEL'"],
      ["CTYPE2", "'PIXEL'"],
      ["CRVAL1", "0"],
      ["CRVAL2", "0"],
    ]),
  ).cards;
  assert.equal(fitsCelestialWcs(pixelOnly), null);
  const noScale = parseFitsHeader(
    fitsHeader([
      ["CTYPE1", "'RA---TAN'"],
      ["CTYPE2", "'DEC--TAN'"],
      ["CRVAL1", "10"],
      ["CRVAL2", "95"],
    ]),
  ).cards;
  assert.equal(fitsCelestialWcs(noScale), null);
});

/** A little-endian TIFF block with ASCII and numeric tags (and sub-IFDs). */
function tiffBlock({ make, model, software, exposure, iso, gps, dng, cr2 }) {
  const entries0 = [];
  const exifEntries = [];
  const gpsEntries = [];
  const ascii = (tag, text, into) => into.push({ tag, type: 2, text });
  if (make) ascii(0x010f, make, entries0);
  if (model) ascii(0x0110, model, entries0);
  if (software) ascii(0x0131, software, entries0);
  if (dng) entries0.push({ tag: 0xc612, type: 1, bytes: [1, 4, 0, 0] });
  if (exposure) exifEntries.push({ tag: 0x829a, type: 5, rational: exposure });
  if (iso) exifEntries.push({ tag: 0x8827, type: 3, short: iso });
  if (gps) gpsEntries.push({ tag: 0x0002, type: 5, rational: [35, 1] });
  const hasExif = exifEntries.length > 0;
  const hasGps = gpsEntries.length > 0;
  if (hasExif) entries0.push({ tag: 0x8769, type: 4, pointer: "exif" });
  if (hasGps) entries0.push({ tag: 0x8825, type: 4, pointer: "gps" });
  entries0.sort((a, b) => a.tag - b.tag);
  const ifdSize = (entries) => 2 + entries.length * 12 + 4;
  // A Canon CR2 writes « CR » and a version right after the TIFF header.
  const ifd0At = cr2 ? 16 : 8;
  const exifAt = ifd0At + ifdSize(entries0);
  const gpsAt = exifAt + (hasExif ? ifdSize(exifEntries) : 0);
  let dataAt = gpsAt + (hasGps ? ifdSize(gpsEntries) : 0);
  const buffer = Buffer.alloc(4096);
  buffer.write("II", 0, "latin1");
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(ifd0At, 4);
  if (cr2) buffer.write("CR\u0002\u0000", 8, "latin1");
  const writeIfd = (at, entries) => {
    buffer.writeUInt16LE(entries.length, at);
    entries.forEach((entry, index) => {
      const offset = at + 2 + index * 12;
      buffer.writeUInt16LE(entry.tag, offset);
      buffer.writeUInt16LE(entry.type, offset + 2);
      if (entry.type === 2) {
        const bytes = Buffer.from(`${entry.text}\0`, "latin1");
        buffer.writeUInt32LE(bytes.length, offset + 4);
        if (bytes.length <= 4) bytes.copy(buffer, offset + 8);
        else {
          buffer.writeUInt32LE(dataAt, offset + 8);
          bytes.copy(buffer, dataAt);
          dataAt += bytes.length;
        }
      } else if (entry.type === 5) {
        buffer.writeUInt32LE(1, offset + 4);
        buffer.writeUInt32LE(dataAt, offset + 8);
        buffer.writeUInt32LE(entry.rational[0], dataAt);
        buffer.writeUInt32LE(entry.rational[1], dataAt + 4);
        dataAt += 8;
      } else if (entry.type === 3) {
        buffer.writeUInt32LE(1, offset + 4);
        buffer.writeUInt16LE(entry.short, offset + 8);
      } else if (entry.type === 1) {
        buffer.writeUInt32LE(entry.bytes.length, offset + 4);
        Buffer.from(entry.bytes).copy(buffer, offset + 8);
      } else if (entry.type === 4) {
        buffer.writeUInt32LE(1, offset + 4);
        buffer.writeUInt32LE(
          entry.pointer === "exif" ? exifAt : gpsAt,
          offset + 8,
        );
      }
    });
    buffer.writeUInt32LE(0, at + 2 + entries.length * 12);
  };
  writeIfd(ifd0At, entries0);
  if (hasExif) writeIfd(exifAt, exifEntries);
  if (hasGps) writeIfd(gpsAt, gpsEntries);
  return buffer.subarray(0, dataAt);
}

/** A JPEG head holding an EXIF block. */
function jpegWithExif(tiff) {
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    length,
    payload,
    Buffer.from([0xff, 0xda, 0x00, 0x02]),
  ]);
}

test("EXIF with and without GPS: maker class, exposure class, position", async () => {
  const phone = await readImageMetadata(
    bufferReader(
      jpegWithExif(
        tiffBlock({
          make: "Apple",
          model: "iPhone",
          exposure: [1, 120],
          iso: 50,
          gps: true,
        }),
      ),
    ),
    { type: "image/jpeg" },
  );
  assert.equal(phone.gps, true);
  assert.deepEqual(metadataSignals(phone), {
    hasExif: true,
    makerClass: "phone",
    exposureClass: "short",
    highIso: false,
    astroSoftware: false,
    gps: true,
    raw: null,
  });
  const night = await readImageMetadata(
    bufferReader(
      jpegWithExif(
        tiffBlock({
          make: "Canon",
          software: "Sequator 1.6",
          exposure: [20, 1],
          iso: 3200,
        }),
      ),
    ),
    { type: "image/jpeg" },
  );
  const signals = metadataSignals(night);
  assert.equal(night.gps, false);
  assert.equal(signals.makerClass, "camera");
  assert.equal(signals.exposureClass, "long");
  assert.equal(signals.highIso, true);
  assert.equal(signals.astroSoftware, true);
  const bare = await readImageMetadata(
    bufferReader(Buffer.from([0xff, 0xd8, 0xff, 0xda])),
    {
      type: "image/jpeg",
    },
  );
  assert.equal(metadataSignals(bare).makerClass, "none");
  assert.equal(bare.hasExif, false);
});

test("a camera raw's maker and kind are read from its TIFF structure", async () => {
  const nef = await readImageMetadata(
    bufferReader(tiffBlock({ make: "NIKON CORPORATION", exposure: [30, 1] })),
    { type: "image/tiff", extension: "nef" },
  );
  assert.equal(nef.raw, "nef");
  assert.equal(metadataSignals(nef).makerClass, "camera");
  const dng = await readImageMetadata(
    bufferReader(tiffBlock({ make: "Google", dng: true })),
    { type: "image/tiff", extension: "dng" },
  );
  assert.equal(dng.raw, "dng");
  const canonRaw = await readImageMetadata(
    bufferReader(tiffBlock({ make: "Canon", cr2: true })),
    {
      type: "image/tiff",
      extension: "cr2",
    },
  );
  assert.equal(canonRaw.raw, "cr2");
  assert.equal(canonRaw.make, "Canon");
  const plain = await readImageMetadata(
    bufferReader(tiffBlock({ make: "SONY" })),
    {
      type: "image/tiff",
      extension: "tif",
    },
  );
  assert.equal(plain.raw, null);
});

test("an XISF header gives its frame kind and its astrometric solution", () => {
  const xisf = (xml) => {
    const body = Buffer.from(xml, "utf8");
    const head = Buffer.alloc(16);
    head.write("XISF0100", 0, "latin1");
    head.writeUInt32LE(body.length, 8);
    return Buffer.concat([head, body]);
  };
  const dark = xisf(
    '<?xml version="1.0"?><xisf><Image geometry="10:10:1" imageType="Dark" location="attachment:4096:200"/></xisf>',
  );
  assert.equal(isXisfHead(dark), true);
  assert.deepEqual(parseXisfHeader(dark), {
    ok: true,
    frameKind: "dark",
    astrometric: false,
  });
  const solved = xisf(
    '<xisf><Image geometry="10:10:1"><FITSKeyword name="IMAGETYP" value="\'Light Frame\'" comment=""/><Property id="PCL:AstrometricSolution:ReferenceCelestialCoordinates" type="F64Vector" length="2"/></Image></xisf>',
  );
  assert.deepEqual(parseXisfHeader(solved), {
    ok: true,
    frameKind: "light",
    astrometric: true,
  });
  const truncated = xisf("<xisf><Image/></xisf>").subarray(0, 20);
  assert.deepEqual(parseXisfHeader(truncated), {
    ok: false,
    error: "truncated",
  });
});
