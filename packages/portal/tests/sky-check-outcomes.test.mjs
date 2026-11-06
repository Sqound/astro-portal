import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  SKY_CHECK_REASONS,
  SKY_CHECK_THRESHOLDS,
  decideOutcome,
  decideSkyCheck,
  outcomeOf,
  storedVerdictOf,
} from "../dist/sky-check/rule.js";
import {
  DEFAULT_PERSON_MODEL_PATH,
  PERSON_DETECTOR,
  detectPeople,
  tilesOf,
} from "../dist/sky-check/person-detection.js";

// The rule with four outcomes: the sky or a
// landscape is published at once; a person and the undetermined wait for
// the team; a painted image keeps its former answer.

// A photograph of a landscape by day, as the portal measures it: no field
// of stars, a blue top third over a textured ground, nobody found.
const day = {
  format: "raster",
  extension: "jpg",
  frameKind: null,
  celestialWcs: false,
  failure: null,
  metadata: { hasExif: true, astroSoftware: false },
  stars: {
    starCount: 1300,
    starsPerMegapixel: 530,
    fineCellCoverage: 0.9,
    cellDensityFloor: 0.2,
    stripDensityFloor: 0.1,
    medianWidthPixels: 2.4,
    medianElongation: 1.4,
    backgroundLevel: 0.5,
    noiseLevel: 0.01,
    hotPixelsRejected: 0,
    extendedAreaFraction: 0.3,
    widthSpread: 0.9,
    profileSpread: 1.1,
    texturedTileFraction: 0.3,
  },
  thumbnail: {
    meanLuma: 0.55,
    darkFraction: 0.01,
    flatColourShare: 0.02,
    equalNeighbourShare: 0.1,
    edgeDensity: 0.1,
    topDarkShare: 0,
    topBlueShare: 0.8,
    topGreyShare: 0.1,
    topWhiteShare: 0.05,
    topWarmShare: 0,
    bottomTexture: 0.05,
    lumaP99: 0.95,
  },
  people: {
    available: true,
    personScore: 0.01,
    personAreaFraction: 0.01,
    personCount: 0,
    classes: {},
  },
};
const withPeople = (people) => ({
  ...day,
  people: { ...day.people, ...people },
});
const withThumbnail = (thumbnail) => ({
  ...day,
  thumbnail: { ...day.thumbnail, ...thumbnail },
});

test("a landscape without anybody is published as the sky or a landscape", () => {
  assert.deepEqual(decideOutcome(day), { outcome: "sky", reason: "landscape" });
  assert.deepEqual(decideSkyCheck(day), {
    result: "sky",
    reason: "landscape",
    outcome: "sky",
  });
});

test("a person is held for the team, stored as undetermined with its reason", () => {
  const person = withPeople({ personScore: SKY_CHECK_THRESHOLDS.personScore });
  assert.deepEqual(decideOutcome(person), {
    outcome: "person",
    reason: "person_detected",
  });
  assert.deepEqual(decideSkyCheck(person), {
    result: "undetermined",
    reason: "person_detected",
    outcome: "person",
  });
  // Whatever the stars say: a person comes first.
  assert.equal(
    decideOutcome({ ...person, stars: undefined }).outcome,
    "person",
  );
  // A doubtful person is undetermined, never published.
  assert.deepEqual(
    decideOutcome(
      withPeople({ personScore: SKY_CHECK_THRESHOLDS.personDoubtScore }),
    ),
    { outcome: "undetermined", reason: "person_doubt" },
  );
  assert.equal(
    decideOutcome(
      withPeople({ personScore: SKY_CHECK_THRESHOLDS.personDoubtScore - 0.01 }),
    ).outcome,
    "sky",
  );
});

test("the stored form of an outcome and back", () => {
  assert.deepEqual(
    storedVerdictOf({ outcome: "person", reason: "person_detected" }),
    { result: "undetermined", reason: "person_detected" },
  );
  assert.equal(outcomeOf("undetermined", "person_detected"), "person");
  assert.equal(outcomeOf("undetermined", "not_recognised"), "undetermined");
  assert.equal(outcomeOf("sky", "landscape"), "sky");
  assert.equal(outcomeOf(null, null), null);
  // Every reason the rule answers is listed under its outcome.
  for (const [outcome, reasons] of Object.entries(SKY_CHECK_REASONS))
    for (const reason of reasons)
      assert.ok(reasons.includes(reason), `${outcome} ${reason}`);
});

test("a plate, a room or an animal is neither the sky nor a landscape", () => {
  for (const classes of [
    { bowl: 0.6 },
    { "dining table": 0.5 },
    { couch: 0.45 },
    { cat: 0.8 },
  ])
    assert.deepEqual(
      decideOutcome(withPeople({ classes })),
      { outcome: "undetermined", reason: "not_a_landscape" },
      JSON.stringify(classes),
    );
  // Rocks read as a zebra, a tent as an umbrella, trees as broccoli: a
  // landscape still.
  for (const classes of [
    { zebra: 0.6 },
    { umbrella: 0.8 },
    { broccoli: 0.7 },
    { boat: 0.9 },
  ])
    assert.equal(
      decideOutcome(withPeople({ classes })).outcome,
      "sky",
      JSON.stringify(classes),
    );
});

test("the Moon on a black background is no orange", () => {
  const moon = {
    ...withPeople({ classes: { orange: 0.9, banana: 0.6, clock: 0.5 } }),
    thumbnail: {
      ...day.thumbnail,
      darkFraction: 0.94,
      flatColourShare: 0.95,
      topDarkShare: 1,
      topBlueShare: 0,
      lumaP99: 0.8,
    },
  };
  assert.deepEqual(decideOutcome(moon), {
    outcome: "sky",
    reason: "landscape",
  });
  // The same fruit in a lit photograph holds it back.
  assert.equal(
    decideOutcome(withPeople({ classes: { orange: 0.9 } })).reason,
    "not_a_landscape",
  );
  // A dark frame (nothing bright) is no astronomical object.
  assert.equal(
    decideOutcome({ ...moon, thumbnail: { ...moon.thumbnail, lumaP99: 0.05 } })
      .outcome,
    "undetermined",
  );
});

test("a starry night over a landscape is published, a flat image is not", () => {
  const night = withThumbnail({
    meanLuma: 0.2,
    darkFraction: 0.2,
    topDarkShare: 0.2,
    topBlueShare: 0.1,
    lumaP99: 0.5,
  });
  const starry = { ...night, stars: { ...day.stars, starsPerMegapixel: 4000 } };
  assert.deepEqual(decideOutcome(starry), {
    outcome: "sky",
    reason: "landscape",
  });
  assert.equal(decideOutcome(night).reason, "not_recognised");
  // Painted in a few exact colours, or a uniform dark: not a photograph.
  assert.equal(
    decideOutcome({
      ...starry,
      thumbnail: { ...starry.thumbnail, flatColourShare: 0.9 },
    }).outcome,
    "undetermined",
  );
  assert.equal(
    decideOutcome(withThumbnail({ lumaP99: 0.05 })).outcome,
    "undetermined",
  );
  // A white top (paper, a wall) is no sky.
  assert.equal(
    decideOutcome(
      withThumbnail({ topBlueShare: 0.1, topGreyShare: 0, topWhiteShare: 0.9 }),
    ).reason,
    "not_recognised",
  );
});

test("without the person detector, no photograph passes as a landscape", () => {
  for (const people of [null, { available: false, reason: "model" }])
    assert.deepEqual(decideOutcome({ ...day, people }), {
      outcome: "undetermined",
      reason: "people_unchecked",
    });
});

test("a FITS file with celestial coordinates is the sky from its header", () => {
  assert.deepEqual(
    decideOutcome({ format: "fits", frameKind: "light", celestialWcs: true }),
    { outcome: "sky", reason: "wcs_header" },
  );
  assert.deepEqual(
    decideOutcome({ format: "xisf", frameKind: null, celestialWcs: true }),
    { outcome: "sky", reason: "wcs_header" },
  );
});

test("the tiles of the person detector: two per long axis of a large image", () => {
  assert.deepEqual(tilesOf(400, 300), []);
  assert.deepEqual(tilesOf(832, 555), [
    { left: 0, top: 0, width: 416, height: 416 },
    { left: 416, top: 0, width: 416, height: 416 },
    { left: 0, top: 139, width: 416, height: 416 },
    { left: 416, top: 139, width: 416, height: 416 },
  ]);
  assert.equal(tilesOf(832, 400).length, 2);
});

test("the person detector runs on the model it was measured with, and says so when it cannot", async () => {
  const bytes = await readFile(DEFAULT_PERSON_MODEL_PATH);
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    PERSON_DETECTOR.sha256,
  );
  const folder = await mkdtemp(join(tmpdir(), "person-detector-"));
  try {
    // A grey night with noise: nobody.
    const width = 640;
    const height = 427;
    const pixels = Buffer.alloc(width * height * 3);
    let state = 7;
    for (let index = 0; index < pixels.length; index += 1) {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      pixels[index] = 20 + (state % 12);
    }
    const image = join(folder, "night.png");
    await writeFile(
      image,
      await sharp(pixels, { raw: { width, height, channels: 3 } })
        .png()
        .toBuffer(),
    );
    const found = await detectPeople(image, { sharp, maxPixels: 1e8 });
    assert.equal(found.available, true);
    assert.ok(found.personScore < 0.1, String(found.personScore));
    assert.equal(found.personCount, 0);
    assert.equal(found.views, 5);
    // A model that is not the one measured is refused, not run.
    const other = join(folder, "other.onnx");
    await copyFile(DEFAULT_PERSON_MODEL_PATH, other);
    await writeFile(other, Buffer.from("not the model"), { flag: "a" });
    const refused = await detectPeople(image, {
      sharp,
      maxPixels: 1e8,
      modelPath: other,
    });
    assert.equal(refused.available, false);
    assert.match(refused.reason, /digest/);
    const missing = await detectPeople(image, {
      sharp,
      maxPixels: 1e8,
      modelPath: join(folder, "missing.onnx"),
    });
    assert.equal(missing.available, false);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
