/**
 * Whether a sky-backdrop tier can fit in the tile mirror's byte budget — the
 * one rule behind both answers a service gives about it:
 *
 * - `POST .../tiers/{tier}/prepare` refuses a tier that could not fit with a
 *   `409` `sky_backdrop_tier_exceeds_mirror_limit` (`prepare.js`);
 * - `GET /v1/offline-pack` says so beforehand, by `unavailable: true` on that
 *   tier (`offline-pack/sky-backdrop.js`), so that a phone does not offer a
 *   level the service is going to refuse.
 *
 * Both call [skyBackdropTierFit]: what one says, the other says, by
 * construction, never by two copies of an arithmetic that could drift.
 */

import {
  archiveCumulativeCount,
  dssColourMeanTileBytesForOrder,
  healpixCumulativeTileCount,
  skyBackdropArchiveChunkDelta,
  skyBackdropTierRawTileBytes,
  tarArchiveOverheadBytes,
} from "./surveys.js";

/**
 * What a tier needs of the mirror's byte budget, from what the budget must
 * hold at once: every archive of the tier — protected while the task runs —
 * and the tiles of the archive being built. The tiles of the archives already
 * built are evictable, so they are not counted. Estimated from the per-order
 * tile sizes plus the real tar overhead, as the manifest's `estimatedBytes`
 * is.
 */
export function skyBackdropTierRequiredBytes({
  tier,
  meanTileBytesByOrder,
  archiveChunkDelta = skyBackdropArchiveChunkDelta,
}) {
  const meanOf = (order) =>
    meanTileBytesByOrder?.[order] ??
    meanTileBytesByOrder?.[String(order)] ??
    dssColourMeanTileBytesForOrder(order);
  const orders = {};
  for (let order = 0; order <= tier.maxOrder; order += 1)
    orders[order] = meanOf(order);
  const tiles = healpixCumulativeTileCount(tier.maxOrder);
  const archives =
    Math.round(skyBackdropTierRawTileBytes(orders, tier.maxOrder)) +
    tarArchiveOverheadBytes({
      tileCount: tiles,
      archiveCount: archiveCumulativeCount(tier.maxOrder, archiveChunkDelta),
    });
  const working = Math.round(
    Math.max(
      skyBackdropTierRawTileBytes(orders, archiveChunkDelta - 1),
      4 ** archiveChunkDelta * orders[tier.maxOrder],
    ),
  );
  return archives + working;
}

/**
 * `{ fits, requiredBytes, usableBytes, minimumLimitBytes }` for [tier] against
 * a mirror of [maxBytes] that keeps [evictionTargetRatio] of it in use.
 * `minimumLimitBytes` is the smallest limit that would let the tier fit.
 */
export function skyBackdropTierFit({
  tier,
  meanTileBytesByOrder,
  archiveChunkDelta = skyBackdropArchiveChunkDelta,
  maxBytes,
  evictionTargetRatio,
}) {
  const requiredBytes = skyBackdropTierRequiredBytes({
    tier,
    meanTileBytesByOrder,
    archiveChunkDelta,
  });
  const usableBytes = Math.floor(maxBytes * evictionTargetRatio);
  return {
    fits: requiredBytes <= usableBytes,
    requiredBytes,
    usableBytes,
    minimumLimitBytes: Math.ceil(requiredBytes / evictionTargetRatio),
  };
}
