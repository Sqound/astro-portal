/**
 * HEALPix NESTED-scheme geometry the sky-tile mirror needs to validate a
 * request path and lay out an archive. Everything here is a pure function
 * of small integers — no filesystem, no environment variable, no network —
 * so it is safe to call on every incoming request.
 *
 * Two formulas are load-bearing and must never change:
 *
 * - the ancestor shift, `ancestor = pix >> (2 * (order - ancestorOrder))`;
 * - the directory bucket, `dir = floor(pix / 10000) * 10000`.
 *
 * Both are pinned by the shared
 * `packages/astro-contracts/fixtures/healpix-ancestor.json` fixture (from
 * `healpixGeometryFixtureCase` below).
 */

/** How many HEALPix pixels the whole sky holds at `order` (12·4^order). */
export function healpixPixelCount(order) {
  if (!Number.isInteger(order) || order < 0) return 0;
  return 12 * 4 ** order;
}

/** Whether `pix` is a valid NESTED index at `order`. */
export function isValidHealpixPix(order, pix) {
  return Number.isInteger(pix) && pix >= 0 && pix < healpixPixelCount(order);
}

/**
 * The `Dir{d}` bucket a HiPS tree groups `Npix{pix}` files under. Every
 * implementation (CDS's own, the Stellarium proxy's cousin routes, the
 * clients) agrees on this bucketing regardless of `order`, which is
 * why it only takes `pix`.
 */
export function healpixTileDir(pix) {
  return Math.floor(pix / 10000) * 10000;
}

/** `{order, pix}` -> the `Dir{d}` bucket, fixture-shaped (object in, value
 * out) to match the other two functions below. */
export function healpixTileDirOf({ pix }) {
  return healpixTileDir(pix);
}

/**
 * The NESTED pixel of `order` that contains `pix` of `order` itself, at
 * `ancestorOrder` (which must be `<= order`; `pix` unchanged when equal).
 * A NESTED index is a quadtree, so climbing it is a right shift — never a
 * search.
 */
export function healpixAncestorPix({ order, pix, ancestorOrder }) {
  if (ancestorOrder >= order) return pix;
  return pix >> (2 * (order - ancestorOrder));
}

/**
 * The inclusive `[first, last]` NESTED range, and its `count`, of every
 * pixel of `order` that descends from `chunkPix` at `chunkOrder` — the
 * mirror's archive-aggregation rule: one archive holds every
 * tile of `order` under one ancestor cell `order - chunkOrder` levels up.
 * `order` must be `>= chunkOrder`.
 */
export function healpixChunkDescendants({ chunkOrder, chunkPix, order }) {
  const delta = order - chunkOrder;
  const span = 4 ** delta;
  const first = chunkPix * span;
  return { first, last: first + span - 1, count: span };
}

/**
 * The single dispatch point the `healpix-ancestor` fixture
 * calls: one JSON fixture mixes three input shapes, so
 * this reads which keys are present and routes to the named function above
 * rather than splitting one fixture into three. Production code (`mirror.js`,
 * the route handler) calls the three functions directly; nothing here is a
 * public API surface of its own beyond feeding the fixture.
 */
export function healpixGeometryFixtureCase(input) {
  if (Object.prototype.hasOwnProperty.call(input, "ancestorOrder"))
    return healpixAncestorPix(input);
  if (Object.prototype.hasOwnProperty.call(input, "chunkOrder"))
    return healpixChunkDescendants(input);
  return healpixTileDirOf(input);
}

/**
 * The archive-chunk order/pix a survey's low orders (`0..archiveChunkDelta -
 * 1`) collapse onto: a single, fixed cumulative archive rather than the
 * general per-order aggregation (the orders 0..3 fit in ONE
 * archive). Chosen to stay inside the manifest's existing
 * `archiveUrlTemplate` shape (`Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar`)
 * instead of a bespoke URL: `order` and `chunkOrder` both equal
 * `archiveChunkDelta - 1`, `chunkPix` is always `0`.
 */
export function lowOrderArchiveAddress(archiveChunkDelta) {
  const order = archiveChunkDelta - 1;
  return { order, chunkOrder: order, chunkPix: 0 };
}

/**
 * Whether `(order, chunkOrder, chunkPix)` names the fixed low-order
 * cumulative archive rather than a standard per-order chunk.
 */
export function isLowOrderArchiveAddress(
  { order, chunkOrder, chunkPix },
  archiveChunkDelta,
) {
  const address = lowOrderArchiveAddress(archiveChunkDelta);
  return (
    order === address.order &&
    chunkOrder === address.chunkOrder &&
    chunkPix === address.chunkPix
  );
}

/**
 * Every `{order, pix}` an archive request resolves to, in the mirror's
 * canonical (and therefore deterministic) order: ascending `order`, then
 * ascending `pix` within it. For a standard per-order chunk this is a single
 * order's contiguous NESTED range; for the low-order cumulative archive it
 * walks every order from 0 through the fixed ceiling, each in full.
 *
 * Returns `null` for a request that resolves to neither shape (the route's
 * own regex already refuses most of these; this is the second, semantic
 * check — order bounds, chunkPix bounds against `chunkOrder`).
 */
export function archiveTileAddresses(
  { order, chunkOrder, chunkPix },
  { maxOrder, archiveChunkDelta },
) {
  if (
    !Number.isInteger(order) ||
    !Number.isInteger(chunkOrder) ||
    !Number.isInteger(chunkPix) ||
    order < 0 ||
    order > maxOrder ||
    chunkOrder < 0
  )
    return null;

  if (
    isLowOrderArchiveAddress({ order, chunkOrder, chunkPix }, archiveChunkDelta)
  ) {
    const addresses = [];
    for (let o = 0; o <= order; o += 1) {
      const count = healpixPixelCount(o);
      for (let pix = 0; pix < count; pix += 1)
        addresses.push({ order: o, pix });
    }
    return addresses;
  }

  if (chunkOrder !== order - archiveChunkDelta) return null;
  if (!isValidHealpixPix(chunkOrder, chunkPix)) return null;
  const { first, last } = healpixChunkDescendants({
    chunkOrder,
    chunkPix,
    order,
  });
  const addresses = [];
  for (let pix = first; pix <= last; pix += 1) addresses.push({ order, pix });
  return addresses;
}

/**
 * An archive's path below `/v1/sky-tiles/{survey}/` — also its key in the
 * mirror's archive index and its path below `archives/{survey}/` on disk —
 * from its address alone: `Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar`.
 */
export function archiveRelativePath({ order, chunkOrder, chunkPix }) {
  return `Norder${order}/Chunk${chunkOrder}/${chunkPix}.tar`;
}

/**
 * How many tiles one archive holds: every tile of orders `0..order` for the
 * fixed low-order archive (1,020 at `archiveChunkDelta` 4), `4^archiveChunkDelta`
 * (256) for a per-order chunk. Needs no survey and never lists the tiles.
 */
export function archiveTileCount(address, archiveChunkDelta) {
  if (isLowOrderArchiveAddress(address, archiveChunkDelta)) {
    let total = 0;
    for (let order = 0; order <= address.order; order += 1)
      total += healpixPixelCount(order);
    return total;
  }
  return 4 ** (address.order - address.chunkOrder);
}

/**
 * Every archive `{order, chunkOrder, chunkPix}` a tier (its `maxOrder`) is
 * made of, in the same order `skyBackdropArchiveChunkDelta`-based counting
 * (`packages/portal/src/sky-tiles/surveys.js`'s `archiveCumulativeCount`)
 * expects: the fixed low-order archive first, then each order from
 * `archiveChunkDelta` through `maxOrder`, ascending `chunkPix` within an
 * order. Used both to check whether a tier is `ready` (every archive already
 * on disk) and by `prepare-sky-tile-pack.mjs` to build a tier in full.
 */
export function tierArchiveAddresses(maxOrder, archiveChunkDelta) {
  const addresses = [lowOrderArchiveAddress(archiveChunkDelta)];
  for (let order = archiveChunkDelta; order <= maxOrder; order += 1) {
    const chunkOrder = order - archiveChunkDelta;
    const count = healpixPixelCount(chunkOrder);
    for (let chunkPix = 0; chunkPix < count; chunkPix += 1)
      addresses.push({ order, chunkOrder, chunkPix });
  }
  return addresses;
}

const tilePathPattern = /^Norder(\d+)\/Dir(\d+)\/Npix(\d+)\.([A-Za-z0-9]+)$/;
const archivePathPattern = /^Norder(\d+)\/Chunk(\d+)\/(\d+)\.tar$/;
const propertiesPathPattern = /^properties$/;

/**
 * Parses and fully validates a request's `[...path]` segments against one
 * `survey` (already resolved from the server-side table — never from the
 * request itself, per the task's security note) and the mirror-wide
 * `archiveChunkDelta` (a single shared constant across every survey, not a
 * per-survey field — kept as an explicit parameter here rather than an
 * expected `survey.archiveChunkDelta` property precisely so a caller can
 * never silently pass a survey object that lacks it). Returns `null` for
 * anything not exactly matching one of the three shapes the mirror serves:
 * a tile, an archive, or the survey's `properties` file. This is the single
 * choke point path traversal, an out-of-range order, a mismatched `Dir`, an
 * out-of-bounds `pix`/`chunkPix`, or a wrong extension must pass through.
 */
export function parseSkyTileRequestPath(
  pathSegments,
  survey,
  archiveChunkDelta,
) {
  const path = (pathSegments || []).join("/");

  if (propertiesPathPattern.test(path)) return { kind: "properties" };

  const tileMatch = tilePathPattern.exec(path);
  if (tileMatch) {
    const order = Number(tileMatch[1]);
    const dir = Number(tileMatch[2]);
    const pix = Number(tileMatch[3]);
    const extension = tileMatch[4];
    if (order > survey.maxOrder) return null;
    if (!isValidHealpixPix(order, pix)) return null;
    if (dir !== healpixTileDir(pix)) return null;
    if (extension !== survey.format) return null;
    return { kind: "tile", order, dir, pix, extension };
  }

  const archiveMatch = archivePathPattern.exec(path);
  if (archiveMatch) {
    const order = Number(archiveMatch[1]);
    const chunkOrder = Number(archiveMatch[2]);
    const chunkPix = Number(archiveMatch[3]);
    if (order > survey.maxOrder) return null;
    const addresses = archiveTileAddresses(
      { order, chunkOrder, chunkPix },
      { maxOrder: survey.maxOrder, archiveChunkDelta },
    );
    if (!addresses) return null;
    return { kind: "archive", order, chunkOrder, chunkPix, addresses };
  }

  return null;
}
