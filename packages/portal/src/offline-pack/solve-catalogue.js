import { createHash } from "node:crypto";

/**
 * The offline pack's deep star catalogue: the source of the telephoto's
 * narrow plate-solving index on the phone — HYG v4.1 stars to magnitude 8.5,
 * the whole sky, in the `PSTR` binary layout. Only the telephoto, whose 17°
 * field holds few stars brighter than magnitude 7, needs this one.
 *
 * HYG v4.1 — David Nash, astronexus.com — is published under CC BY-SA 4.0;
 * the component carries its attribution and licence, as every pack
 * component does.
 *
 * A `file-set` component, optional (`required: false`): a pack without it
 * leaves the telephoto disabled on the phone, with its reason.
 */

export const solveCatalogueComponentId = "solve-catalogue";
export const solveCatalogueFileName = "stars.bin";
export const solveCatalogueMagnitudeLimit = 8.5;
export const solveCatalogueAttribution =
  "HYG v4.1 — David Nash, astronexus.com";
export const solveCatalogueLicense = "CC BY-SA 4.0";

const headerBytes = 24;
const brightLimit = 6.5;

// A minimal CSV reader: quoted fields, no embedded line breaks (HYG has none).
function splitCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      fields.push(field);
      field = "";
    } else field += character;
  }
  fields.push(field);
  return fields;
}

/**
 * The stars of an HYG v4.1 CSV text to [magnitude], the Sun left out,
 * brightest first (then by position, so the bytes never depend on the
 * file's own order). Right ascension in degrees (HYG gives hours).
 *
 * @param {string} csv
 * @param {{ magnitude?: number }} [options]
 * @returns {{ ra: number, dec: number, vmag: number, bv: number }[]}
 */
export function solveCatalogueStarsFromHyg(
  csv,
  { magnitude = solveCatalogueMagnitudeLimit } = {},
) {
  const lines = csv.split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "");
  const column = (name) => {
    const position = header.indexOf(name);
    if (position < 0) throw new Error(`HYG column ${name} not found`);
    return position;
  };
  const raColumn = column("ra");
  const decColumn = column("dec");
  const magColumn = column("mag");
  const ciColumn = column("ci");
  const properColumn = header.indexOf("proper");
  const stars = [];
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const fields = splitCsvLine(line);
    if (properColumn >= 0 && fields[properColumn] === "Sol") continue;
    const ra = Number(fields[raColumn]) * 15;
    const dec = Number(fields[decColumn]);
    const vmag = Number(fields[magColumn]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    if (!Number.isFinite(vmag) || vmag > magnitude) continue;
    const rawColour = fields[ciColumn] ?? "";
    const bv = rawColour.trim() === "" ? Number.NaN : Number(rawColour);
    stars.push({
      ra: ((ra % 360) + 360) % 360,
      dec,
      vmag,
      bv: Number.isFinite(bv) ? bv : 0.5,
    });
  }
  stars.sort((a, b) => a.vmag - b.vmag || a.ra - b.ra || a.dec - b.dec);
  return stars;
}

/**
 * The `PSTR` version 1 bytes of [stars]: a 24-byte header (`PSTR`, version,
 * count, the count brighter than 6.5), then right ascensions and
 * declinations (float32, degrees), magnitudes and B−V (int16, hundredths).
 *
 * @param {{ ra: number, dec: number, vmag: number, bv: number }[]} stars
 * @returns {Buffer}
 */
export function encodeSolveCatalogue(stars) {
  const count = stars.length;
  const buffer = Buffer.alloc(headerBytes + count * 12);
  buffer.write("PSTR", 0, "ascii");
  buffer.writeUInt8(1, 4);
  buffer.writeUInt32LE(count, 8);
  buffer.writeUInt32LE(
    stars.filter((star) => star.vmag <= brightLimit).length,
    12,
  );
  const declinations = headerBytes + count * 4;
  const magnitudes = declinations + count * 4;
  const colourIndices = magnitudes + count * 2;
  stars.forEach((star, index) => {
    buffer.writeFloatLE(star.ra, headerBytes + index * 4);
    buffer.writeFloatLE(star.dec, declinations + index * 4);
    buffer.writeInt16LE(Math.round(star.vmag * 100), magnitudes + index * 2);
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(star.bv * 100))),
      colourIndices + index * 2,
    );
  });
  return buffer;
}

/**
 * The manifest entry of the deep catalogue, or `null` (component absent)
 * without bytes. `revision` and the file's `checksum` are digests of the
 * actual bytes.
 *
 * @param {{ bytes: Buffer | Uint8Array | null | undefined, fileUrl?: string, starCount?: number }} input
 */
export function solveCataloguePackComponent({
  bytes,
  fileUrl = `solve-catalogue/${solveCatalogueFileName}`,
  starCount,
}) {
  if (!bytes || bytes.length === 0) return null;
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return {
    id: solveCatalogueComponentId,
    kind: "file-set",
    required: false,
    revision: `sha256:${checksum}`,
    estimatedBytes: bytes.length,
    magnitudeLimit: solveCatalogueMagnitudeLimit,
    ...(Number.isInteger(starCount) ? { stars: starCount } : {}),
    files: [
      {
        name: solveCatalogueFileName,
        url: fileUrl,
        bytes: bytes.length,
        checksum: `sha256:${checksum}`,
      },
    ],
    attribution: solveCatalogueAttribution,
    license: solveCatalogueLicense,
  };
}
