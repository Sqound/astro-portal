import assert from "node:assert/strict";
import test from "node:test";
import {
  paintTargetPreviewPlanet,
  positionAngle,
  targetPreviewBodyKey,
  targetPreviewBodyShown,
  targetPreviewInstant,
  targetPreviewPlanet,
  targetPreviewPlanetSizeText,
} from "../src/target-preview-planet.js";

// The Moon and the planets of « Prévisualiser »: their size, phase, rings
// and moons of the day (astronomy-engine), checked against the values of
// 2026-11-14 20:00 UTC; the instant the drawing is made for; the painter.

const instant = "2026-11-14T20:00:00Z";
const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} instead of ${expected} ± ${tolerance}`,
  );

test("the bodies of 2026-11-14 20:00 UTC: size, phase, Saturn's rings", () => {
  const jupiter = targetPreviewPlanet("jupiter", instant);
  near(jupiter.diameterArcsec, 37.3, 37.3 * 0.015, "Jupiter");
  const saturn = targetPreviewPlanet("saturn", instant);
  near(saturn.diameterArcsec, 19.1, 19.1 * 0.015, "Saturn");
  near(Math.abs(saturn.rings.tilt), 6.2, 0.4, "Saturn's B");
  const venus = targetPreviewPlanet("venus", instant);
  near(venus.diameterArcsec, 50.6, 50.6 * 0.015, "Venus");
  near(venus.phase.fraction * 100, 13, 3, "Venus lit");
  const mars = targetPreviewPlanet("mars", instant);
  near(mars.diameterArcsec, 7.1, 7.1 * 0.015, "Mars");
  near(mars.phase.fraction * 100, 89, 3, "Mars lit");
  const moon = targetPreviewPlanet("moon", instant);
  near(moon.diameterArcsec / 60, 29.5, 29.5 * 0.015, "Moon");
  near(moon.phase.fraction * 100, 26, 3, "Moon lit");
  // No phase drawn for the outer planets, no rings but Saturn's.
  assert.equal(jupiter.phase, null);
  assert.equal(jupiter.rings, null);
  assert.equal(targetPreviewPlanet("neptune", instant).phase, null);
});

test("Jupiter's four moons are within 30 radii of it, named, some maybe hidden", () => {
  const jupiter = targetPreviewPlanet("jupiter", instant);
  const radius = jupiter.diameterArcsec / 2;
  assert.deepEqual(
    jupiter.moons.map((moon) => moon.name),
    ["io", "europa", "ganymede", "callisto"],
  );
  for (const moon of jupiter.moons) {
    const distance = Math.hypot(moon.eastArcsec, moon.northArcsec);
    assert.ok(distance < 30 * radius, `${moon.name} at ${distance}″`);
    assert.equal(typeof moon.behind, "boolean");
    if (moon.behind) assert.ok(distance < radius);
  }
  // Io is the closest, Callisto the farthest.
  const distances = jupiter.moons.map((moon) =>
    Math.hypot(moon.eastArcsec, moon.northArcsec),
  );
  assert.ok(distances[3] > distances[0]);
});

test("the Sun and the Earth have no preview; the other bodies are found by id, planner card or body", () => {
  assert.equal(targetPreviewBodyKey({ id: "solar-system-sun" }), "sun");
  assert.equal(targetPreviewBodyShown("sun"), false);
  assert.equal(targetPreviewBodyShown("earth"), false);
  assert.equal(targetPreviewPlanet("sun", instant), null);
  assert.equal(targetPreviewBodyKey({ id: "solar-system-moon" }), "moon");
  assert.equal(
    targetPreviewBodyKey({ id: "planner-planet-vénus", body: "Venus" }),
    "venus",
  );
  assert.equal(targetPreviewBodyKey({ body: "Saturn" }), "saturn");
  assert.equal(targetPreviewBodyKey({ id: "m31" }), null);
  for (const key of [
    "moon",
    "mercury",
    "venus",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
    "pluto",
  ])
    assert.equal(targetPreviewBodyShown(key), true, key);
});

test("the instant: the card's best time, else 22:00 local on the night's date, else now", () => {
  assert.equal(
    targetPreviewInstant({
      card: { best: { time: "2026-11-14T21:30:00.000Z" } },
      date: "2026-11-14",
      timeZone: "Europe/Paris",
    }).toISOString(),
    "2026-11-14T21:30:00.000Z",
  );
  assert.equal(
    targetPreviewInstant({
      date: "2026-11-14",
      timeZone: "Europe/Paris",
    }).toISOString(),
    "2026-11-14T21:00:00.000Z",
  );
  // Across a change of time (summer time in Paris until 25 October).
  assert.equal(
    targetPreviewInstant({
      date: "2026-07-01",
      timeZone: "Europe/Paris",
    }).toISOString(),
    "2026-07-01T20:00:00.000Z",
  );
  const now = new Date("2026-10-29T20:00:00Z");
  assert.equal(targetPreviewInstant({ now }).getTime(), now.getTime());
});

test("the size line: arcseconds under a minute, arcminutes above, one decimal at most", () => {
  assert.equal(targetPreviewPlanetSizeText(37.29, "fr"), "37,3″");
  assert.equal(targetPreviewPlanetSizeText(19, "en"), "19″");
  assert.equal(targetPreviewPlanetSizeText(1769.9, "fr"), "29,5′");
  assert.equal(targetPreviewPlanetSizeText(1769.9, "en"), "29.5′");
});

test("the angle of position: north 0, east 90", () => {
  near(positionAngle(10, 0, 10, 1), 0, 1e-9, "north");
  near(positionAngle(10, 0, 11, 0), 90, 1e-9, "east");
  near(positionAngle(10, 0, 9, 0), 270, 1e-9, "west");
});

// A 2D context that records what is drawn.
function recordingContext() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  return {
    calls,
    save: record("save"),
    restore: record("restore"),
    translate: record("translate"),
    rotate: record("rotate"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    arc: record("arc"),
    ellipse: record("ellipse"),
    clip: record("clip"),
    fill: record("fill"),
    fillRect: record("fillRect"),
    drawImage: record("drawImage"),
    set globalCompositeOperation(value) {
      calls.push(["globalCompositeOperation", value]);
    },
    set fillStyle(value) {
      calls.push(["fillStyle", value]);
    },
    set imageSmoothingQuality(value) {
      calls.push(["imageSmoothingQuality", value]);
    },
  };
}

test("the painter: the true size, never under one pixel, the moons left out behind the disc", () => {
  const jupiter = targetPreviewPlanet("jupiter", instant);
  const image = { width: 100, height: 100 };
  // A 2.2° field on 640 px: Jupiter is under 3 px wide, drawn so.
  const context = recordingContext();
  const pixelsPerArcsec = 640 / (2.2 * 3600);
  paintTargetPreviewPlanet(context, {
    x: 320,
    y: 320,
    pixelsPerArcsec,
    planet: jupiter,
    image,
  });
  const drawn = context.calls.find((call) => call[0] === "drawImage");
  near(drawn[4], jupiter.diameterArcsec * pixelsPerArcsec, 1e-9, "width");
  // The moons are points on the pixel grid at this scale.
  const moons = context.calls.filter(
    (call) => call[0] === "fillRect" && call[3] === 1 && call[4] === 1,
  );
  assert.equal(
    moons.length,
    jupiter.moons.filter((moon) => !moon.behind).length,
  );
  for (const [, left, top] of moons) {
    assert.equal(left, Math.round(left));
    assert.equal(top, Math.round(top));
  }
  // Pluto in a wide field: one physical pixel.
  const tiny = recordingContext();
  paintTargetPreviewPlanet(tiny, {
    x: 0,
    y: 0,
    pixelsPerArcsec,
    planet: targetPreviewPlanet("pluto", instant),
    image,
  });
  const tinyDraws = tiny.calls.filter((call) => call[0] === "drawImage");
  assert.equal(tinyDraws.length, 2, "laid twice, in light");
  assert.equal(tinyDraws[0][4], 1);
  // Saturn: the far half of the rings, the globe, the near half.
  const saturn = recordingContext();
  paintTargetPreviewPlanet(saturn, {
    x: 0,
    y: 0,
    pixelsPerArcsec: 10,
    planet: targetPreviewPlanet("saturn", instant),
  });
  const fills = saturn.calls.filter((call) => call[0] === "fill").length;
  assert.equal(fills, 5);
});

test("the disc of an illustration: the bundled table, else found in the pixels", async () => {
  const { targetPreviewDiscCrop, targetPreviewIllustrationCrop } =
    await import("../src/target-preview-planet.js");
  assert.deepEqual(
    targetPreviewIllustrationCrop(
      "https://images-assets.nasa.gov/image/PIA01509/PIA01509~thumb.jpg",
    ),
    { x: 0.536, y: 0.495, side: 0.765 },
  );
  assert.equal(
    targetPreviewIllustrationCrop(
      "https://images-assets.nasa.gov/image/PIA13823/PIA13823~thumb.jpg",
    ).fill,
    "#9d958a",
  );
  assert.equal(targetPreviewIllustrationCrop("/local/moon.jpg"), null);
  // A bright square of 4 × 4 in the right half of an 8 × 8 dark picture,
  // itself 200 × 100 pixels.
  const rgba = new Uint8ClampedArray(8 * 8 * 4);
  for (let row = 2; row < 6; row += 1)
    for (let column = 4; column < 8; column += 1)
      rgba.fill(220, (row * 8 + column) * 4, (row * 8 + column) * 4 + 3);
  assert.deepEqual(
    targetPreviewDiscCrop(rgba, 8, 8, {
      naturalWidth: 200,
      naturalHeight: 100,
    }),
    { x: 0.75, y: 0.5, side: 0.5 },
  );
  assert.equal(targetPreviewDiscCrop(new Uint8ClampedArray(16), 2, 2), null);
});
