import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  offlinePackManifestDocument,
  offlinePackNotation,
} from "portal/offline-pack/manifest.js";
import { targetIndexPackComponent } from "portal/offline-pack/target-index.js";
import { skyQualityPackComponent } from "portal/offline-pack/sky-quality.js";
import {
  skyBackdropPackComponent,
  skyBackdropTierStates,
} from "portal/offline-pack/sky-backdrop.js";
import { resetSkyQualityRaster } from "portal/planner/sky-quality.server.js";
import { resetSkyTileMirror } from "portal/sky-tiles/mirror.js";
import { dssColourMeanTileBytesByOrder } from "portal/sky-tiles/surveys.js";

/** Restores an environment variable to whatever it held before a test that
 * needs to change it, whether or not it was set at all. */
function withEnv(name, value, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return (async () => {
    try {
      return await run();
    } finally {
      if (had) process.env[name] = previous;
      else delete process.env[name];
      resetSkyQualityRaster();
      resetSkyTileMirror();
    }
  })();
}

test("offlinePackManifestDocument: pure envelope, stable ETag, no generation timestamp", () => {
  const catalogue = { revision: "abc", targets: 3, locales: ["en"] };
  const components = [{ id: "target-index", kind: "index-pages" }];
  const first = offlinePackManifestDocument({ catalogue, components });
  const second = offlinePackManifestDocument({ catalogue, components });
  assert.equal(first.manifest.v, offlinePackNotation);
  assert.equal(first.json, second.json);
  assert.equal(first.etag, second.etag);
  assert.match(first.etag, /^"[A-Za-z0-9_-]+"$/);
  assert.ok(!("generatedAt" in first.manifest));

  const changed = offlinePackManifestDocument({
    catalogue: { ...catalogue, revision: "def" },
    components,
  });
  assert.notEqual(changed.etag, first.etag);
});

test("targetIndexPackComponent: sizes measured against the real, provided pages", async () => {
  const pages = ["a".repeat(100), "b".repeat(250)];
  let calls = 0;
  const component = await targetIndexPackComponent({
    total: 1500,
    pageSize: 1000,
    revision: "rev-1",
    urlTemplate: "target-index/{locale}/{offset}.json",
    pageJson: async (page) => {
      calls += 1;
      return pages[page];
    },
  });
  assert.equal(calls, 2, "1500 targets at pageSize 1000 is two pages");
  assert.deepEqual(component, {
    id: "target-index",
    kind: "index-pages",
    required: true,
    revision: "rev-1",
    pageSize: 1000,
    pages: 2,
    estimatedBytes: 350,
    estimatedEncodedBytes: component.estimatedEncodedBytes,
    urlTemplate: "target-index/{locale}/{offset}.json",
  });
  assert.ok(
    component.estimatedEncodedBytes < component.estimatedBytes,
    "gzip must actually shrink a repetitive page",
  );
});

test("skyQualityPackComponent: absent with nothing installed, present with custom URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-offline-pack-sq-"));
  await withEnv("ASTRO_PORTAL_SKY_QUALITY_RASTER_DIR", directory, async () => {
    assert.equal(await skyQualityPackComponent(), null);

    const packDirectory = join(directory, "pack");
    await mkdir(packDirectory, { recursive: true });
    const raster = Buffer.alloc(3600 * 1800, 3);
    await writeFile(join(packDirectory, "raster.bin"), raster);
    await writeFile(
      join(packDirectory, "manifest.json"),
      JSON.stringify({
        file: "raster.bin",
        year: 2026,
        attribution: "Fixture VIIRS composite",
        license: "CC BY 4.0",
        grid: { cellSizeDegrees: 0.1, width: 3600, height: 1800 },
      }),
    );

    const component = await skyQualityPackComponent({
      manifestUrl: "sky-quality/manifest.json",
      rasterUrl: "sky-quality/raster.bin",
    });
    assert.ok(component);
    const checksum = createHash("sha256").update(raster).digest("hex");
    assert.equal(component.revision, `sha256:${checksum}`);
    assert.deepEqual(
      component.files.map((file) => file.url),
      ["sky-quality/manifest.json", "sky-quality/raster.bin"],
    );
    assert.equal(component.attribution, "Fixture VIIRS composite");
    assert.equal(component.license, "CC BY 4.0");
    assert.equal(component.year, 2026);
  });
  await rm(directory, { recursive: true, force: true });
});

test("skyBackdropTierStates/skyBackdropPackComponent: on-demand with an empty mirror, custom URL templates honoured", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-offline-pack-sb-"));
  await withEnv("ASTRO_PORTAL_SKY_TILE_MIRROR_DIR", directory, async () => {
    const survey = {
      id: "dss-colour",
      format: "jpg",
      maxOrder: 9,
      archiveChunkDelta: 4,
    };
    const tierStates = await skyBackdropTierStates(survey);
    assert.ok(tierStates.every((tier) => tier.state === "on-demand"));

    const component = skyBackdropPackComponent(
      {
        survey,
        meanTileBytesByOrder: dssColourMeanTileBytesByOrder,
        tierStates,
      },
      {
        archiveUrlTemplate:
          "sky-tiles/{survey}/Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar",
        tileUrlTemplate:
          "sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
      },
    );
    assert.equal(component.id, "sky-backdrop");
    assert.equal(component.kind, "hips-tiles");
    assert.equal(
      component.archiveUrlTemplate,
      "sky-tiles/{survey}/Norder{order}/Chunk{chunkOrder}/{chunkPix}.tar",
    );
    assert.equal(
      component.tileUrlTemplate,
      "sky-tiles/{survey}/Norder{order}/Dir{dir}/Npix{pix}.{format}",
    );
    assert.deepEqual(
      component.tiers.map((tier) => tier.id),
      ["essential", "standard", "comfort", "quality"],
    );
    assert.ok(component.tiers.every((tier) => tier.state === "on-demand"));
  });
  await rm(directory, { recursive: true, force: true });
});

// A service that cannot provide a tier says so on the tier
// (`unavailable: true`), by the rule that later makes it answer `409`
// (`sky-tiles/tier-fit.js`). Only the live manifest asks for it — it hands
// `skyBackdropTierStates` the tile sizes to judge by; a static pack (no
// preparation) never does, and its tiers stay exactly as they were.
test("skyBackdropTierStates/skyBackdropPackComponent: a tier that cannot fit the mirror's limit is announced unavailable, additively, only when the caller judges by tile sizes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-offline-pack-fit-"));
  const survey = {
    id: "dss-colour",
    format: "jpg",
    maxOrder: 9,
    archiveChunkDelta: 4,
  };
  await withEnv("ASTRO_PORTAL_SKY_TILE_MIRROR_DIR", directory, async () => {
    // Four GiB, the default: only the fourth tier is too big for it.
    const judged = await skyBackdropTierStates(survey, {
      meanTileBytesByOrder: dssColourMeanTileBytesByOrder,
    });
    assert.deepEqual(
      judged.map((tier) => [tier.state, tier.unavailable]),
      [
        ["on-demand", undefined],
        ["on-demand", undefined],
        ["on-demand", undefined],
        ["on-demand", true],
      ],
    );
    // The tile sizes may come as a promise, so that reading them and reading
    // the archives go on side by side.
    const promised = await skyBackdropTierStates(survey, {
      meanTileBytesByOrder: Promise.resolve(dssColourMeanTileBytesByOrder),
    });
    assert.deepEqual(
      promised.map((tier) => tier.unavailable),
      judged.map((tier) => tier.unavailable),
    );

    const component = skyBackdropPackComponent({
      survey,
      meanTileBytesByOrder: dssColourMeanTileBytesByOrder,
      tierStates: judged,
    });
    assert.deepEqual(
      component.tiers.map((tier) => [tier.id, tier.unavailable]),
      [
        ["essential", undefined],
        ["standard", undefined],
        ["comfort", undefined],
        ["quality", true],
      ],
    );
    // What a tier said before is untouched.
    assert.ok(component.tiers.every((tier) => tier.estimatedBytes > 0));
    assert.ok(component.tiers.every((tier) => tier.state === "on-demand"));

    // Not asked to judge: nothing is announced, whatever the limit.
    const notJudged = await skyBackdropTierStates(survey);
    assert.ok(notJudged.every((tier) => !("unavailable" in tier)));
    const plain = skyBackdropPackComponent({
      survey,
      meanTileBytesByOrder: dssColourMeanTileBytesByOrder,
      tierStates: notJudged,
    });
    assert.ok(plain.tiers.every((tier) => !("unavailable" in tier)));
  });
  await withEnv("ASTRO_PORTAL_SKY_TILE_MIRROR_DIR", directory, async () => {
    await withEnv("ASTRO_PORTAL_SKY_TILE_MIRROR_MAX_BYTES", "1", async () => {
      // A limit of one byte: nothing fits — but nothing is built either, so
      // every tier is announced; and `false` is never written.
      const tiny = await skyBackdropTierStates(survey, {
        meanTileBytesByOrder: dssColourMeanTileBytesByOrder,
      });
      assert.ok(tiny.every((tier) => tier.unavailable === true));
    });
  });
  await rm(directory, { recursive: true, force: true });
});
