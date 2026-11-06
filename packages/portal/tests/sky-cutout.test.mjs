import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  createSkyCutoutService,
  skyCutoutRelativePath,
  skyCutoutRequest,
  skyCutoutSize,
} from "portal/sky-cutout/service.js";
import { createSkyTileMirror } from "portal/sky-tiles/mirror.js";
import { hipsTilePixel } from "portal/target-field-image/cutout.js";

import {
  createFakeHipsUpstream,
  unreachableUpstreamUrl,
} from "./helpers/fake-hips-upstream.mjs";

// `GET /v1/sky-cutout`'s service: the cutout cut from the tile mirror's own
// tiles (served here by local fake upstreams, real JPEGs, never the CDS),
// its cache key, the partial and fallback cases.

const fastSleep = () => Promise.resolve();

async function solidTile(rgb, { grey = false } = {}) {
  const image = sharp({
    create: { width: 512, height: 512, channels: 3, background: rgb },
  });
  return (grey ? image.toColourspace("b-w") : image).jpeg().toBuffer();
}

function surveyFor(id, roots) {
  return {
    id,
    hipsId: `TEST/${id}`,
    format: "jpg",
    tileWidth: 512,
    maxOrder: 9,
    frame: "equatorial",
    upstreamRoot: roots[0],
    upstreamRoots: roots,
  };
}

async function harness({ colourRoots, redRoots }) {
  const directory = await mkdtemp(join(tmpdir(), "astro-sky-cutout-"));
  const mirror = createSkyTileMirror({
    directory: join(directory, "tiles"),
    sleepImpl: fastSleep,
    upstreamConnectTimeoutMs: 200,
    upstreamTimeoutMs: 2000,
  });
  const surveys = {
    "dss-colour": surveyFor("dss-colour", colourRoots),
    "dss2-red": surveyFor("dss2-red", redRoots),
  };
  const service = createSkyCutoutService({
    directory: join(directory, "cutouts"),
    mirror,
    surveys,
  });
  return {
    service,
    directory,
    close: () =>
      rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      }),
  };
}

async function pixelsOf(bytes) {
  const { data, info } = await sharp(bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, info };
}

test("the request is validated and quantised to its cache key", () => {
  const request = skyCutoutRequest({
    surveyId: "dss-colour",
    raDegrees: 314.123456,
    decDegrees: 30.987654,
    fov: 1.38123,
  });
  // One pixel of 1.38° over 640 px is 0.0022°: the centre to 0.001°.
  assert.deepEqual(
    { ...request, digits: undefined },
    {
      surveyId: "dss-colour",
      raDegrees: 314.123,
      decDegrees: 30.988,
      fieldDegrees: 1.38,
      digits: undefined,
    },
  );
  assert.equal(
    skyCutoutRelativePath(request),
    join("dss-colour", "1.38", "314.123_30.988.jpg"),
  );
  // 360 is 0; a tiny field keeps more digits.
  assert.equal(
    skyCutoutRequest({
      surveyId: "dss2-red",
      raDegrees: 360,
      decDegrees: 0,
      fov: 0.02,
    }).raDegrees,
    0,
  );
  assert.equal(
    skyCutoutRequest({
      surveyId: "dss2-red",
      raDegrees: 10.1234567,
      decDegrees: 0,
      fov: 0.02,
    }).raDegrees,
    10.12346,
  );
  for (const wrong of [
    { surveyId: "cta-fram", raDegrees: 1, decDegrees: 1, fov: 1 },
    { surveyId: "__proto__", raDegrees: 1, decDegrees: 1, fov: 1 },
    { surveyId: "dss-colour", raDegrees: -1, decDegrees: 1, fov: 1 },
    { surveyId: "dss-colour", raDegrees: 361, decDegrees: 1, fov: 1 },
    { surveyId: "dss-colour", raDegrees: 1, decDegrees: 91, fov: 1 },
    { surveyId: "dss-colour", raDegrees: 1, decDegrees: 1, fov: 0.01 },
    { surveyId: "dss-colour", raDegrees: 1, decDegrees: 1, fov: 21 },
    { surveyId: "dss-colour", raDegrees: Number.NaN, decDegrees: 1, fov: 1 },
  ])
    assert.equal(skyCutoutRequest(wrong), null, JSON.stringify(wrong));
});

test("a complete cutout is the tiles' own pixels, kept on disk and served again without the upstream", async () => {
  const tile = await solidTile({ r: 200, g: 120, b: 40 });
  const upstream = await createFakeHipsUpstream({ tileBody: () => tile });
  const red = await createFakeHipsUpstream({ tileBody: () => tile });
  const { service, directory, close } = await harness({
    colourRoots: [upstream.url],
    redRoots: [red.url],
  });
  try {
    const request = skyCutoutRequest({
      surveyId: "dss-colour",
      raDegrees: 314.0,
      decDegrees: 30.7,
      fov: 1.38,
    });
    const first = await service.ensure(request);
    assert.equal(first.status, "ready");
    assert.equal(first.complete, true);
    assert.equal(first.surveyId, "dss-colour");
    assert.equal(first.fallback, false);
    assert.match(first.etag, /^"[0-9a-f]{20}"$/);
    const { data, info } = await pixelsOf(first.bytes);
    assert.equal(info.width, skyCutoutSize);
    assert.equal(info.height, skyCutoutSize);
    // No tone curve: the tile's colour, give or take the JPEG.
    const centre = (320 * skyCutoutSize + 320) * info.channels;
    assert.ok(Math.abs(data[centre] - 200) <= 6, `red ${data[centre]}`);
    assert.ok(Math.abs(data[centre + 1] - 120) <= 6);
    assert.ok(Math.abs(data[centre + 2] - 40) <= 6);
    const fetched = upstream.requestCount;
    assert.ok(fetched >= 1);
    // Kept: the second answer reads the disk, the upstream is not asked.
    const second = await service.ensure(request);
    assert.equal(second.complete, true);
    assert.equal(second.etag, first.etag);
    assert.equal(upstream.requestCount, fetched);
    const kept = await readdir(
      join(directory, "cutouts", "dss-colour", "1.38"),
    );
    assert.deepEqual(kept, ["314.000_30.700.jpg"]);
  } finally {
    await upstream.close();
    await red.close();
    await close();
  }
});

test("a grey dss2-red tile is cut like a colour one", async () => {
  const tile = await solidTile({ r: 90, g: 90, b: 90 }, { grey: true });
  const red = await createFakeHipsUpstream({ tileBody: () => tile });
  const { service, close } = await harness({
    colourRoots: [await unreachableUpstreamUrl()],
    redRoots: [red.url],
  });
  try {
    const result = await service.ensure(
      skyCutoutRequest({
        surveyId: "dss2-red",
        raDegrees: 83.8,
        decDegrees: -5.4,
        fov: 0.5,
      }),
    );
    assert.equal(result.status, "ready");
    assert.equal(result.surveyId, "dss2-red");
    assert.equal(result.complete, true);
    const { data } = await pixelsOf(result.bytes);
    assert.ok(Math.abs(data[0] - 90) <= 6);
  } finally {
    await red.close();
    await close();
  }
});

test("a cutout with a tile missing is served, said partial and never kept", async () => {
  const tile = await solidTile({ r: 30, g: 60, b: 90 });
  const request = skyCutoutRequest({
    surveyId: "dss-colour",
    raDegrees: 0.05,
    decDegrees: 0.05,
    fov: 2,
  });
  // The tile under the centre is missing (a 404 from the only root).
  const order = 6;
  const centre = hipsTilePixel(
    order,
    Math.sin((request.decDegrees * Math.PI) / 180),
    (request.raDegrees * Math.PI) / 180,
  ).pix;
  const upstream = await createFakeHipsUpstream({
    tileBody: (path) => (path.endsWith(`/Npix${centre}.jpg`) ? null : tile),
  });
  const { service, directory, close } = await harness({
    colourRoots: [upstream.url],
    redRoots: [upstream.url],
  });
  try {
    const result = await service.ensure(request);
    assert.equal(result.status, "ready");
    assert.equal(result.complete, false);
    await assert.rejects(readdir(join(directory, "cutouts", "dss-colour")));
  } finally {
    await upstream.close();
    await close();
  }
});

test("dss2-red with no tile at all falls back on dss-colour and says so", async () => {
  const tile = await solidTile({ r: 10, g: 20, b: 30 });
  const colour = await createFakeHipsUpstream({ tileBody: () => tile });
  const { service, close } = await harness({
    colourRoots: [colour.url],
    redRoots: [await unreachableUpstreamUrl(), await unreachableUpstreamUrl()],
  });
  try {
    const result = await service.ensure(
      skyCutoutRequest({
        surveyId: "dss2-red",
        raDegrees: 10.68,
        decDegrees: 41.27,
        fov: 1.1,
      }),
    );
    assert.equal(result.status, "ready");
    assert.equal(result.surveyId, "dss-colour");
    assert.equal(result.fallback, true);
    assert.equal(result.complete, true);
  } finally {
    await colour.close();
    await close();
  }
});

test("no tile from any root answers unavailable with a delay", async () => {
  const { service, close } = await harness({
    colourRoots: [await unreachableUpstreamUrl()],
    redRoots: [await unreachableUpstreamUrl()],
  });
  try {
    const result = await service.ensure(
      skyCutoutRequest({
        surveyId: "dss2-red",
        raDegrees: 10.68,
        decDegrees: 41.27,
        fov: 1.1,
      }),
    );
    assert.equal(result.status, "unavailable");
    assert.ok(result.retryAfterSeconds > 0);
  } finally {
    await close();
  }
});
