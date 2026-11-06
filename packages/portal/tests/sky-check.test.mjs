import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { detectStars } from "../dist/sky-check/star-detection.js";
import {
  SKY_CHECK_REASONS,
  checkCaptureFile,
  skyCheckSettingsFromEnv,
} from "../dist/sky-check/index.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** A seeded generator: the same field at every run. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function gaussianNoise(next) {
  const u = Math.max(1e-12, next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/** A grey star field: `stars` round stars on a noisy dark background. */
function starField({
  width = 1200,
  height = 800,
  stars = 300,
  seed = 7,
  background = 20,
  noise = 3,
  sigma = 1.3,
  peak = [40, 220],
} = {}) {
  const next = random(seed);
  const pixels = new Float32Array(width * height);
  for (let index = 0; index < pixels.length; index += 1)
    pixels[index] = background + noise * gaussianNoise(next);
  const placed = [];
  for (let star = 0; star < stars; star += 1) {
    const x = 6 + next() * (width - 12);
    const y = 6 + next() * (height - 12);
    const amplitude = peak[0] + next() * (peak[1] - peak[0]);
    placed.push({ x, y });
    for (let dy = -6; dy <= 6; dy += 1)
      for (let dx = -6; dx <= 6; dx += 1) {
        const px = Math.floor(x) + dx;
        const py = Math.floor(y) + dy;
        const r2 = (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2;
        pixels[py * width + px] +=
          amplitude * Math.exp(-r2 / (2 * sigma * sigma));
      }
  }
  return { width, height, pixels, placed };
}

const toBytes = ({ width, height, pixels }) =>
  Buffer.from(
    Uint8Array.from(pixels, (value) =>
      Math.max(0, Math.min(255, Math.round(value))),
    ),
  );

async function png(field) {
  return sharp(toBytes(field), {
    raw: { width: field.width, height: field.height, channels: 1 },
  })
    .png()
    .toBuffer();
}

/** A FITS file: header cards, then 16-bit data with `BZERO` 32768. */
function fits(cards, { width = 0, height = 0, pixels = null } = {}) {
  const card = (text) => text.padEnd(80, " ").slice(0, 80);
  const lines = [
    card("SIMPLE  =                    T"),
    card("BITPIX  =                   16"),
    card(`NAXIS   =                    ${width ? 2 : 0}`),
    ...(width
      ? [
          card(`NAXIS1  = ${String(width).padStart(20)}`),
          card(`NAXIS2  = ${String(height).padStart(20)}`),
          card("BZERO   =                32768"),
          card("BSCALE  =                    1"),
        ]
      : []),
    ...cards.map(([key, value]) =>
      card(`${key.padEnd(8)}= ${String(value).padStart(20)}`),
    ),
    card("END"),
  ].join("");
  const header = Buffer.from(text2880(lines));
  if (!width) return header;
  const data = Buffer.alloc(Math.ceil((width * height * 2) / 2880) * 2880);
  for (let index = 0; index < width * height; index += 1) {
    const value = Math.max(0, Math.min(65535, Math.round(pixels[index])));
    data.writeInt16BE(value - 32768, index * 2);
  }
  return Buffer.concat([header, data]);
}

function text2880(text) {
  return text.padEnd(Math.ceil(text.length / 2880) * 2880, " ");
}

const WCS = [
  ["CTYPE1", "'RA---TAN'"],
  ["CTYPE2", "'DEC--TAN'"],
  ["CRVAL1", "83.82"],
  ["CRVAL2", "-5.39"],
  ["CRPIX1", "600"],
  ["CRPIX2", "400"],
  ["CD1_1", "-3.0E-4"],
  ["CD2_2", "3.0E-4"],
];

let folder;
test.before(async () => {
  folder = await mkdtemp(join(tmpdir(), "sky-check-"));
});
test.after(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function file(name, bytes) {
  const path = join(folder, name);
  await writeFile(path, bytes);
  return path;
}

test("the port finds the stars of a synthetic field and drops hot pixels", () => {
  const field = starField({ stars: 150, seed: 11 });
  // Ten single hot pixels: sharp spikes, no light in their neighbours.
  for (let hot = 0; hot < 10; hot += 1)
    field.pixels[(100 + hot * 50) * field.width + 300 + hot * 70] = 200;
  const detection = detectStars({ ...field, saturation: 255, noiseFloor: 0.5 });
  assert.ok(
    detection.starCount >= 130 && detection.starCount <= 160,
    `${detection.starCount}`,
  );
  assert.ok(detection.hotPixelsRejected >= 8);
  assert.ok(detection.medianElongation < 1.3);
  assert.ok(detection.coarseCellCoverage === 1);
  // Weighted centroids: the median distance to the drawn star stays small.
  const errors = detection.stars
    .map((star) =>
      Math.min(
        ...field.placed.map((placed) =>
          Math.hypot(placed.x - star.x, placed.y - star.y),
        ),
      ),
    )
    .sort((a, b) => a - b);
  const medianError = errors[errors.length >> 1];
  assert.ok(medianError < 0.3, `median centroid error ${medianError}`);
});

test("a synthetic star field encoded by sharp is recognised as the sky", async () => {
  // About 900 stars per megapixel, as a telescope's field reduced to 2000 px.
  const path = await file("field.png", await png(starField({ stars: 900 })));
  const verdict = await checkCaptureFile({ path, originalName: "field.png" });
  assert.equal(verdict.result, "sky", JSON.stringify(verdict.signals));
  assert.equal(verdict.reason, "stars_detected");
  assert.equal(verdict.ruleVersion, "sky-check-3");
  assert.ok(!Number.isNaN(Date.parse(verdict.checkedAt)));
  assert.ok(verdict.signals.stars.starCount >= 800);
});

test("an even bright gradient is not the sky", async () => {
  const width = 900;
  const height = 600;
  const pixels = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1)
      pixels[y * width + x] = 120 + (x / width) * 100;
  const bytes = await sharp(toBytes({ width, height, pixels }), {
    raw: { width, height, channels: 1 },
  })
    .jpeg()
    .toBuffer();
  const verdict = await checkCaptureFile({
    path: await file("gradient.jpg", bytes),
  });
  assert.notEqual(verdict.result, "sky");
});

test("a FITS dark or flat is undetermined, never other", async () => {
  const field = starField({ stars: 0, background: 300, noise: 20 });
  for (const kind of ["'Dark Frame'", "'FLAT'", "'Bias'", "'DarkFlat'"]) {
    const bytes = fits([["IMAGETYP", kind], ...WCS], { ...field });
    const verdict = await checkCaptureFile({
      path: await file("calibration.fit", bytes),
    });
    assert.equal(verdict.result, "undetermined", kind);
    assert.equal(verdict.reason, "calibration_frame", kind);
  }
  // Without a kind and without stars, a FITS file is still never `other`.
  const unnamed = fits([], { ...field });
  const verdict = await checkCaptureFile({
    path: await file("unnamed.fits", unnamed),
  });
  assert.equal(verdict.result, "undetermined");
  assert.equal(verdict.reason, "astro_header");
});

test("a FITS light with a celestial WCS is the sky, from its header alone", async () => {
  const verdict = await checkCaptureFile({
    path: await file(
      "solved.fits",
      fits([["IMAGETYP", "'Light Frame'"], ...WCS]),
    ),
  });
  assert.equal(verdict.result, "sky");
  assert.equal(verdict.reason, "wcs_header");
  assert.equal(verdict.signals.decoded, null);
});

test("a FITS light without a WCS is read from its pixels", async () => {
  const field = starField({
    seed: 3,
    background: 1200,
    noise: 30,
    peak: [600, 9000],
  });
  const path = await file(
    "unsolved.fits",
    fits([["IMAGETYP", "'LIGHT'"]], field),
  );
  const verdict = await checkCaptureFile({ path });
  assert.equal(verdict.result, "sky", JSON.stringify(verdict.signals));
  assert.equal(verdict.reason, "stars_detected");
  assert.ok(verdict.signals.stars.starCount >= 250);
});

test("an unreadable file and a file over the bound are undetermined with their reason", async () => {
  const broken = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(2000, 7),
  ]);
  const unreadable = await checkCaptureFile({
    path: await file("broken.jpg", broken),
  });
  assert.deepEqual(
    [unreadable.result, unreadable.reason],
    ["undetermined", "unreadable"],
  );
  const missing = await checkCaptureFile({ path: join(folder, "absent.jpg") });
  assert.deepEqual(
    [missing.result, missing.reason],
    ["undetermined", "unreadable"],
  );
  const big = await file("big.png", await png(starField()));
  const tooLarge = await checkCaptureFile({
    path: big,
    settings: { maxPixels: 100_000 },
  });
  assert.deepEqual(
    [tooLarge.result, tooLarge.reason],
    ["undetermined", "too_large"],
  );
  const tooHeavy = await checkCaptureFile({
    path: big,
    settings: { maxFileBytes: 1000 },
  });
  assert.deepEqual(
    [tooHeavy.result, tooHeavy.reason],
    ["undetermined", "too_large"],
  );
});

test("with the check off, every file is undetermined without being read", async () => {
  assert.deepEqual(skyCheckSettingsFromEnv({ ASTRO_PORTAL_SKY_CHECK: "off" }), {
    mode: "off",
  });
  assert.deepEqual(skyCheckSettingsFromEnv({}), { mode: "auto" });
  const path = await file("off.png", await png(starField()));
  const verdict = await checkCaptureFile({
    path,
    settings: skyCheckSettingsFromEnv({ ASTRO_PORTAL_SKY_CHECK: "OFF" }),
  });
  assert.deepEqual(
    [verdict.result, verdict.reason],
    ["undetermined", "check_off"],
  );
  assert.deepEqual(verdict.signals, { mode: "off" });
});

test("the time bound answers undetermined, too slow", async () => {
  const path = await file(
    "slow.png",
    await png(starField({ width: 3000, height: 2000, stars: 2000 })),
  );
  const verdict = await checkCaptureFile({
    path,
    settings: { timeLimitMs: 1 },
  });
  assert.deepEqual(
    [verdict.result, verdict.reason],
    ["undetermined", "too_slow"],
  );
});

test("a flat-colour document is something else; a camera raw is undetermined", async () => {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="1000" height="700" fill="#ffffff"/>${Array.from(
      { length: 14 },
      (_, row) =>
        `<rect x="60" y="${60 + row * 40}" width="${500 + ((row * 97) % 300)}" height="14" fill="#222"/>`,
    ).join(
      "",
    )}<rect x="700" y="80" width="220" height="160" fill="#3b6fd8"/></svg>`,
  );
  const document = await checkCaptureFile({
    path: await file("document.png", await sharp(svg).png().toBuffer()),
  });
  assert.deepEqual(
    [document.result, document.reason],
    ["other", "non_sky_content"],
  );
  const raw = Buffer.alloc(64);
  raw.write("II", 0, "latin1");
  raw.writeUInt16LE(42, 2);
  raw.writeUInt32LE(8, 4);
  const verdict = await checkCaptureFile({
    path: await file("night.nef", raw),
    originalName: "night.NEF",
  });
  assert.deepEqual(
    [verdict.result, verdict.reason],
    ["undetermined", "raw_camera_file"],
  );
  const reasons = Object.values(SKY_CHECK_REASONS).flat();
  for (const answered of [document, verdict])
    assert.ok(reasons.includes(answered.reason));
});

test("the module is imported by the processing of the captures only", async () => {
  const offenders = [];
  async function visit(path) {
    const name = path.split("/").pop();
    if (["node_modules", "dist", ".next", "sky-check", "tests"].includes(name))
      return;
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      if (/\.(?:[cm]?[jt]sx?)$/.test(path)) {
        const source = await readFile(path, "utf8");
        if (/sky-check/.test(source))
          offenders.push(relative(repository, path));
      }
      return;
    }
    for (const entry of entries) await visit(join(path, entry.name));
  }
  await visit(join(repository, "packages"));
  // It is wired in: the processing after an upload, the derived files
  // (the FITS reader for a thumbnail, the raw detection), and the verdict
  // the owner's checks read (`captures/sky-check-verdict.js`).
  assert.deepEqual(
    offenders.sort(),
    [
      "packages/portal/src/captures/capture-processing.js",
      "packages/portal/src/persistence/capture-repository.js",
      "packages/portal/src/uploads/derived-images.js",
    ],
    "only the processing of the captures reaches the sky check",
  );
  // sharp is loaded by the sky check through a dynamic import, never
  // statically.
  const decode = await readFile(
    join(repository, "packages/portal/src/sky-check/decode.js"),
    "utf8",
  );
  assert.doesNotMatch(decode, /^import [^;]*["']sharp["']/m);
  assert.match(decode, /await import\("sharp"\)/);
});

test("stars over a dark foreground (the ground under a person) are never the sky by their stars, and a landscape when no person is found", async () => {
  const field = starField({ stars: 900, seed: 21 });
  // The bottom fifth is ground, and a standing silhouette rises from it:
  // no star there, as under a person photographed before the Milky Way.
  for (let y = 0; y < field.height; y += 1)
    for (let x = 0; x < field.width; x += 1) {
      const ground = y > field.height * 0.8;
      const person = Math.abs(x - 600) < 40 && y > field.height * 0.45;
      if (ground || person) field.pixels[y * field.width + x] = 4;
    }
  const verdict = await checkCaptureFile({
    path: await file("person.png", await png(field)),
  });
  // Not a field of stars: a night over a landscape. The black block is no
  // person to the detector, so the image passes as a landscape; a person
  // photographed there is the detector's to find.
  assert.deepEqual(
    [verdict.result, verdict.reason, verdict.outcome],
    ["sky", "landscape", "sky"],
  );
  assert.ok(verdict.signals.people.available);
  assert.ok(verdict.signals.people.personScore < 0.25);
});

test("a noiseless drawing of stars is never the sky", async () => {
  const next = random(9);
  const circles = Array.from(
    { length: 900 },
    () =>
      `<circle cx="${(next() * 1200).toFixed(1)}" cy="${(next() * 800).toFixed(1)}" r="${(0.8 + next() ** 4 * 3).toFixed(1)}" fill="#fff"/>`,
  ).join("");
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#050a1a"/>${circles}</svg>`,
  );
  const verdict = await checkCaptureFile({
    path: await file("chart.png", await sharp(svg).png().toBuffer()),
  });
  assert.notEqual(verdict.result, "sky");
});
