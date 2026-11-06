import assert from "node:assert/strict";
import test from "node:test";

import { ustarBlockSize } from "portal/sky-tiles/tar.js";
import {
  archiveCumulativeCount,
  dssColourMeanTileBytesByOrder,
  dssColourMeanTileBytesForOrder,
  healpixCumulativeTileCount,
  skyBackdropArchiveChunkDelta,
  skyBackdropTierDefinitions,
  skyBackdropTierRawTileBytes,
  skyBackdropTiers,
  skyBackdropWeightedMeanTileBytes,
  tarArchiveOverheadBytes,
  ustarMeanPaddingBytesPerEntry,
} from "portal/sky-tiles/surveys.js";

test("dssColourMeanTileBytesByOrder documents an exact census for orders 0-3 and a 150-tile sample for 4-6", () => {
  const orders = [0, 1, 2, 3, 4, 5, 6];
  assert.deepEqual(
    Object.keys(dssColourMeanTileBytesByOrder)
      .map(Number)
      .sort((a, b) => a - b),
    orders,
  );
  // Orders 0-2 are not monotonic among themselves (order 0's 12 huge
  // whole-sky tiles average differently from 1/2's smaller crops) — only
  // from order 3 on does every deeper order measure bigger than the last,
  // which is the basis `dssColourMeanTileBytesForOrder` extrapolates from.
  for (let order = 3; order <= 6; order += 1) {
    assert.ok(
      dssColourMeanTileBytesByOrder[order] >
        dssColourMeanTileBytesByOrder[order - 1],
      `order ${order} must be bigger than order ${order - 1} once the deep-order growth trend starts`,
    );
  }
});

test("dssColourMeanTileBytesForOrder is a direct lookup within the table, and a prudent (rounded-up, growing) extrapolation past it", () => {
  for (const order of [0, 1, 2, 3, 4, 5, 6]) {
    assert.equal(
      dssColourMeanTileBytesForOrder(order),
      dssColourMeanTileBytesByOrder[order],
    );
  }
  const order6 = dssColourMeanTileBytesByOrder[6];
  const order5 = dssColourMeanTileBytesByOrder[5];
  const growthRatio = order6 / order5;
  const order7 = dssColourMeanTileBytesForOrder(7);
  assert.ok(order7 > order6, "extrapolation must keep growing, never flatten");
  assert.equal(order7, Math.ceil(order6 * growthRatio));
  const order8 = dssColourMeanTileBytesForOrder(8);
  assert.equal(order8, Math.ceil(order6 * growthRatio ** 2));
  // A negative or non-integer order falls back to the lowest measured order
  // rather than extrapolating downward into nonsense.
  assert.equal(
    dssColourMeanTileBytesForOrder(-1),
    dssColourMeanTileBytesByOrder[0],
  );
});

test("tarArchiveOverheadBytes: one header + half a block of padding per tile, plus one end marker per archive — reused constants, never a guessed percentage", () => {
  assert.equal(ustarMeanPaddingBytesPerEntry, ustarBlockSize / 2);
  const overhead = tarArchiveOverheadBytes({
    tileCount: 1020,
    archiveCount: 1,
  });
  assert.equal(
    overhead,
    1020 * ustarBlockSize +
      1020 * ustarMeanPaddingBytesPerEntry +
      1 * ustarBlockSize * 2,
  );
  // Confirmed against the one archive measured in full, 2026-09-20:
  // Norder3/Chunk3/0.tar was 44,856,832 B on disk against 44,077,440 B of
  // real tile bytes — 779,392 B of real overhead. This formula predicts
  // 784,384 B, a 0.6% margin — the padding-of-the-mean alternative this
  // replaces would have predicted only ~602,668 B, a 23% margin.
  assert.equal(overhead, 784384);
  const realOverhead = 44856832 - 44077440;
  assert.ok(
    Math.abs(overhead - realOverhead) / realOverhead < 0.01,
    `expected within 1% of the real measured overhead (${realOverhead}), got ${overhead}`,
  );
});

test("skyBackdropTierDefinitions: essential/standard/comfort/quality, in that order, at max orders 3/4/5/6", () => {
  assert.deepEqual(skyBackdropTierDefinitions, [
    { id: "essential", maxOrder: 3 },
    { id: "standard", maxOrder: 4 },
    { id: "comfort", maxOrder: 5 },
    { id: "quality", maxOrder: 6 },
  ]);
});

test("skyBackdropTiers: exact cumulative tile and archive counts (1,020/4,092/16,380/65,532 tiles; 1/13/61/253 archives)", () => {
  const tiers = skyBackdropTiers(
    dssColourMeanTileBytesByOrder,
    skyBackdropArchiveChunkDelta,
  );
  assert.deepEqual(
    tiers.map((tier) => tier.tiles),
    [1020, 4092, 16380, 65532],
  );
  assert.deepEqual(
    tiers.map((tier) =>
      archiveCumulativeCount(tier.maxOrder, skyBackdropArchiveChunkDelta),
    ),
    [1, 13, 61, 253],
  );
  for (const tier of tiers) {
    assert.equal(tier.tiles, healpixCumulativeTileCount(tier.maxOrder));
    assert.ok(Number.isInteger(tier.estimatedBytes));
    assert.ok(tier.estimatedBytes > 0);
  }
  // estimatedBytes must be STRICTLY increasing tier over tier — the whole
  // point of a per-order table is that a deeper tier is never cheaper.
  for (let index = 1; index < tiers.length; index += 1)
    assert.ok(tiers[index].estimatedBytes > tiers[index - 1].estimatedBytes);
});

test("skyBackdropTiers' estimatedBytes = per-order raw tile bytes + the real tar overhead, never tiles * a single flat mean", () => {
  const tiers = skyBackdropTiers(
    dssColourMeanTileBytesByOrder,
    skyBackdropArchiveChunkDelta,
  );
  for (const tier of tiers) {
    const rawTileBytes = skyBackdropTierRawTileBytes(
      dssColourMeanTileBytesByOrder,
      tier.maxOrder,
    );
    const archiveCount = archiveCumulativeCount(
      tier.maxOrder,
      skyBackdropArchiveChunkDelta,
    );
    const overhead = tarArchiveOverheadBytes({
      tileCount: tier.tiles,
      archiveCount,
    });
    assert.equal(tier.estimatedBytes, Math.round(rawTileBytes) + overhead);
  }
  // The approximate paliers (DSS colour): essential
  // ≈ 42 MiB, standard ≈ 0.2 GiB, comfort ≈ 1.06 GiB, quality ≈ 5.3 GiB.
  const mib = 1024 * 1024;
  const gib = 1024 * mib;
  assert.ok(Math.abs(tiers[0].estimatedBytes - 42 * mib) < 2 * mib);
  assert.ok(Math.abs(tiers[1].estimatedBytes - 0.2 * gib) < 0.02 * gib);
  assert.ok(Math.abs(tiers[2].estimatedBytes - 1.06 * gib) < 0.05 * gib);
  assert.ok(Math.abs(tiers[3].estimatedBytes - 5.3 * gib) < 0.1 * gib);
});

test("skyBackdropWeightedMeanTileBytes is the tile-count-weighted mean over the given orders, not a flat average of the per-order means", () => {
  const weighted = skyBackdropWeightedMeanTileBytes(
    dssColourMeanTileBytesByOrder,
    3,
  );
  const flatAverage = Math.round(
    (dssColourMeanTileBytesByOrder[0] +
      dssColourMeanTileBytesByOrder[1] +
      dssColourMeanTileBytesByOrder[2] +
      dssColourMeanTileBytesByOrder[3]) /
      4,
  );
  // The weighted mean must be dominated by order 3 (768 of the 1,020
  // tiles) — its own mean (43,507) is much closer to the weighted result
  // than the naive flat average of the four per-order means would be.
  assert.notEqual(weighted, flatAverage);
  assert.ok(
    Math.abs(weighted - dssColourMeanTileBytesByOrder[3]) <
      Math.abs(flatAverage - dssColourMeanTileBytesByOrder[3]),
  );
  assert.equal(weighted, 43213);
});

test("skyBackdropTiers accepts meanTileBytesByOrder with string-keyed orders (as decoded from JSON) exactly like numeric keys", () => {
  const stringKeyed = Object.fromEntries(
    Object.entries(dssColourMeanTileBytesByOrder).map(([order, bytes]) => [
      String(order),
      bytes,
    ]),
  );
  const fromStrings = skyBackdropTiers(
    stringKeyed,
    skyBackdropArchiveChunkDelta,
  );
  const fromNumbers = skyBackdropTiers(
    dssColourMeanTileBytesByOrder,
    skyBackdropArchiveChunkDelta,
  );
  assert.deepEqual(fromStrings, fromNumbers);
});
