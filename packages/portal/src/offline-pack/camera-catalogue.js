import { createHash } from "node:crypto";

/**
 * The offline pack's camera star catalogue (CAM-3): the source of the narrow
 * plate-solving index of a telescope camera — a guide camera behind a 120 to
 * 240 mm guide scope, whose 1 to 3° field needs stars to magnitude 11.5
 * (study CAMERA-AIM-01 § 3, measure CAM-0). Tycho-2 (VizieR I/259) and its
 * first supplement, the whole sky to V 11.5: about 1.5 million stars, 12 MB.
 *
 * Unlike `solve-catalogue` (HYG, 0.75 MB, read whole), the phone never holds
 * this file in memory: it reads the cone around the mount's position. The
 * layout is therefore zoned (`PSTZ`): declination bands of `bandHeight`
 * degrees, each cut into right-ascension cells of about the same width, the
 * stars of a zone stored together, brightest first. A cone is one read per
 * band it crosses.
 *
 *   header (24 bytes): `PSTZ`, version (uint8), 0, band height (uint16,
 *     hundredths of a degree), star count (uint32), band count (uint16), 0,
 *     zone count (uint32), magnitude limit (int16, hundredths), 0
 *   cells per band: band count × uint16, then padding to 4 bytes
 *   zone starts: (zone count + 1) × uint32, the index of each zone's first
 *     star (the last entry is the star count)
 *   stars: 8 bytes each — right ascension and declination in their zone
 *     (uint16, 0 to 65535 across the cell's width and the band's height:
 *     under 0.3″ on the sky), V and B−V (int16, hundredths)
 *
 * Tycho-2 is published under CC BY-NC 3.0 IGO (its ReadMe) and the ESA
 * archives ask a written authorisation before any commercial use: it was
 * asked on 04/11/2026, and the component says so in its `license` (the
 * maintainer's decision of the same day: ship it before the answer, fall back only on a
 * refusal). A `file-set` component, optional (`required: false`), never part
 * of the base: the person asks for it.
 */

export const cameraCatalogueComponentId = "camera-catalogue";
export const cameraCatalogueFileName = "stars.bin";
/** The provenance the build script writes next to the catalogue. */
export const cameraCatalogueSourceFileName = "source.json";
export const cameraCatalogueMagnitudeLimit = 11.5;
export const cameraCatalogueBandHeightDegrees = 2;
export const cameraCatalogueAttribution =
  "Tycho-2 Catalogue (Høg et al. 2000), ESA Hipparcos mission";
export const cameraCatalogueLicense =
  "CC BY-NC 3.0 IGO, autorisation commerciale demandée à l'ESA le 04/11/2026";

const magic = "PSTZ";
const headerBytes = 24;
const starBytes = 8;
const offsetScale = 65535;
const degrees = Math.PI / 180;

function field(line, from, to) {
  const text = line.slice(from - 1, to).trim();
  return text === "" ? Number.NaN : Number(text);
}

/**
 * V and B−V of a Tycho star from its BT and VT, as the ReadMe's note 7
 * gives them: V = VT − 0.090 (BT − VT), B−V = 0.850 (BT − VT). With one
 * magnitude only: VT as V, or BT − 0.4 (rare); `null` without either.
 */
export function tycho2Photometry(bt, vt) {
  if (Number.isFinite(bt) && Number.isFinite(vt))
    return { vmag: vt - 0.09 * (bt - vt), bv: 0.85 * (bt - vt) };
  if (Number.isFinite(vt)) return { vmag: vt, bv: 0.5 };
  if (Number.isFinite(bt)) return { vmag: bt - 0.4, bv: 0.5 };
  return null;
}

/**
 * The stars of a `tyc2.dat.NN` text (fixed columns of the ReadMe): the mean
 * position at J2000, or the observed one for a star without (`X` flag).
 *
 * @param {string} text
 * @returns {{ ra: number, dec: number, vmag: number, bv: number }[]}
 */
export function tycho2MainStars(text) {
  const stars = [];
  for (const line of text.split("\n")) {
    if (line.length < 177) continue;
    const mean = line[13] !== "X";
    const ra = mean ? field(line, 16, 27) : field(line, 153, 164);
    const dec = mean ? field(line, 29, 40) : field(line, 166, 177);
    const photometry = tycho2Photometry(
      field(line, 111, 116),
      field(line, 124, 129),
    );
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !photometry) continue;
    stars.push({ ra, dec, ...photometry });
  }
  return stars;
}

/**
 * The stars of `suppl_1.dat` — the Hipparcos and Tycho-1 stars Tycho-2
 * lacks, the brightest among them (positions at J1991.25, under 1″ off for
 * plate solving).
 *
 * @param {string} text
 */
export function tycho2SupplementStars(text) {
  const stars = [];
  for (const line of text.split("\n")) {
    if (line.length < 102) continue;
    const ra = field(line, 16, 27);
    const dec = field(line, 29, 40);
    const photometry = tycho2Photometry(
      field(line, 84, 89),
      field(line, 97, 102),
    );
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !photometry) continue;
    stars.push({ ra, dec, ...photometry });
  }
  return stars;
}

/**
 * The zones of a band height: the cells of each band (about square at its
 * middle declination), and where each band's zones start.
 */
export function cameraCatalogueZones(
  bandHeight = cameraCatalogueBandHeightDegrees,
) {
  const bandCount = Math.ceil(180 / bandHeight);
  const cells = [];
  const firstZone = [];
  let zoneCount = 0;
  for (let band = 0; band < bandCount; band += 1) {
    const middle = Math.min(90, -90 + (band + 0.5) * bandHeight);
    const count = Math.max(
      1,
      Math.round((360 * Math.cos(middle * degrees)) / bandHeight),
    );
    cells.push(count);
    firstZone.push(zoneCount);
    zoneCount += count;
  }
  return { bandHeight, bandCount, cells, firstZone, zoneCount };
}

/** The zone of a position, for [zones] (`cameraCatalogueZones`). */
export function cameraCatalogueZoneOf(ra, dec, zones) {
  const band = Math.min(
    zones.bandCount - 1,
    Math.max(0, Math.floor((dec + 90) / zones.bandHeight)),
  );
  const cells = zones.cells[band];
  const normalised = ((ra % 360) + 360) % 360;
  const cell = Math.min(cells - 1, Math.floor((normalised / 360) * cells));
  return zones.firstZone[band] + cell;
}

/** The two offsets of [star] in its zone ([star.zone], `cameraCatalogueZoneOf`). */
function cameraCatalogueOffsets(star, zones) {
  let band = zones.bandCount - 1;
  while (band > 0 && zones.firstZone[band] > star.zone) band -= 1;
  const cells = zones.cells[band];
  const width = 360 / cells;
  const cell = star.zone - zones.firstZone[band];
  const bottom = -90 + band * zones.bandHeight;
  const height = Math.min(90, bottom + zones.bandHeight) - bottom;
  const scaled = (value) =>
    Math.max(0, Math.min(offsetScale, Math.round(value * offsetScale)));
  return [
    scaled((star.ra - cell * width) / width),
    scaled((star.dec - bottom) / height),
  ];
}

/**
 * The `PSTZ` bytes of [stars] to [magnitudeLimit]: zone by zone, brightest
 * first in a zone (then by position, so the bytes never depend on the order
 * of the source files).
 *
 * @param {{ ra: number, dec: number, vmag: number, bv: number }[]} stars
 * @param {{ magnitudeLimit?: number, bandHeight?: number }} [options]
 * @returns {Buffer}
 */
export function encodeCameraCatalogue(
  stars,
  {
    magnitudeLimit = cameraCatalogueMagnitudeLimit,
    bandHeight = cameraCatalogueBandHeightDegrees,
  } = {},
) {
  const zones = cameraCatalogueZones(bandHeight);
  const kept = [];
  for (const star of stars) {
    if (!(star.vmag <= magnitudeLimit)) continue;
    const ra = ((star.ra % 360) + 360) % 360;
    kept.push({
      ra,
      dec: star.dec,
      vmag: star.vmag,
      bv: star.bv,
      zone: cameraCatalogueZoneOf(ra, star.dec, zones),
    });
  }
  kept.sort(
    (a, b) =>
      a.zone - b.zone || a.vmag - b.vmag || a.ra - b.ra || a.dec - b.dec,
  );
  const cellsBytes = Math.ceil((zones.bandCount * 2) / 4) * 4;
  const directory = headerBytes + cellsBytes;
  const first = directory + (zones.zoneCount + 1) * 4;
  const buffer = Buffer.alloc(first + kept.length * starBytes);
  buffer.write(magic, 0, "ascii");
  buffer.writeUInt8(1, 4);
  buffer.writeUInt16LE(Math.round(bandHeight * 100), 6);
  buffer.writeUInt32LE(kept.length, 8);
  buffer.writeUInt16LE(zones.bandCount, 12);
  buffer.writeUInt32LE(zones.zoneCount, 16);
  buffer.writeInt16LE(Math.round(magnitudeLimit * 100), 20);
  zones.cells.forEach((count, band) =>
    buffer.writeUInt16LE(count, headerBytes + band * 2),
  );
  let zone = 0;
  kept.forEach((star, index) => {
    while (zone <= star.zone) {
      buffer.writeUInt32LE(index, directory + zone * 4);
      zone += 1;
    }
    const at = first + index * starBytes;
    const [raOffset, decOffset] = cameraCatalogueOffsets(star, zones);
    buffer.writeUInt16LE(raOffset, at);
    buffer.writeUInt16LE(decOffset, at + 2);
    buffer.writeInt16LE(Math.round(star.vmag * 100), at + 4);
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(star.bv * 100))),
      at + 6,
    );
  });
  while (zone <= zones.zoneCount) {
    buffer.writeUInt32LE(kept.length, directory + zone * 4);
    zone += 1;
  }
  return buffer;
}

/**
 * What the header of [bytes] says, or `null` when they are not a `PSTZ`
 * catalogue whose size matches its counts.
 *
 * @param {Buffer} bytes
 */
export function cameraCatalogueHeader(bytes) {
  if (!bytes || bytes.length < headerBytes) return null;
  if (bytes.toString("ascii", 0, 4) !== magic || bytes.readUInt8(4) !== 1)
    return null;
  const stars = bytes.readUInt32LE(8);
  const bandCount = bytes.readUInt16LE(12);
  const zoneCount = bytes.readUInt32LE(16);
  const cellsBytes = Math.ceil((bandCount * 2) / 4) * 4;
  const expected =
    headerBytes + cellsBytes + (zoneCount + 1) * 4 + stars * starBytes;
  if (bytes.length !== expected) return null;
  return {
    stars,
    bandCount,
    zoneCount,
    bandHeight: bytes.readUInt16LE(6) / 100,
    magnitudeLimit: bytes.readInt16LE(20) / 100,
  };
}

/**
 * The manifest entry of the camera catalogue, or `null` (component absent)
 * without valid bytes. `revision` and the file's `checksum` are digests of
 * the bytes; `source` is the provenance the build script wrote (catalogue,
 * where and when it was downloaded, the digest of every source file).
 *
 * @param {{ bytes: Buffer | null | undefined, source?: object | null, fileUrl?: string }} input
 */
export function cameraCataloguePackComponent({
  bytes,
  source = null,
  fileUrl = `camera-catalogue/${cameraCatalogueFileName}`,
}) {
  const header = cameraCatalogueHeader(bytes);
  if (!header) return null;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    id: cameraCatalogueComponentId,
    kind: "file-set",
    required: false,
    revision: `sha256:${checksum}`,
    estimatedBytes: bytes.length,
    magnitudeLimit: header.magnitudeLimit,
    stars: header.stars,
    layout: "PSTZ",
    files: [
      {
        name: cameraCatalogueFileName,
        url: fileUrl,
        bytes: bytes.length,
        checksum: `sha256:${checksum}`,
      },
    ],
    attribution: cameraCatalogueAttribution,
    license: cameraCatalogueLicense,
    ...(source ? { source } : {}),
  };
}
