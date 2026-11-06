import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  cutoutOrder,
  hipsCutout,
  hipsTilePath,
  hipsTilePixel,
} from "../src/target-field-image/cutout.js";
import {
  createTargetFieldImageService,
  targetFieldImageFolder,
} from "../src/target-field-image/service.js";

// EYEPIECE-FIELD-01: the field image the portal cuts, processes and keeps.

// NESTED HEALPix tiles and in-tile pixels, computed by an independent
// cutter, whose
// cutouts correlate at 0.90-0.99 with the portal's hips2fits thumbnails:
// [order, z, phi, tile, row, column].
const healpixVectors = [
  [3, 0.3, 0.1, 310, 158, 148],
  [3, -0.5, 2.0, 621, 95, 416],
  [3, 0.9, 4.0, 182, 6, 309],
  [3, -0.95, 5.5, 707, 283, 278],
  [3, 0.66, 1.2, 22, 36, 434],
  [3, 0.0, 0.0, 282, 0, 511],
  [3, 0.999, 3.3, 191, 310, 489],
  [3, -0.2, 6.2, 270, 192, 114],
  [7, 0.3, 0.1, 79408, 485, 333],
];

test("the tile and pixel of a direction are HiPS's own", () => {
  for (const [order, z, phi, pix, row, column] of healpixVectors)
    assert.deepEqual(hipsTilePixel(order, z, phi), { pix, row, column });
  assert.equal(hipsTilePath(7, 79408), "Norder7/Dir70000/Npix79408.jpg");
});

test("the order's pixels are at least as fine as the cutout's", () => {
  assert.equal(cutoutOrder(0.91, 512), 7);
  assert.equal(cutoutOrder(0.1, 512), 9);
  assert.equal(cutoutOrder(5.1, 512), 4);
  assert.equal(cutoutOrder(60, 512), 3);
});

test("a cutout reads every tile it covers, and nothing without tiles", async () => {
  const asked = [];
  const rgb = await hipsCutout({
    raDegrees: 0.8973,
    decDegrees: 67.1616,
    fieldDegrees: 0.91,
    size: 16,
    loadTile: async (order, pix) => {
      asked.push(`${order}/${pix}`);
      return new Uint8Array(512 * 512 * 3).fill(100);
    },
  });
  assert.equal(rgb.length, 16 * 16 * 3);
  assert.ok(rgb.every((value) => value === 100));
  assert.ok(
    asked.length >= 1 &&
      asked.every((key) => key.startsWith(`${cutoutOrder(0.91, 16)}/`)),
  );
  assert.equal(
    await hipsCutout({
      raDegrees: 10,
      decDegrees: 40,
      fieldDegrees: 1,
      size: 8,
      loadTile: async () => null,
    }),
    null,
  );
});

async function jpeg(width, height, grey) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: grey, g: grey, b: grey },
    },
  })
    .jpeg()
    .toBuffer();
}

function answer(bytes, status = 200) {
  return new Response(bytes, {
    status,
    headers: { "content-type": bytes ? "image/jpeg" : "text/plain" },
  });
}

async function withService(fetch, run) {
  const directory = await mkdtemp(join(tmpdir(), "target-field-image-"));
  let time = 1_000_000;
  const service = createTargetFieldImageService({
    directory,
    fetch,
    now: () => time,
    timeoutMs: 1000,
  });
  try {
    await run(service, directory, (milliseconds) => (time += milliseconds));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const request = {
  targetId: "openngc-ngc7822",
  raDegrees: 0.8973,
  decDegrees: 67.1616,
  fieldDegrees: 0.91,
};

test("hips2fits's cut is processed like the thumbnails and kept on disk", async () => {
  const urls = [];
  const cut = await jpeg(512, 512, 120);
  await withService(
    async (url) => {
      urls.push(String(url));
      return answer(cut);
    },
    async (service, directory) => {
      const first = await service.ensure(request);
      assert.equal(first.status, "ready");
      assert.match(first.etag, /^"[0-9a-f]{20}"$/);
      const url = new URL(urls[0]);
      assert.equal(url.host, "alasky.cds.unistra.fr");
      assert.equal(url.searchParams.get("hips"), "CDS/P/DSS2/color");
      assert.equal(url.searchParams.get("fov"), "0.91");
      assert.equal(url.searchParams.get("width"), "512");
      assert.equal(url.searchParams.get("projection"), "TAN");
      const { data, info } = await sharp(first.bytes)
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 512);
      assert.equal((await sharp(first.bytes).metadata()).channels, 1);
      // 120 through grey levels, brightness 58 %, contrast -15 %: 79.
      assert.ok(Math.abs(data[0] - (0.4927 * 120 + 19.65)) <= 1.5, data[0]);
      const second = await service.ensure(request);
      assert.equal(urls.length, 1, "the second answer is read from the disk");
      assert.equal(second.etag, first.etag);
      assert.deepEqual(await readdir(directory), ["openngc-ngc7822"]);
      assert.deepEqual(await readdir(join(directory, "openngc-ngc7822")), [
        "0.91.jpg",
      ]);
    },
  );
});

test("without hips2fits the field is cut from the ESAC tiles first", async () => {
  const urls = [];
  const tile = await jpeg(512, 512, 90);
  await withService(
    async (url) => {
      urls.push(String(url));
      if (String(url).includes("hips2fits")) throw new Error("timeout");
      return answer(tile);
    },
    async (service) => {
      const result = await service.ensure(request);
      assert.equal(result.status, "ready");
      const tiles = urls.filter((url) => !url.includes("hips2fits"));
      assert.ok(tiles.length >= 1);
      assert.ok(
        tiles.every((url) =>
          url.startsWith("https://skies.esac.esa.int/DSSColor/Norder7/"),
        ),
      );
      // Both CDS hosts are left alone for a while once they did not answer.
      urls.length = 0;
      await service.ensure({ ...request, fieldDegrees: 1 });
      assert.ok(urls.every((url) => !url.includes("cds.unistra.fr")));
    },
  );
});

test("a field nobody could cut is unavailable, and not asked again at once", async () => {
  let calls = 0;
  await withService(
    async () => {
      calls += 1;
      return answer(null, 404);
    },
    async (service, directory, advance) => {
      const result = await service.ensure(request);
      assert.equal(result.status, "unavailable");
      assert.equal(result.retryAfterSeconds, 60);
      const asked = calls;
      assert.equal((await service.ensure(request)).status, "unavailable");
      assert.equal(calls, asked);
      advance(61_000);
      await service.ensure(request);
      assert.ok(calls > asked);
      assert.deepEqual(await readdir(directory), []);
    },
  );
});

test("a target's folder is its id, made safe", () => {
  assert.equal(targetFieldImageFolder("openngc-ngc7822"), "openngc-ngc7822");
  assert.match(targetFieldImageFolder("Sh2 155:A"), /^sh2_155_a-[0-9a-f]{10}$/);
  assert.match(targetFieldImageFolder(".."), /^_+-[0-9a-f]{10}$/);
});
