import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveTileAddresses,
  healpixAncestorPix,
  healpixChunkDescendants,
  healpixGeometryFixtureCase,
  healpixPixelCount,
  healpixTileDir,
  healpixTileDirOf,
  isLowOrderArchiveAddress,
  isValidHealpixPix,
  lowOrderArchiveAddress,
  parseSkyTileRequestPath,
  tierArchiveAddresses,
} from "portal/sky-tiles/geometry.js";

const survey = {
  maxOrder: 9,
  format: "jpg",
};
// `archiveChunkDelta` is a mirror-wide constant, never a field on the survey
// table itself (packages/portal/src/sky-tiles/surveys.js) — passed to
// `parseSkyTileRequestPath` as its own explicit argument, exactly as the
// route handler passes it.
const archiveChunkDelta = 4;

test("healpixPixelCount is 12*4^order, and rejects a negative or non-integer order", () => {
  assert.equal(healpixPixelCount(0), 12);
  assert.equal(healpixPixelCount(3), 768);
  assert.equal(healpixPixelCount(9), 12 * 4 ** 9);
  assert.equal(healpixPixelCount(-1), 0);
  assert.equal(healpixPixelCount(1.5), 0);
});

test("healpixTileDir buckets by floor(pix / 10000) * 10000, matching HipsTileKey.path", () => {
  assert.equal(healpixTileDir(0), 0);
  assert.equal(healpixTileDir(9999), 0);
  assert.equal(healpixTileDir(10000), 10000);
  assert.equal(healpixTileDir(12345), 10000);
  assert.equal(healpixTileDirOf({ order: 3, pix: 12345 }), 10000);
});

test("healpixAncestorPix shifts by 2 bits per order climbed, and is identity at or below the pixel's own order", () => {
  // pix 4000 at order 5 -> order 3 ancestor: 4000 >> 4 == 250.
  assert.equal(
    healpixAncestorPix({ order: 5, pix: 4000, ancestorOrder: 3 }),
    250,
  );
  assert.equal(
    healpixAncestorPix({ order: 5, pix: 4000, ancestorOrder: 5 }),
    4000,
  );
  assert.equal(
    healpixAncestorPix({ order: 5, pix: 4000, ancestorOrder: 6 }),
    4000,
  );
});

test("healpixChunkDescendants gives the exact 4^delta contiguous NESTED range", () => {
  assert.deepEqual(
    healpixChunkDescendants({ chunkOrder: 1, chunkPix: 2, order: 5 }),
    {
      first: 512,
      last: 767,
      count: 256,
    },
  );
  assert.deepEqual(
    healpixChunkDescendants({ chunkOrder: 0, chunkPix: 0, order: 0 }),
    {
      first: 0,
      last: 0,
      count: 1,
    },
  );
});

test("healpixGeometryFixtureCase dispatches on the input shape", () => {
  assert.equal(
    healpixGeometryFixtureCase({ order: 5, pix: 4000, ancestorOrder: 3 }),
    healpixAncestorPix({ order: 5, pix: 4000, ancestorOrder: 3 }),
  );
  assert.deepEqual(
    healpixGeometryFixtureCase({ chunkOrder: 1, chunkPix: 2, order: 5 }),
    healpixChunkDescendants({ chunkOrder: 1, chunkPix: 2, order: 5 }),
  );
  assert.equal(
    healpixGeometryFixtureCase({ order: 3, pix: 12345 }),
    healpixTileDirOf({ order: 3, pix: 12345 }),
  );
});

test("the low-order archive address is fixed at order == chunkOrder == archiveChunkDelta - 1, chunkPix 0", () => {
  assert.deepEqual(lowOrderArchiveAddress(4), {
    order: 3,
    chunkOrder: 3,
    chunkPix: 0,
  });
  assert.ok(
    isLowOrderArchiveAddress({ order: 3, chunkOrder: 3, chunkPix: 0 }, 4),
  );
  assert.ok(
    !isLowOrderArchiveAddress({ order: 4, chunkOrder: 0, chunkPix: 0 }, 4),
  );
});

test("archiveTileAddresses: a standard per-order chunk is exactly 4^archiveChunkDelta tiles of one order", () => {
  const addresses = archiveTileAddresses(
    { order: 5, chunkOrder: 1, chunkPix: 2 },
    { maxOrder: 9, archiveChunkDelta: 4 },
  );
  assert.equal(addresses.length, 256);
  assert.ok(addresses.every((address) => address.order === 5));
  assert.equal(addresses[0].pix, 512);
  assert.equal(addresses.at(-1).pix, 767);
  // Deterministic, ascending order.
  for (let index = 1; index < addresses.length; index += 1)
    assert.ok(addresses[index].pix > addresses[index - 1].pix);
});

test("archiveTileAddresses: the low-order archive is every order 0..3 cumulative, 1020 tiles", () => {
  const addresses = archiveTileAddresses(
    { order: 3, chunkOrder: 3, chunkPix: 0 },
    { maxOrder: 9, archiveChunkDelta: 4 },
  );
  assert.equal(addresses.length, 1020);
  assert.deepEqual(addresses[0], { order: 0, pix: 0 });
  assert.deepEqual(addresses.at(-1), { order: 3, pix: 767 });
});

test("archiveTileAddresses rejects order beyond the survey's maxOrder, an inconsistent chunkOrder, and an out-of-bounds chunkPix", () => {
  assert.equal(
    archiveTileAddresses(
      { order: 10, chunkOrder: 6, chunkPix: 0 },
      { maxOrder: 9, archiveChunkDelta: 4 },
    ),
    null,
  );
  assert.equal(
    archiveTileAddresses(
      { order: 5, chunkOrder: 0, chunkPix: 0 },
      { maxOrder: 9, archiveChunkDelta: 4 },
    ),
    null,
  );
  assert.equal(
    archiveTileAddresses(
      { order: 5, chunkOrder: 1, chunkPix: 999999 },
      { maxOrder: 9, archiveChunkDelta: 4 },
    ),
    null,
  );
});

test("tierArchiveAddresses reproduces the design doc's exact archive counts (1 / 61 / 253)", () => {
  assert.equal(tierArchiveAddresses(3, 4).length, 1);
  assert.equal(tierArchiveAddresses(5, 4).length, 61);
  assert.equal(tierArchiveAddresses(6, 4).length, 253);
});

test("isValidHealpixPix bounds pix to [0, 12*4^order)", () => {
  assert.ok(isValidHealpixPix(0, 0));
  assert.ok(isValidHealpixPix(0, 11));
  assert.ok(!isValidHealpixPix(0, 12));
  assert.ok(!isValidHealpixPix(0, -1));
});

test("parseSkyTileRequestPath accepts a well-formed tile path", () => {
  assert.deepEqual(
    parseSkyTileRequestPath(
      ["Norder3", "Dir0", "Npix17.jpg"],
      survey,
      archiveChunkDelta,
    ),
    {
      kind: "tile",
      order: 3,
      dir: 0,
      pix: 17,
      extension: "jpg",
    },
  );
});

test("parseSkyTileRequestPath accepts the properties path", () => {
  assert.deepEqual(
    parseSkyTileRequestPath(["properties"], survey, archiveChunkDelta),
    { kind: "properties" },
  );
});

test("parseSkyTileRequestPath accepts a standard archive path and resolves its 256 addresses", () => {
  const parsed = parseSkyTileRequestPath(
    ["Norder5", "Chunk1", "2.tar"],
    survey,
    archiveChunkDelta,
  );
  assert.equal(parsed.kind, "archive");
  assert.equal(parsed.addresses.length, 256);
});

test("parseSkyTileRequestPath accepts the low-order archive path", () => {
  const parsed = parseSkyTileRequestPath(
    ["Norder3", "Chunk3", "0.tar"],
    survey,
    archiveChunkDelta,
  );
  assert.equal(parsed.kind, "archive");
  assert.equal(parsed.addresses.length, 1020);
});

test("parseSkyTileRequestPath refuses path traversal", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["..", "..", "etc", "passwd"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder3", "..", "Npix17.jpg"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses an order beyond the survey's maxOrder", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder10", "Dir0", "Npix1.jpg"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder10", "Chunk6", "0.tar"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses a pix out of bounds for its order", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder0", "Dir0", "Npix12.jpg"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses a Dir inconsistent with pix", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder3", "Dir10000", "Npix17.jpg"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses an extension that does not match the survey's format", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder3", "Dir0", "Npix17.png"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses a malformed chunk address", () => {
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder5", "Chunk2", "0.tar"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
  assert.equal(
    parseSkyTileRequestPath(
      ["Norder5", "Chunk1", "abc.tar"],
      survey,
      archiveChunkDelta,
    ),
    null,
  );
});

test("parseSkyTileRequestPath refuses an unrelated path shape entirely", () => {
  assert.equal(
    parseSkyTileRequestPath(["Norder3", "Dir0"], survey, archiveChunkDelta),
    null,
  );
  assert.equal(parseSkyTileRequestPath([], survey, archiveChunkDelta), null);
  assert.equal(
    parseSkyTileRequestPath(["allsky.jpg"], survey, archiveChunkDelta),
    null,
  );
});
