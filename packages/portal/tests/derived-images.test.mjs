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
import { dirname, join, relative, sep } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  capturePathFor,
  derivedDirectoryFor,
  removeDerivedFiles,
  sharedCopyPathFor,
  thumbnailPathFor,
} from "../dist/uploads/capture-storage.js";
import {
  SHARED_COPY_LONG_SIDE,
  THUMBNAIL_LONG_SIDE,
  hasThumbnail,
  writeThumbnail,
} from "../dist/uploads/derived-images.js";
import {
  bufferReader,
  readImageMetadata,
} from "../dist/sky-check/image-metadata.js";
import {
  fitsFile,
  jpegWithPosition,
  starField,
} from "./helpers/synthetic-images.mjs";

// The files derived from a capture: where they live, their removal, the
// thumbnail. The shared copy is tested in shared-copy.test.mjs.

const tenantId = "space-camille";
let root;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test.before(async () => {
  root = await mkdtemp(join(tmpdir(), "derived-images-"));
  process.env.ASTRO_PORTAL_CAPTURES_DIR = join(root, "captures");
});
test.after(async () => {
  delete process.env.ASTRO_PORTAL_CAPTURES_DIR;
  await rm(root, { recursive: true, force: true });
});

/** Stores `bytes` as a capture of the space, as an upload would. */
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

test("the derived files live under the space's directory, beside the originals, and go together", async () => {
  const bytes = await starField({ width: 120, height: 80 }).png().toBuffer();
  const digest = await stored(bytes);
  const directory = derivedDirectoryFor(tenantId, digest);
  assert.equal(
    relative(join(root, "captures", tenantId), directory),
    ["derived", digest].join(sep),
  );
  // The originals' prefix directories have two characters: `derived` and
  // `uploads` never collide with one.
  assert.equal(
    relative(
      join(root, "captures", tenantId),
      capturePathFor(tenantId, digest),
    ).split(sep)[0].length,
    2,
  );
  assert.equal(dirname(thumbnailPathFor(tenantId, digest)), directory);
  assert.equal(dirname(sharedCopyPathFor(tenantId, digest)), directory);
  assert.throws(() => derivedDirectoryFor("../other", digest));
  assert.throws(() => derivedDirectoryFor(tenantId, "../../x"));

  await writeThumbnail({ tenantId, sha256: digest });
  await writeFile(sharedCopyPathFor(tenantId, digest), "copy");
  assert.equal(await hasThumbnail(tenantId, digest), true);
  await removeDerivedFiles(tenantId, digest);
  assert.equal(await exists(directory), false);
  // The original stays; removing what is not there is not an error.
  assert.deepEqual(await readFile(capturePathFor(tenantId, digest)), bytes);
  await removeDerivedFiles(tenantId, digest);
});

test("a thumbnail is oriented by its EXIF, reduced, WebP, without any metadata", async () => {
  // 2000 × 1000 stored, turned a quarter by its EXIF (orientation 6).
  const bytes = await jpegWithPosition({
    width: 2000,
    height: 1000,
    orientation: 6,
  });
  const source = await readImageMetadata(bufferReader(bytes), {
    type: "image/jpeg",
  });
  assert.equal(source.gps, true, "the source carries a position");
  const digest = await stored(bytes);
  const answer = await writeThumbnail({ tenantId, sha256: digest });
  assert.equal(answer.written, true);
  const thumbnail = await readFile(thumbnailPathFor(tenantId, digest));
  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.height, THUMBNAIL_LONG_SIDE);
  assert.equal(metadata.width, THUMBNAIL_LONG_SIDE / 2);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
  assert.equal(metadata.orientation, undefined);
  for (const text of ["Exif", "xmp", "Photoshop", "Lac Noir", "SN-000"])
    assert.equal(thumbnail.includes(Buffer.from(text)), false, text);
  // The original was not touched.
  assert.equal(sha(await readFile(capturePathFor(tenantId, digest))), digest);
});

test("a small image is never enlarged; a FITS file whose pixels are read gets a thumbnail too", async () => {
  const small = await starField({ width: 300, height: 200 }).png().toBuffer();
  const smallDigest = await stored(small);
  await writeThumbnail({ tenantId, sha256: smallDigest });
  const smallThumbnail = await sharp(
    await readFile(thumbnailPathFor(tenantId, smallDigest)),
  ).metadata();
  assert.deepEqual([smallThumbnail.width, smallThumbnail.height], [300, 200]);

  const fits = fitsFile({
    width: 1600,
    height: 800,
    cards: [["IMAGETYP", "'Light Frame'"]],
  });
  const fitsDigest = await stored(fits);
  const answer = await writeThumbnail({ tenantId, sha256: fitsDigest });
  assert.equal(answer.written, true);
  const fitsThumbnail = await sharp(
    await readFile(thumbnailPathFor(tenantId, fitsDigest)),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(fitsThumbnail.info.width <= THUMBNAIL_LONG_SIDE, true);
  assert.ok(
    Math.abs(fitsThumbnail.info.width - fitsThumbnail.info.height * 2) <= 1,
  );
  // Stretched for the eye: the sky is dark, the stars bright.
  const values = [...fitsThumbnail.data];
  const sorted = values.slice().sort((a, b) => a - b);
  assert.ok(sorted[Math.floor(sorted.length / 2)] < 128);
  assert.ok(sorted.at(-1) > 200);
  assert.ok(SHARED_COPY_LONG_SIDE > THUMBNAIL_LONG_SIDE);
});

test("a file that is neither an image nor a FITS file gets no thumbnail", async () => {
  for (const bytes of [
    Buffer.concat([
      Buffer.from("XISF0100"),
      Buffer.alloc(8),
      Buffer.from("<xisf/>"),
    ]),
    Buffer.from("%PDF-1.7 a document\n"),
  ]) {
    const digest = await stored(bytes);
    assert.deepEqual(await writeThumbnail({ tenantId, sha256: digest }), {
      written: false,
    });
    assert.equal(await hasThumbnail(tenantId, digest), false);
    assert.equal(await exists(derivedDirectoryFor(tenantId, digest)), false);
  }
});
