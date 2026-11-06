import { skySolutionFromTanWcs } from "./projection.js";

/**
 * The numeric cards of a FITS header — the `.wcs` file `solve-field`
 * writes, or the head of a solved FITS file — as `{ KEY: number }`: 80
 * characters per card, `KEY     = value / comment`, read up to `END`.
 * Text and logical values are left out. Pure: the private server's
 * fallback reads the solution without `wcsinfo`.
 */
export function numericFitsCards(header) {
  const text = Buffer.isBuffer(header)
    ? header.toString("latin1")
    : String(header || "");
  const cards = {};
  for (let offset = 0; offset + 8 <= text.length; offset += 80) {
    const card = text.slice(offset, offset + 80);
    const key = card.slice(0, 8).trim();
    if (key === "END") break;
    if (!key || card.slice(8, 10) !== "= ") continue;
    const value = card.slice(10).split("/")[0].trim();
    if (!value || value.startsWith("'")) continue;
    const number = Number(value.replace(/D/i, "E"));
    if (Number.isFinite(number)) cards[key] = number;
  }
  return cards;
}

/**
 * The sky solution's fields from the cards of a TAN WCS (`CRVAL1/2`,
 * `CRPIX1/2`, `CD1_1` … `CD2_2`, or `CDELT1/2` with `CROTA2`), for an image
 * of `width` × `height` pixels (`IMAGEW`/`IMAGEH` of the cards when not
 * given), in the image's row-down pixel axes (`projection.js`). `null` when
 * the cards do not make a solution.
 */
export function skySolutionFromWcsCards(cards, { width, height } = {}) {
  let { CD1_1: cd11, CD1_2: cd12, CD2_1: cd21, CD2_2: cd22 } = cards;
  if (
    ![cd11, cd12, cd21, cd22].every(Number.isFinite) &&
    Number.isFinite(cards.CDELT1) &&
    Number.isFinite(cards.CDELT2)
  ) {
    const rho = ((cards.CROTA2 || 0) * Math.PI) / 180;
    cd11 = cards.CDELT1 * Math.cos(rho);
    cd12 = -cards.CDELT2 * Math.sin(rho);
    cd21 = cards.CDELT1 * Math.sin(rho);
    cd22 = cards.CDELT2 * Math.cos(rho);
  }
  return skySolutionFromTanWcs({
    crval1: cards.CRVAL1,
    crval2: cards.CRVAL2,
    crpix1: cards.CRPIX1,
    crpix2: cards.CRPIX2,
    cd11,
    cd12,
    cd21,
    cd22,
    width: Number(width ?? cards.IMAGEW),
    height: Number(height ?? cards.IMAGEH),
  });
}
