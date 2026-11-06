import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  capturePathFor,
  sharedCopyPathFor,
} from "../dist/uploads/capture-storage.js";
import {
  DerivedImageError,
  SHARED_COPY_LONG_SIDE,
  SHARED_COPY_QUALITY,
  ensureSharedCopy,
  isShowable,
} from "../dist/uploads/derived-images.js";
import {
  bufferReader,
  readImageMetadata,
} from "../dist/sky-check/image-metadata.js";
import {
  fitsFile,
  jpegWithPosition,
  pngWithText,
  starField,
  tiff16WithPosition,
} from "./helpers/synthetic-images.mjs";

// The shared copy of a capture: the only file the galleries serve. No
// EXIF, no XMP, no IPTC — no position, no place, no camera serial, no
// comment —, 4096 px at most on its long side, and the original never
// modified.

const tenantId = "space-camille";
let root;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test.before(async () => {
  root = await mkdtemp(join(tmpdir(), "shared-copy-"));
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(root, "captures");
});
test.after(async () => {
  delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
  await rm(root, { recursive: true, force: true });
});

async function stored(bytes) {
  const digest = sha(bytes);
  const path = capturePathFor(tenantId, digest);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return digest;
}

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Everything a copy must not carry, read from its bytes and its metadata. */
async function assertNothingOfThePlace(bytes) {
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined, "no EXIF");
  assert.equal(metadata.xmp, undefined, "no XMP");
  assert.equal(metadata.iptc, undefined, "no IPTC");
  const read = await readImageMetadata(bufferReader(bytes), {
    type: "image/jpeg",
  });
  assert.equal(read.gps, false, "no position");
  for (const text of [
    "Exif\0\0",
    "xpacket",
    "Photoshop 3.0",
    "8BIM",
    "GPS",
    "Col des M",
    "Lac Noir",
    "SN-000",
    "Exemple",
  ])
    assert.equal(bytes.includes(Buffer.from(text, "utf8")), false, text);
  return metadata;
}

test("a JPEG with a position in its EXIF and its XMP, and an IPTC record: the copy has none of it, and the original is unchanged", async () => {
  const original = await jpegWithPosition({ width: 1200, height: 800 });
  const before = await readImageMetadata(bufferReader(original), {
    type: "image/jpeg",
  });
  assert.equal(before.gps, true, "the source carries a position");
  assert.ok(original.includes(Buffer.from("Photoshop 3.0", "latin1")));
  const digest = await stored(original);
  const { path, created } = await ensureSharedCopy({
    tenantId,
    sha256: digest,
  });
  assert.equal(created, true);
  assert.equal(path, sharedCopyPathFor(tenantId, digest));
  const metadata = await assertNothingOfThePlace(await readFile(path));
  assert.deepEqual([metadata.width, metadata.height], [1200, 800]);
  assert.equal(sha(await readFile(capturePathFor(tenantId, digest))), digest);
  // Kept once written: the next need reads the same file.
  assert.deepEqual(await ensureSharedCopy({ tenantId, sha256: digest }), {
    path,
    created: false,
  });
});

test("a PNG with a text chunk naming the place, a 16-bit TIFF: an 8-bit JPEG without metadata", async () => {
  const png = await pngWithText({ width: 600, height: 400 });
  assert.ok(png.includes(Buffer.from("Col des Melezes")));
  const pngDigest = await stored(png);
  const pngCopy = await readFile(
    (await ensureSharedCopy({ tenantId, sha256: pngDigest })).path,
  );
  await assertNothingOfThePlace(pngCopy);
  assert.equal(
    sha(await readFile(capturePathFor(tenantId, pngDigest))),
    pngDigest,
  );

  const tiff = tiff16WithPosition({ width: 900, height: 600 });
  const tiffMetadata = await sharp(tiff).metadata();
  assert.equal(tiffMetadata.depth, "ushort");
  assert.equal(
    (await readImageMetadata(bufferReader(tiff), { type: "image/tiff" })).gps,
    true,
    "the source carries a position",
  );
  const tiffDigest = await stored(tiff);
  const tiffCopy = await readFile(
    (await ensureSharedCopy({ tenantId, sha256: tiffDigest })).path,
  );
  const copied = await assertNothingOfThePlace(tiffCopy);
  assert.equal(copied.depth, "uchar");
  assert.equal(copied.space, "srgb");
  assert.equal(
    sha(await readFile(capturePathFor(tenantId, tiffDigest))),
    tiffDigest,
  );
});

test("a 6000 px original is copied at 4096 px on its long side; a 3000 px one stays 3000 px", async () => {
  const large = await starField({ width: 6000, height: 3000 })
    .jpeg()
    .toBuffer();
  const largeCopy = await sharp(
    await readFile(
      (await ensureSharedCopy({ tenantId, sha256: await stored(large) })).path,
    ),
  ).metadata();
  assert.equal(SHARED_COPY_LONG_SIDE, 4096);
  assert.deepEqual([largeCopy.width, largeCopy.height], [4096, 2048]);

  const tall = await starField({ width: 2000, height: 3000, seed: 8 })
    .png()
    .toBuffer();
  const tallCopy = await sharp(
    await readFile(
      (await ensureSharedCopy({ tenantId, sha256: await stored(tall) })).path,
    ),
  ).metadata();
  assert.deepEqual([tallCopy.width, tallCopy.height], [2000, 3000]);
});

test("a FITS file and a camera's raw file have no copy: not_showable, and nothing is written", async () => {
  const fits = fitsFile({ width: 200, height: 100 });
  // A camera's raw file is built like a TIFF (here a Nikon NEF, by its
  // maker and its extension): a gallery never shows one.
  const nef = await starField({ width: 64, height: 48, seed: 2 })
    .withExif({ IFD0: { Make: "NIKON CORPORATION", Model: "Test" } })
    .tiff()
    .toBuffer();
  for (const [bytes, originalName] of [
    [fits, "M31_Light_300s.fits"],
    [nef, "DSC_0042.NEF"],
  ]) {
    const digest = await stored(bytes);
    assert.equal(await isShowable(tenantId, digest, { originalName }), false);
    await assert.rejects(
      ensureSharedCopy({ tenantId, sha256: digest, originalName }),
      (error) =>
        error instanceof DerivedImageError && error.code === "not_showable",
    );
    assert.equal(await exists(sharedCopyPathFor(tenantId, digest)), false);
    assert.equal(sha(await readFile(capturePathFor(tenantId, digest))), digest);
  }
  // An image that cannot be decoded: no copy, `shared_copy_failed`.
  const broken = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("not really a JPEG"),
  ]);
  const brokenDigest = await stored(broken);
  assert.equal(await isShowable(tenantId, brokenDigest), true);
  await assert.rejects(
    ensureSharedCopy({ tenantId, sha256: brokenDigest }),
    (error) => error.code === "shared_copy_failed",
  );
  assert.equal(await exists(sharedCopyPathFor(tenantId, brokenDigest)), false);
});

test("the shared copy is a JPEG at quality 92 with chroma not subsampled (4:4:4)", async () => {
  assert.equal(SHARED_COPY_QUALITY, 92);
  const source = await starField({ width: 1200, height: 800, seed: 21 })
    .png()
    .toBuffer();
  const copy = await readFile(
    (await ensureSharedCopy({ tenantId, sha256: await stored(source) })).path,
  );
  const metadata = await sharp(copy).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.chromaSubsampling, "4:4:4");
});
