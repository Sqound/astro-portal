/**
 * The primary header of a FITS file, read the way Astro Sync reads it
 * (`astro-sync-core`, `analysis/fits.rs`): 80-byte cards packed into
 * 2880-byte blocks, closed by an `END` card, with no dependency. Only the
 * header is read here; the pixels are `decode.js`'s.
 *
 * What the sky check takes from it: the kind of frame (`IMAGETYP` or
 * `FRAME`), a celestial world coordinate system (the projection a plate
 * solver writes, read like `TanWcs::from_header` of `analysis/wcs.rs`), and
 * the usual acquisition keywords.
 */

export const FITS_CARD_BYTES = 80;
export const FITS_BLOCK_BYTES = 2880;
/** Blocks scanned for `END` before the header is called unclosed. */
export const FITS_MAX_HEADER_BLOCKS = 64;

/** Whether these leading bytes open a FITS file (`SIMPLE  =` then `T`). */
export function isFitsHead(head) {
  const bytes = Buffer.isBuffer(head) ? head : Buffer.from(head || []);
  if (bytes.length < FITS_CARD_BYTES) return false;
  const card = bytes.toString("latin1", 0, FITS_CARD_BYTES);
  return /^SIMPLE {2}= +T\b/.test(card);
}

/**
 * Splits a card's value field (after `= `) into the value and its comment,
 * honouring the quoted-string rule (`''` is one quote inside a string).
 */
function splitValue(field) {
  const text = field.trimStart();
  if (text.startsWith("'")) {
    let value = "";
    let index = 1;
    while (index < text.length) {
      const character = text[index];
      if (character === "'") {
        if (text[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        index += 1;
        break;
      }
      value += character;
      index += 1;
    }
    const rest = text.slice(index).trimStart();
    const comment = rest.startsWith("/") ? rest.slice(1).trim() : "";
    return { value: value.trimEnd(), comment: comment || null };
  }
  const slash = text.indexOf("/");
  const value = (slash >= 0 ? text.slice(0, slash) : text).trim();
  const comment = slash >= 0 ? text.slice(slash + 1).trim() : "";
  return { value, comment: comment || null };
}

/**
 * Reads the primary header from `bytes` (the file's first bytes are
 * enough: the header never needs more than `FITS_MAX_HEADER_BLOCKS`
 * blocks). Answers `{ ok: true, cards, dataOffset }`, where `dataOffset` is
 * the end of the block holding `END`, or `{ ok: false, error }` with
 * `too_short`, `not_ascii` or `missing_end`.
 */
export function parseFitsHeader(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (buffer.length < FITS_CARD_BYTES) return { ok: false, error: "too_short" };
  const limit = Math.min(
    buffer.length,
    FITS_BLOCK_BYTES * FITS_MAX_HEADER_BLOCKS,
  );
  const cards = [];
  for (let offset = 0; ; offset += FITS_CARD_BYTES) {
    if (offset + FITS_CARD_BYTES > limit)
      return { ok: false, error: "missing_end" };
    const raw = buffer.subarray(offset, offset + FITS_CARD_BYTES);
    if (raw.some((byte) => byte < 0x20 || byte > 0x7e))
      return { ok: false, error: "not_ascii" };
    const text = raw.toString("latin1");
    const keyword = text.slice(0, 8).trimEnd();
    if (keyword === "END") {
      const end = offset + FITS_CARD_BYTES;
      return {
        ok: true,
        cards,
        dataOffset: Math.ceil(end / FITS_BLOCK_BYTES) * FITS_BLOCK_BYTES,
      };
    }
    if (!keyword) continue;
    if (text.slice(8, 10) === "= ") {
      const { value, comment } = splitValue(text.slice(10));
      cards.push({ keyword, value, comment });
    } else {
      const comment = text.slice(8).trim();
      cards.push({ keyword, value: null, comment: comment || null });
    }
  }
}

/** The value of the first card named `keyword` (case-insensitive). */
export function fitsValue(cards, keyword) {
  const wanted = keyword.toUpperCase();
  const card = cards.find(
    (entry) => entry.keyword.toUpperCase() === wanted && entry.value !== null,
  );
  return card ? card.value : null;
}

/** A FITS number (`D` exponents accepted), or `null`. */
export function fitsNumber(cards, keyword) {
  const value = fitsValue(cards, keyword);
  if (value === null || value === "") return null;
  const number = Number(value.replace(/[Dd]/, "E"));
  return Number.isFinite(number) ? number : null;
}

const FRAME_KINDS = [
  // Order matters: « dark flat » before « dark » and « flat ».
  [/^(?:master)?(?:darkflat|flatdark)(?:frames?)?$/, "dark_flat"],
  [/^(?:master)?bias(?:frames?)?$|^offset$|^zero$/, "bias"],
  [/^(?:master)?dark(?:frames?|current)?$/, "dark"],
  [
    /^(?:master)?(?:flat|flatfield|skyflat|domeflat|twilightflat)(?:frames?)?$/,
    "flat",
  ],
  [/^(?:master)?(?:light|object|science)(?:frames?)?$/, "light"],
];

/**
 * The kind of frame a header or a capture program names: `light`, `dark`,
 * `flat`, `bias`, `dark_flat`, or `null` when nothing (or something else)
 * is written. Spellings vary by program: « Light Frame », « DARK »,
 * « Dark Flat », « FlatDark », « Bias Frame », « MasterFlat ».
 */
export function frameKindOfText(text) {
  if (typeof text !== "string") return null;
  const compact = text
    .toLowerCase()
    .replace(/[\s_\-.]+/g, "")
    .trim();
  if (!compact) return null;
  for (const [pattern, kind] of FRAME_KINDS)
    if (pattern.test(compact)) return kind;
  return null;
}

/** The kind of frame of a FITS header (`IMAGETYP`, else `FRAME`). */
export function fitsFrameKind(cards) {
  return (
    frameKindOfText(fitsValue(cards, "IMAGETYP")) ??
    frameKindOfText(fitsValue(cards, "FRAME")) ??
    frameKindOfText(fitsValue(cards, "FRAMETYP"))
  );
}

/** The linear transform, degrees per pixel (`CD`, else `CDELT` + `PC`/`CROTA2`). */
function cdMatrix(cards) {
  const n = (key) => fitsNumber(cards, key);
  let matrix = null;
  if (n("CD1_1") !== null && n("CD2_2") !== null) {
    matrix = [
      [n("CD1_1"), n("CD1_2") ?? 0],
      [n("CD2_1") ?? 0, n("CD2_2")],
    ];
  } else if (n("CDELT1") !== null && n("CDELT2") !== null) {
    const [c1, c2] = [n("CDELT1"), n("CDELT2")];
    let pc;
    if (n("PC1_1") !== null && n("PC2_2") !== null) {
      pc = [
        [n("PC1_1"), n("PC1_2") ?? 0],
        [n("PC2_1") ?? 0, n("PC2_2")],
      ];
    } else {
      const rotation = ((n("CROTA2") ?? 0) * Math.PI) / 180;
      const [sin, cos] = [Math.sin(rotation), Math.cos(rotation)];
      pc = [
        [cos, (-sin * c2) / c1],
        [(sin * c1) / c2, cos],
      ];
    }
    matrix = [
      [c1 * pc[0][0], c1 * pc[0][1]],
      [c2 * pc[1][0], c2 * pc[1][1]],
    ];
  }
  if (!matrix) return null;
  const determinant = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
  return matrix.flat().every(Number.isFinite) && determinant !== 0
    ? matrix
    : null;
}

/**
 * The celestial coordinate system of a solved frame, or `null`: `CTYPE1`
 * and `CTYPE2` name right ascension and declination (`RA---TAN`,
 * `DEC--TAN`, with or without `-SIP`, or another celestial projection),
 * `CRVAL1`/`CRVAL2` are finite and a declination, and the linear transform
 * is usable. Answers the centre's reference point, the projection and the
 * pixel scale (arcseconds).
 */
export function fitsCelestialWcs(cards) {
  const ctype1 = (fitsValue(cards, "CTYPE1") || "").trim().toUpperCase();
  const ctype2 = (fitsValue(cards, "CTYPE2") || "").trim().toUpperCase();
  if (!/^RA--/.test(ctype1) || !/^DEC-/.test(ctype2)) return null;
  const ra = fitsNumber(cards, "CRVAL1");
  const dec = fitsNumber(cards, "CRVAL2");
  if (ra === null || dec === null || Math.abs(dec) > 90) return null;
  const matrix = cdMatrix(cards);
  if (!matrix) return null;
  const determinant = Math.abs(
    matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0],
  );
  return {
    ra: ((ra % 360) + 360) % 360,
    dec,
    projection: ctype1.replace(/^RA-+/, "") || "TAN",
    arcsecPerPixel: Math.sqrt(determinant) * 3600,
  };
}

/**
 * The acquisition facts of a header the sky check counts: booleans and
 * sizes only (no value a person could be recognised by).
 */
export function fitsAcquisitionFacts(cards) {
  const exposure =
    fitsNumber(cards, "EXPTIME") ?? fitsNumber(cards, "EXPOSURE");
  const axes = fitsNumber(cards, "NAXIS") ?? 0;
  return {
    frameKind: fitsFrameKind(cards),
    exposureSeconds: exposure,
    hasObject: Boolean(fitsValue(cards, "OBJECT")),
    hasTelescope: Boolean(fitsValue(cards, "TELESCOP")),
    hasInstrument: Boolean(fitsValue(cards, "INSTRUME")),
    hasPointing:
      fitsValue(cards, "RA") !== null ||
      fitsValue(cards, "OBJCTRA") !== null ||
      fitsValue(cards, "RA_OBJ") !== null,
    bayer: Boolean((fitsValue(cards, "BAYERPAT") || "").trim()),
    bitpix: fitsNumber(cards, "BITPIX"),
    axes,
    width: fitsNumber(cards, "NAXIS1"),
    height: fitsNumber(cards, "NAXIS2"),
    planes: axes >= 3 ? (fitsNumber(cards, "NAXIS3") ?? 1) : 1,
    tileCompressed: (fitsValue(cards, "ZIMAGE") || "").trim() === "T",
  };
}
