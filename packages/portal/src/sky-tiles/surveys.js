/**
 * The sky-backdrop survey table and HEALPix tile-pyramid geometry, shared by
 * the offline-pack manifest (this module's first consumer) and the HiPS
 * mirror that will actually serve the tiles. The manifest only reads this to
 * *describe* what a client could download and at what estimated size; the
 * mirror is the one that builds and serves the bytes this module only
 * estimates.
 *
 * Everything here is a pure function of well-known constants — no
 * filesystem, no environment variable, no network. That is what lets the
 * manifest import it directly and the mirror reuse it unmodified once it
 * exists.
 *
 * `ustarBlockSize` is imported from `./tar.js` (also a pure module) rather
 * than re-declared here: the tar-overhead arithmetic below (`tarArchiveOverheadBytes`)
 * must never silently drift from the one writer that actually produces an
 * archive's bytes.
 */
import { ustarBlockSize } from "./tar.js";

/**
 * The surveys the tile mirror serves, keyed by the id the clients use.
 * `dss-colour` is the sky backdrop of the offline pack
 * (`defaultSkyBackdropSurveyId` below: the pack names that one survey, never
 * this whole table); `dss2-red` is the DSS2 red survey the visual mode cuts
 * its views from (`GET /v1/sky-cutout`), mirrored tile by tile on demand and
 * never part of the pack. A survey is added here, never hand-encoded at a
 * call site. Keeping the tile layer independent of the chosen survey (a URL
 * plus an attribution string) is what lets a differently-licensed survey
 * replace DSS later without touching the tile-rendering code.
 *
 * No wide-field survey (CTA-FRAM and the like) is mirrored: its terms of
 * redistribution are not settled, and nothing the portal cuts needs one.
 */
export const skyBackdropSurveys = {
  "dss-colour": {
    id: "dss-colour",
    hipsId: "CDS/P/DSS2/color",
    format: "jpg",
    tileWidth: 512,
    maxOrder: 9,
    frame: "equatorial",
    attribution:
      "DSS2 colour — CDS/Strasbourg HiPS of the Digitized Sky Survey",
    license: "ODbL-1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    imageryCopyright: "Caltech, AAO, SERC/PPARC, AURA",
    // `upstreamRoot` stays the first entry, for every reader that predates
    // `upstreamRoots` (the offline-pack manifest's schema keeps both,
    // additively — see packages/astro-contracts/schemas/api/offline-pack.schema.json).
    // The second root is the CDS's own documented backup instance of the
    // first: fetching the exact same path from it (2026-09-20) serves a
    // `properties` file for the identical HiPS id (`creator_did =
    // ivo://CDS/P/DSS2/color`) — the CDS does not fill in this file's own
    // (commented-out, templated) `hips_service_url` field to announce the
    // relationship, so this was confirmed by content rather than by that
    // field; see docs/SKY_TILES_MIRROR.md#mirrored-upstream-roots.
    //
    // The third root, the last resort, is ESA's ESASky mirror of the same
    // HiPS: its `properties` (read 2026-10-29) declares `creator_did =
    // ivo://CDS/P/DSS2/color`, `hips_order = 9`, `hips_tile_width = 512`,
    // `hips_tile_format = jpeg` and `hips_frame = equatorial`, the same
    // tiles at the same paths. It answered that evening while both CDS
    // hosts did not accept a connection; it is slower (about 7 s a request),
    // hence last.
    upstreamRoot: "https://alasky.cds.unistra.fr/DSS/DSSColor/",
    upstreamRoots: [
      "https://alasky.cds.unistra.fr/DSS/DSSColor/",
      "https://alaskybis.cds.unistra.fr/DSS/DSSColor/",
      "https://skies.esac.esa.int/DSSColor/",
    ],
  },
  "dss2-red": {
    id: "dss2-red",
    hipsId: "CDS/P/DSS2/red",
    format: "jpg",
    tileWidth: 512,
    maxOrder: 9,
    frame: "equatorial",
    attribution: "DSS2 red — CDS/Strasbourg HiPS of the Digitized Sky Survey",
    license: "ODbL-1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    imageryCopyright: "Caltech, AAO, SERC/PPARC, AURA",
    // The CDS's two hosts only: ESASky has no copy of this HiPS
    // (`https://skies.esac.esa.int/DSS2Merged/properties` answered 404 on
    // 2026-10-29). While neither CDS host answers, only the tiles already
    // in the mirror's cache are served.
    upstreamRoot: "https://alasky.cds.unistra.fr/DSS/DSS2Merged/",
    upstreamRoots: [
      "https://alasky.cds.unistra.fr/DSS/DSS2Merged/",
      "https://alaskybis.cds.unistra.fr/DSS/DSS2Merged/",
    ],
  },
};

export const defaultSkyBackdropSurveyId = "dss-colour";

/**
 * A whole-sky HEALPix pyramid has 12·4^k tiles at order k. Every cumulative
 * count below (a tier's `tiles`, an archive count) is derived from this one
 * formula, so a tier's advertised size can never drift from its `maxOrder`
 * by hand-typing the wrong number.
 */
export function healpixTileCountAtOrder(order) {
  return 12 * 4 ** order;
}

/** Σ 12·4^k for k = 0..maxOrder — the tile count of a pyramid walked from
 * order 0 through order `maxOrder` inclusive. */
export function healpixCumulativeTileCount(maxOrder) {
  let total = 0;
  for (let order = 0; order <= maxOrder; order += 1)
    total += healpixTileCountAtOrder(order);
  return total;
}

/**
 * The mirror's aggregation rule: one archive holds every tile of order `order`
 * under one ancestor cell `archiveChunkDelta` orders up, i.e.
 * 4^archiveChunkDelta tiles per archive. Every order below `archiveChunkDelta`
 * fits inside a single shared archive instead — see `archiveCumulativeCount`.
 */
export function archiveCountAtOrder(order, archiveChunkDelta) {
  return order < archiveChunkDelta
    ? 0
    : healpixTileCountAtOrder(order - archiveChunkDelta);
}

/**
 * The number of archive requests needed to fetch every tile from order 0
 * through `maxOrder` inclusive: the one shared archive for orders below
 * `archiveChunkDelta`, plus one archive per ancestor cell at each order at
 * or above it. For `archiveChunkDelta = 4` this reproduces the design
 * doc's measured 1 / 61 / 253 archive counts for maxOrder 3 / 5 / 6.
 */
export function archiveCumulativeCount(maxOrder, archiveChunkDelta) {
  if (maxOrder < 0) return 0;
  let total = 0;
  for (let order = archiveChunkDelta; order <= maxOrder; order += 1)
    total += archiveCountAtOrder(order, archiveChunkDelta);
  return 1 + total;
}

/**
 * Mean JPEG bytes/tile for DSS2 colour (512 px), **per HEALPix order** —
 * measured 2026-09-20 running the real mirror against the CDS (see
 * `docs/SKY_TILES_MIRROR.md#mean-tile-size-by-order`). Tile size **grows
 * with order** (deeper orders crop tighter, more detailed fields — the
 * densest Milky Way tiles at order 6 ran 166–232 KiB, far above even this
 * order's own mean), so the single flat constant this table replaces
 * (`dssColourMeanTileBytes = 37683`, one measurement at whole-sky order 3)
 * understated every deeper tier once actually measured — by roughly 2× at
 * order 6. A single mean can never be safe to advertise for every tier
 * again; every consumer of a tile size must key off the order.
 *
 * - **Orders 0–3: EXACT.** Every one of the 1,020 tiles at these orders was
 *   actually fetched while filling the "essential" tier in full (1,020
 *   tiles, 44,077,440 B total) — a census, not a sample.
 * - **Orders 4–6: SAMPLED.** A random sample of 150 tiles per order (fixed
 *   seed, `prepare-sky-tile-pack.mjs --sample`), not a full census; the true
 *   whole-sky mean could differ slightly from these 150-tile samples.
 *
 * Orders 0–2 are NOT monotonic among themselves (order 0's 12 huge
 * whole-sky tiles average differently from the smaller crops at 1 and 2),
 * but from order 3 on every deeper order measured bigger than the last —
 * 43,507 → 54,519 → 75,403 → 92,750. An order beyond this table (7+; none
 * of today's tiers reach that far) has never been measured at all —
 * `dssColourMeanTileBytesForOrder` below extrapolates that same growth
 * trend for it rather than silently reusing order 6's own value, which
 * would only repeat this same table's original mistake.
 */
export const dssColourMeanTileBytesByOrder = {
  0: 48467, // exact — 12 tiles
  1: 43093, // exact — 48 tiles
  2: 41740, // exact — 192 tiles
  3: 43507, // exact — 768 tiles
  4: 54519, // sampled — 150/3,072 tiles
  5: 75403, // sampled — 150/12,288 tiles
  6: 92750, // sampled — 150/49,152 tiles
};

const dssColourMeanTileBytesMeasuredOrders = Object.keys(
  dssColourMeanTileBytesByOrder,
)
  .map(Number)
  .sort((a, b) => a - b);
const dssColourMeanTileBytesMaxMeasuredOrder =
  dssColourMeanTileBytesMeasuredOrders[
    dssColourMeanTileBytesMeasuredOrders.length - 1
  ];
/** The growth observed between the last two MEASURED orders (order 5 → 6,
 * ×1.230 as of 2026-09-20) — the basis for extrapolating past the table
 * rather than assuming flat (see `dssColourMeanTileBytesForOrder`). */
const dssColourMeanTileBytesGrowthRatio =
  dssColourMeanTileBytesByOrder[dssColourMeanTileBytesMaxMeasuredOrder] /
  dssColourMeanTileBytesByOrder[dssColourMeanTileBytesMaxMeasuredOrder - 1];

/**
 * The documented mean bytes/tile for `order`: a direct lookup in
 * `dssColourMeanTileBytesByOrder` when it has been measured, or — for an
 * order past the table — a PRUDENT extrapolation: the last measured order's
 * own mean, compounded by `dssColourMeanTileBytesGrowthRatio` for every
 * order past it, rounded UP. Every order from 3 through 6 measured bigger
 * than the last, so continuing that growth past order 6 is the safe
 * assumption; flatly repeating order 6's own value would only repeat this
 * table's original mistake (a single flat constant that badly understated
 * every deeper order once measured). None of today's tiers reach an order
 * this table has not measured — this only guards a future, deeper tier.
 */
export function dssColourMeanTileBytesForOrder(order) {
  if (
    Object.prototype.hasOwnProperty.call(dssColourMeanTileBytesByOrder, order)
  )
    return dssColourMeanTileBytesByOrder[order];
  if (!Number.isInteger(order) || order < 0)
    return dssColourMeanTileBytesByOrder[0];
  const extraOrders = order - dssColourMeanTileBytesMaxMeasuredOrder;
  return Math.ceil(
    dssColourMeanTileBytesByOrder[dssColourMeanTileBytesMaxMeasuredOrder] *
      dssColourMeanTileBytesGrowthRatio ** extraOrders,
  );
}

export const skyBackdropArchiveChunkDelta = 4;

/**
 * The tar-format overhead a real archive pays PER ENTRY: one 512-byte
 * `ustar` header (`ustarBlockSize`, from `./tar.js` — the exact constant
 * `writeUstarEntry` itself writes, never a re-typed copy) and padding to the
 * next block boundary. The real per-entry padding depends on that tile's
 * own exact byte count, unknowable ahead of a real fetch, so it is
 * estimated at HALF a block: a compressed image's size modulo 512 is
 * effectively uniformly distributed, so the expected padding to the next
 * boundary is `ustarBlockSize / 2` — confirmed against the one archive
 * measured in full so far (`Norder3/Chunk3/0.tar`, 2026-09-20: 1,020
 * entries, 256,128 B of real padding = 251.1 B/entry, a 2% margin from the
 * 256 B/entry this estimate assumes). This is markedly closer to that real
 * archive's total overhead (779,392 B measured vs. 784,384 B this formula
 * predicts, a 0.6% margin) than the flat "≈1.9% of a ~37 KiB tile" guess
 * `tar.js` used to document, which this replaces.
 */
export const ustarMeanPaddingBytesPerEntry = ustarBlockSize / 2;

/**
 * The full tar overhead — headers, estimated padding (see
 * `ustarMeanPaddingBytesPerEntry`), and the mandatory two-block
 * end-of-archive marker, once per archive file (`archiveCount`, never per
 * tile) — for a set of archives covering `tileCount` tiles in total.
 * Calculated from the format's own constants, never a guessed percentage.
 */
export function tarArchiveOverheadBytes({ tileCount, archiveCount }) {
  return (
    tileCount * ustarBlockSize +
    tileCount * ustarMeanPaddingBytesPerEntry +
    archiveCount * ustarBlockSize * 2
  );
}

/**
 * The cumulative sky-backdrop tiers offered by the offline pack, as
 * `{ id, maxOrder }` alone — the one place their identity and order live,
 * shared by `skyBackdropTiers` (which adds `tiles`/`estimatedBytes`) and by
 * anything that only needs to know which tiers exist and up to which order
 * (`portal-app/lib/offline-pack.server.js`'s `skyBackdropTierStates`), so neither
 * ever hand-types a second copy of this list that could drift from the
 * first. `standard` (additive) sits between `essential` and `comfort` — a
 * mid-sized fill for a device that wants more than the lowest-order defaults but
 * cannot afford `comfort`'s ~1 GiB.
 */
export const skyBackdropTierDefinitions = [
  { id: "essential", maxOrder: 3 },
  { id: "standard", maxOrder: 4 },
  { id: "comfort", maxOrder: 5 },
  { id: "quality", maxOrder: 6 },
];

/**
 * Σ `tileCount(order) * meanTileBytesByOrder[order]` for `order` = 0..`maxOrder`
 * — the raw (pre-tar-overhead) tile bytes a tier's cumulative pyramid holds,
 * from a PER-ORDER mean table (`meanTileBytesByOrder`, keyed by order as
 * either a number or a JSON-decoded string) rather than one flat average.
 */
export function skyBackdropTierRawTileBytes(meanTileBytesByOrder, maxOrder) {
  let total = 0;
  for (let order = 0; order <= maxOrder; order += 1) {
    const mean =
      meanTileBytesByOrder[order] ?? meanTileBytesByOrder[String(order)];
    total += healpixTileCountAtOrder(order) * mean;
  }
  return total;
}

/**
 * The single `meanTileBytes` figure kept for compatibility with a reader
 * that predates `meanTileBytesByOrder`: the tile-count-WEIGHTED mean over
 * every order in the LOWEST tier (`essential`, orders 0..3) — never a flat
 * average across every order (which would overweight the numerically huge
 * deeper orders relative to what `essential` alone actually downloads).
 */
export function skyBackdropWeightedMeanTileBytes(
  meanTileBytesByOrder,
  maxOrder,
) {
  let totalBytes = 0;
  let totalTiles = 0;
  for (let order = 0; order <= maxOrder; order += 1) {
    const tiles = healpixTileCountAtOrder(order);
    const mean =
      meanTileBytesByOrder[order] ?? meanTileBytesByOrder[String(order)];
    totalBytes += tiles * mean;
    totalTiles += tiles;
  }
  return Math.round(totalBytes / totalTiles);
}

/**
 * The cumulative sky-backdrop tiers offered by the offline pack, from
 * `skyBackdropTierDefinitions`. `tiles` is the exact HEALPix cumulative
 * count (`healpixCumulativeTileCount`); `estimatedBytes` is the per-order
 * raw tile bytes (`skyBackdropTierRawTileBytes`) PLUS the real tar overhead
 * every archive this tier is made of actually pays
 * (`tarArchiveOverheadBytes`, from the exact archive count
 * `archiveCumulativeCount` computes) — never a single `tiles * meanTileBytes`
 * multiplication against one flat average, which is what made the old
 * estimate for `comfort`/`quality` badly understate reality. Deliberately
 * excludes `state`: whether a tier is already built on disk (`ready`) or
 * must be fetched on demand is the mirror's own knowledge, added by the
 * manifest builder, not this geometry table — and once `ready`, the
 * manifest builder REPLACES this `estimatedBytes` with the exact on-disk
 * archive total (`packages/portal/src/sky-tiles/mirror.js`'s `tierState`),
 * flagged additively with `exactBytes: true`.
 */
export function skyBackdropTiers(
  meanTileBytesByOrder = dssColourMeanTileBytesByOrder,
  archiveChunkDelta = skyBackdropArchiveChunkDelta,
) {
  return skyBackdropTierDefinitions.map(({ id, maxOrder }) => {
    const tiles = healpixCumulativeTileCount(maxOrder);
    const archiveCount = archiveCumulativeCount(maxOrder, archiveChunkDelta);
    const rawTileBytes = skyBackdropTierRawTileBytes(
      meanTileBytesByOrder,
      maxOrder,
    );
    const overheadBytes = tarArchiveOverheadBytes({
      tileCount: tiles,
      archiveCount,
    });
    return {
      id,
      maxOrder,
      tiles,
      estimatedBytes: Math.round(rawTileBytes) + overheadBytes,
    };
  });
}

/**
 * The fine top-up around plans, favorites and the extended catalogue
 * (orders 7-8). Its size is a rough estimate pending
 * measurement against the full catalogue, unlike
 * the tiers above — so, unlike them, it is not derived from a formula and
 * is not exposed as a function.
 */
export const skyBackdropTopUp = {
  maxOrderWide: 7,
  maxOrderFocus: 8,
  estimatedBytes: 210000000,
};
