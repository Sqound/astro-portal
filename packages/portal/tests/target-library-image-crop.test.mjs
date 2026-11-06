import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import sharp from "sharp";
import { cropTargetLibraryImage } from "../dist/target-library-image-crop.js";

// The Venus picture was NASA's comparison board,
// two discs and a white rule. The import crops what it downloads, as the
// source record declares; the file is a JPEG, not committed.

const runNode = promisify(execFile);
const importer = fileURLToPath(
  new URL("../../../scripts/import-solar-system-images.mjs", import.meta.url),
);

// A board like PIA23791~small.jpg: 640 × 312, a disc in each half, a white
// rule of 16 pixels centred on the middle (columns 312 to 327), its edges
// grey. The left disc is the one to keep.
async function board({ rule = true } = {}) {
  const width = 640;
  const height = 312;
  const pixels = Buffer.alloc(width * height * 3);
  for (let row = 0; row < height; row += 1)
    for (let column = 0; column < width; column += 1) {
      const dx = (column % 320) - 150;
      const dy = row - 156;
      let value = dx * dx + dy * dy < 120 * 120 ? 200 : 0;
      if (rule && column >= 312 && column <= 327)
        value = column === 312 || column === 327 ? 140 : 255;
      pixels.fill(
        value,
        (row * width + column) * 3,
        (row * width + column) * 3 + 3,
      );
    }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test("a cropped board is about square (± 10 %), whole disc kept", async () => {
  const cropped = await cropTargetLibraryImage(await board(), "left-half");
  const { width, height, format } = await sharp(cropped).metadata();
  assert.equal(format, "jpeg");
  assert.ok(Math.abs(width / height - 1) <= 0.1, `${width} × ${height}`);
  assert.ok(width < 320, "the rule's part of the half is dropped");
});

test("no column of the cropped picture is the source picture's white rule", async () => {
  const cropped = await cropTargetLibraryImage(await board(), "left-half");
  const { data, info } = await sharp(cropped)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let column = info.width - 12; column < info.width; column += 1) {
    let brightest = 0;
    for (let row = 0; row < info.height; row += 1)
      brightest = Math.max(brightest, data[row * info.width + column]);
    assert.ok(brightest < 100, `column ${column} holds ${brightest}`);
  }
});

test("a picture without a rule is simply halved", async () => {
  const cropped = await cropTargetLibraryImage(
    await board({ rule: false }),
    "left-half",
  );
  const { width, height } = await sharp(cropped).metadata();
  assert.equal(width, 320);
  assert.equal(height, 312);
});

test("an unknown crop is refused", async () => {
  await assert.rejects(
    cropTargetLibraryImage(await board(), "quarter"),
    /Unknown image crop: quarter/,
  );
});

// The import, run on a folder with `fetch` answering with the source
// picture: it keeps the cropped file, notes the crop in the manifest, leaves
// a cropped file alone, and replaces a file kept from before the crop was
// declared.
test("the import crops Venus, records the crop, and redoes an older uncropped file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "astro-venus-import-"));
  try {
    const boardFile = join(directory, "board.jpg");
    await writeFile(boardFile, await board());
    const stub = join(directory, "stub.mjs");
    await writeFile(
      stub,
      `import { readFile } from "node:fs/promises";
globalThis.fetch = async () =>
  new Response(await readFile(${JSON.stringify(boardFile)}), {
    headers: { "content-type": "image/jpeg" },
  });
`,
    );
    const library = join(directory, "library");
    await mkdir(library);
    const environment = {
      ...process.env,
      ASTRO_PORTAL_TARGET_LIBRARY_FILE: join(library, "openngc.json"),
      ASTRO_PORTAL_TARGET_LIBRARY_IMAGES_DIR: join(library, "images"),
    };
    const run = async () =>
      JSON.parse(
        (
          await runNode(
            process.execPath,
            ["--import", stub, importer, "--only", "solar-system-venus"],
            { env: environment },
          )
        ).stdout,
      );
    const venusFile = join(library, "images", "solar-system-venus.jpg");
    // A file and a manifest as they were before the crop existed.
    await mkdir(join(library, "images"));
    await writeFile(venusFile, await readFile(boardFile));
    await writeFile(
      join(library, "images.json"),
      JSON.stringify({
        images: { "solar-system-venus": { file: "solar-system-venus.jpg" } },
      }),
    );
    assert.deepEqual(await run(), { downloaded: 1, skipped: 0, total: 1 });
    const { width, height } = await sharp(await readFile(venusFile)).metadata();
    assert.ok(Math.abs(width / height - 1) <= 0.1, `${width} × ${height}`);
    const manifest = JSON.parse(
      await readFile(join(library, "images.json"), "utf8"),
    );
    assert.equal(manifest.images["solar-system-venus"].crop, "left-half");
    assert.equal(
      manifest.images["solar-system-venus"].license,
      "NASA media usage guidelines",
    );
    assert.deepEqual(await run(), { downloaded: 0, skipped: 1, total: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
