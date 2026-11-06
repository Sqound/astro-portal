/**
 * A cutout of a HiPS survey cut by the portal itself from the survey's
 * tiles: the gnomonic (TAN) projection hips2fits makes, north up and east
 * left, sampled twice per output pixel and reduced. It is the field image's
 * second recourse, when hips2fits does not answer (the CDS was unreachable
 * from the bench's network on 2026-10-29, while the ESAC mirror of the same
 * HiPS answered).
 *
 * Pure but for the tile loader the caller hands in (`loadTile(order, pix)`,
 * answering the tile's 512 x 512 RGB pixels, or `null` for a tile the
 * survey does not have): no network, no file here.
 */

/** The side, in pixels, of a tile of the surveys this cuts from. */
export const hipsTileWidth = 512;
const tileBits = 9; // log2(hipsTileWidth)

/** The pixel size, in degrees, of the whole-sky HEALPix grid at nside 1. */
const healpixPixelDegreesAtNsideOne = 58.6297;

/**
 * The HiPS order whose tile pixels are at least as fine as the output's
 * (`fieldDegrees` over `size` pixels), within `minimumOrder` and
 * `maximumOrder`.
 */
export function cutoutOrder(
  fieldDegrees,
  size,
  { minimumOrder = 3, maximumOrder = 9 } = {},
) {
  const nside = (healpixPixelDegreesAtNsideOne * size) / fieldDegrees;
  const order = Math.ceil(Math.log2(nside)) - tileBits;
  return Math.min(maximumOrder, Math.max(minimumOrder, order));
}

// Spreads the low 16 bits of `value` to the even bits of the result.
function spreadBits(value) {
  let spread = 0;
  for (let bit = 0; bit < 16; bit += 1)
    if (value & (1 << bit)) spread += 2 ** (2 * bit);
  return spread;
}

/**
 * The NESTED HEALPix face and in-face coordinates (`ix`, `iy`) of the
 * direction of `z` (the sine of the declination) and `phi` (the right
 * ascension, radians) on a grid of `nside` (a power of two).
 */
export function healpixFaceXY(nside, z, phi) {
  const za = Math.abs(z);
  const turn = 2 * Math.PI;
  const tt = (((phi % turn) + turn) % turn) / (Math.PI / 2);
  const mask = nside - 1;
  if (za <= 2 / 3) {
    const t1 = nside * (0.5 + tt);
    const t2 = nside * z * 0.75;
    const jp = Math.floor(t1 - t2);
    const jm = Math.floor(t1 + t2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8;
    return { face, ix: jm & mask, iy: nside - (jp & mask) - 1 };
  }
  const ntt = Math.min(Math.floor(tt), 3);
  const tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = Math.min(Math.floor(tp * tmp), nside - 1);
  const jm = Math.min(Math.floor((1 - tp) * tmp), nside - 1);
  return z >= 0
    ? { face: ntt, ix: nside - jm - 1, iy: nside - jp - 1 }
    : { face: ntt + 8, ix: jp, iy: jm };
}

/**
 * The tile (`pix` at `order`) and the pixel in it (`column`, `row`, from
 * its top-left corner) of a direction.
 */
export function hipsTilePixel(order, z, phi) {
  const nside = 2 ** (order + tileBits);
  const { face, ix, iy } = healpixFaceXY(nside, z, phi);
  const tilesPerSide = 2 ** order;
  const pix =
    face * tilesPerSide * tilesPerSide +
    spreadBits(ix >> tileBits) +
    2 * spreadBits(iy >> tileBits);
  const local = hipsTileWidth - 1;
  // Inside a tile the NESTED x runs down the rows and y across the columns.
  return { pix, column: iy & local, row: ix & local };
}

/**
 * The RGB pixels (`size` x `size` x 3, row by row from the top) of a TAN
 * cutout `fieldDegrees` wide centred on `raDegrees`, `decDegrees`, sampled
 * `oversampling` times per pixel side and averaged; `null` when no tile at
 * all could be read. `parallelLoads` asks for every tile at once instead of
 * one after the other (the caller bounds its own concurrency).
 */
export async function hipsCutout({
  raDegrees,
  decDegrees,
  fieldDegrees,
  size = 512,
  oversampling = 2,
  order = cutoutOrder(fieldDegrees, size),
  loadTile,
  parallelLoads = false,
}) {
  const side = size * oversampling;
  const radians = Math.PI / 180;
  const ra0 = raDegrees * radians;
  const dec0 = decDegrees * radians;
  const sinDec0 = Math.sin(dec0);
  const cosDec0 = Math.cos(dec0);
  const span = fieldDegrees * radians;
  const tileOf = new Float64Array(side * side);
  const offsetOf = new Int32Array(side * side);
  const wanted = new Set();
  for (let row = 0; row < side; row += 1) {
    const eta = -((row + 0.5) / side - 0.5) * span;
    for (let column = 0; column < side; column += 1) {
      const xi = -((column + 0.5) / side - 0.5) * span;
      const rho = Math.hypot(xi, eta);
      const c = Math.atan(rho);
      const sinC = Math.sin(c);
      const cosC = Math.cos(c);
      const sinDec =
        cosC * sinDec0 + (rho > 0 ? (eta * sinC * cosDec0) / rho : 0);
      const ra =
        ra0 +
        Math.atan2(xi * sinC, rho * cosDec0 * cosC - eta * sinDec0 * sinC);
      const pixel = hipsTilePixel(order, Math.max(-1, Math.min(1, sinDec)), ra);
      const index = row * side + column;
      tileOf[index] = pixel.pix;
      offsetOf[index] = (pixel.row * hipsTileWidth + pixel.column) * 3;
      wanted.add(pixel.pix);
    }
  }
  const tiles = new Map();
  if (parallelLoads) {
    const pixels = [...wanted];
    const loaded = await Promise.all(pixels.map((pix) => loadTile(order, pix)));
    pixels.forEach((pix, index) => tiles.set(pix, loaded[index]));
  } else for (const pix of wanted) tiles.set(pix, await loadTile(order, pix));
  if (![...tiles.values()].some(Boolean)) return null;

  const output = new Uint8Array(size * size * 3);
  const samples = oversampling * oversampling;
  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let dy = 0; dy < oversampling; dy += 1)
        for (let dx = 0; dx < oversampling; dx += 1) {
          const index =
            (row * oversampling + dy) * side + column * oversampling + dx;
          const tile = tiles.get(tileOf[index]);
          if (!tile) continue;
          const offset = offsetOf[index];
          red += tile[offset];
          green += tile[offset + 1];
          blue += tile[offset + 2];
        }
      const target = (row * size + column) * 3;
      output[target] = Math.round(red / samples);
      output[target + 1] = Math.round(green / samples);
      output[target + 2] = Math.round(blue / samples);
    }
  return output;
}

/** HiPS's own path of a tile under a survey's root. */
export function hipsTilePath(order, pix, extension = "jpg") {
  const directory = Math.floor(pix / 10000) * 10000;
  return `Norder${order}/Dir${directory}/Npix${pix}.${extension}`;
}
