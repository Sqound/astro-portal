// The pure
// module the portal draws the sky annotations with — the gnomonic
// projection of a sky solution, checked against a known TAN WCS (the
// synthetic fixture `fixtures/sky-annotations/m31-tan.wcs`, projected here
// by the FITS definition itself: the inverse CD matrix about CRVAL), the
// three kinds of annotations `PlateOverlay` reads, the magnitude limit, and
// the HYG stars' labels.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hygStarsFromCsv,
  skyAnnotations,
} from "../dist/sky-annotations/annotations.js";
import {
  ALL_STARS_MAGNITUDE,
  STAR_BATCHES,
  batchToDraw,
  starBatchMagnitude,
  starBatchOf,
  starBatchUrl,
} from "../dist/sky-annotations/star-batches.js";
import {
  fieldRadiusDeg,
  pixelToSky,
  skyToPixel,
  standardCoordinates,
} from "../dist/sky-annotations/projection.js";
import {
  numericFitsCards,
  skySolutionFromWcsCards,
} from "../dist/sky-annotations/wcs-header.js";

const cards = numericFitsCards(
  await readFile(
    new URL("./fixtures/sky-annotations/m31-tan.wcs", import.meta.url),
  ),
);

/** The pixel of a sky position by the FITS definition (y downward, 0-based edges). */
function wcsPixel(wcs, raDeg, decDeg) {
  const standard = standardCoordinates(
    { raDeg: wcs.CRVAL1, decDeg: wcs.CRVAL2 },
    raDeg,
    decDeg,
  );
  const determinant = wcs.CD1_1 * wcs.CD2_2 - wcs.CD1_2 * wcs.CD2_1;
  const dx = (wcs.CD2_2 * standard.xi - wcs.CD1_2 * standard.eta) / determinant;
  const dy =
    (-wcs.CD2_1 * standard.xi + wcs.CD1_1 * standard.eta) / determinant;
  return { x: wcs.CRPIX1 + dx - 0.5, y: wcs.CRPIX2 + dy - 0.5 };
}

const near = (actual, expected, tolerance, label) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} is not within ${tolerance} of ${expected}`,
  );

test("the solution read from a known TAN WCS projects the sky as the WCS does, to a hundredth of a pixel", () => {
  const solution = skySolutionFromWcsCards(cards);
  assert.equal(solution.parity, "normal");
  assert.equal(solution.width, 3000);
  assert.equal(solution.height, 2000);
  near(solution.pixelScaleArcsec, 2.06, 1e-5, "scale");
  near(solution.rotationDeg, 30, 0.01, "rotation");
  near(solution.fieldWidthDeg, (3000 * 2.06) / 3600, 1e-6, "field width");
  // The centre is the image's own, not the reference pixel's.
  const centre = wcsPixel(cards, solution.raDeg, solution.decDeg);
  near(centre.x, 1500, 1e-6, "centre x");
  near(centre.y, 1000, 1e-6, "centre y");
  // Positions across the field, corners included: the same pixels.
  for (const [x, y] of [
    [0, 0],
    [3000, 0],
    [0, 2000],
    [3000, 2000],
    [700, 1500],
    [2250, 420],
  ]) {
    const sky = pixelToSky(solution, x, y);
    const expected = wcsPixel(cards, sky.raDeg, sky.decDeg);
    near(expected.x, x, 0.01, `x at ${x},${y}`);
    near(expected.y, y, 0.01, `y at ${x},${y}`);
    const back = skyToPixel(solution, sky.raDeg, sky.decDeg);
    near(back.x, x, 1e-6, "round trip x");
    near(back.y, y, 1e-6, "round trip y");
  }
  near(
    fieldRadiusDeg(solution),
    Math.hypot(1500, 1000) * (2.06 / 3600),
    1e-3,
    "radius",
  );
});

test("north, east, rotation and parity: north up and east left at 0, east right when mirrored", () => {
  const base = {
    raDeg: 180,
    decDeg: 0,
    pixelScaleArcsec: 36,
    rotationDeg: 0,
    parity: "normal",
    width: 1000,
    height: 1000,
  };
  const north = skyToPixel(base, 180, 1);
  near(north.x, 500, 1e-6, "north x");
  near(north.y, 400, 0.05, "north y");
  const east = skyToPixel(base, 181, 0);
  assert.ok(east.x < 500, "east is to the left");
  const mirrored = skyToPixel({ ...base, parity: "mirrored" }, 181, 0);
  assert.ok(mirrored.x > 500, "east is to the right when mirrored");
  // Up points 90° east of north: north is now to the right.
  const turned = skyToPixel({ ...base, rotationDeg: 90 }, 180, 1);
  near(turned.x, 600, 0.05, "north to the right");
  near(turned.y, 500, 1e-6, "north on the middle row");
  // A reduced copy of the same proportions: the same place, scaled.
  const half = skyToPixel(base, 180, 1, 0.5);
  near(half.y, 200, 0.05, "scaled");
  // The far side of the sky has no pixel.
  assert.equal(skyToPixel(base, 0, 0), null);
});

const solution = { ...skySolutionFromWcsCards(cards), schemaVersion: 1 };
const at = (x, y) => pixelToSky(solution, x, y);
const entry = (id, x, y, sizeArcmin, aliases = []) => ({
  id,
  designation: id.toUpperCase(),
  aliases,
  sizeArcmin,
  ...at(x, y),
});

test("the three kinds: the capture's targets first, two secondary objects, then the stars, brightest first", () => {
  const annotations = skyAnnotations({
    solution,
    width: 1500,
    height: 1000,
    targets: [entry("m31", 1500, 1000, [190, 60], ["NGC 224"])],
    objects: [
      entry("m31", 1500, 1000, [190, 60]),
      entry("m32", 1600, 1100, [9, 7]),
      entry("m110", 1200, 600, [22, 13]),
      entry("ngc206", 1100, 1300, [4, 4]),
      entry("ngc185", 5000, 5000, [12, 10]),
    ],
    stars: [
      { ...at(400, 300), vmag: 6.1, label: "HD 3914" },
      { ...at(2600, 1800), vmag: 4.4, label: "Nu And" },
      { ...at(2000, 200), vmag: 9.8, label: "HIP 3500" },
      { ...at(-50, 300), vmag: 2, label: "Outside" },
    ],
  });
  assert.deepEqual(
    annotations.map((item) => [item.type, item.names[0], item.target === true]),
    [
      ["ngc", "M31", true],
      ["ngc", "M110", false],
      ["ngc", "M32", false],
      ["bright", "Nu And", false],
      ["bright", "HD 3914", false],
      // Fainter than 8.5 and known by a number only: a point, no label.
      ["bright", undefined, false],
    ],
  );
  const [target] = annotations;
  // In the pixels of the copy shown (half the solved size).
  near(target.pixelx, 750, 0.01, "target x");
  near(target.pixely, 500, 0.01, "target y");
  assert.deepEqual(target.names, ["M31", "NGC 224"]);
  // Radius: half the major axis, in pixels of the copy shown.
  near(target.radius, ((190 * 60) / 2 / 2.06) * 0.5, 0.01, "radius");
  const star = annotations.find((item) => item.names[0] === "Nu And");
  assert.equal(star.radius, 0);
  assert.equal(star.vmag, 4.4);
});

test("the magnitude limit and the ceiling of stars", () => {
  const stars = Array.from({ length: 30 }, (_, index) => ({
    ...at(100 + index * 90, 500),
    vmag: 3 + index * 0.25,
    label: `Star ${index}`,
    named: true,
  }));
  const bright = skyAnnotations({ solution, stars, magnitude: 5 });
  assert.equal(bright.length, 9);
  assert.ok(bright.every((item) => item.vmag <= 5));
  const few = skyAnnotations({ solution, stars, magnitude: 99, maxStars: 4 });
  assert.deepEqual(
    few.map((item) => item.names[0]),
    ["Star 0", "Star 1", "Star 2", "Star 3"],
  );
  // The ceiling is the batch's: 400 stars up to 3.5, more further down.
  const crowd = Array.from({ length: 5000 }, (_, index) => ({
    ...at(50 + (index % 100) * 29, 30 + Math.floor(index / 100) * 18),
    vmag: 1 + index * 0.0016,
    label: "",
  }));
  const counts = [3.5, 5.5, 8.5, 10, 99].map(
    (magnitude) => skyAnnotations({ solution, stars: crowd, magnitude }).length,
  );
  assert.deepEqual(counts, [400, 800, 2000, 4000, 5000]);
  assert.ok(
    counts.every((count, index) => !index || count > counts[index - 1]),
  );
});

test("a star with no label to show is a point: fainter than 8.5 and known by a number only, or by none", () => {
  const star = (x, vmag, label, named = false) => ({
    ...at(x, 500),
    vmag,
    label,
    named,
  });
  const drawn = skyAnnotations({
    solution,
    magnitude: 99,
    stars: [
      star(200, 7, "HD 1"),
      star(400, 9.2, "HD 2"),
      star(600, 9.4, "Sadr", true),
      star(800, 5, ""),
      star(1000, 12, ""),
    ],
  });
  assert.deepEqual(
    drawn.map((item) => [item.vmag, item.names]),
    [
      [5, []],
      [7, ["HD 1"]],
      [9.2, []],
      [9.4, ["Sadr"]],
      [12, []],
    ],
  );
  assert.ok(drawn.every((item) => item.type === "bright" && item.radius === 0));
});

test("the batches of stars: the threshold of a magnitude, its ceiling, the batch drawn meanwhile", () => {
  assert.deepEqual(
    STAR_BATCHES.map((batch) => [batch.upTo, batch.max]),
    [
      [3.5, 400],
      [5.5, 800],
      [8.5, 2000],
      [10, 4000],
      [Infinity, 10000],
    ],
  );
  // What the selector's values ask the server for.
  assert.deepEqual(
    [3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10, 99].map(starBatchMagnitude),
    [3.5, 5.5, 5.5, 8.5, 8.5, 8.5, 10, 10, ALL_STARS_MAGNITUDE],
  );
  assert.equal(starBatchOf(10).max >= 400, true);
  // No magnitude: the default, 10 (the phone asks for none).
  assert.equal(starBatchMagnitude(null), 10);
  assert.equal(starBatchMagnitude(""), 10);
  assert.equal(starBatchMagnitude("nonsense"), 10);
  assert.equal(starBatchMagnitude("11.5"), ALL_STARS_MAGNITUDE);
  assert.equal(
    starBatchUrl("/api/v1/gallery/c1/annotations", 8.5),
    "/api/v1/gallery/c1/annotations?magnitude=8.5",
  );
  assert.equal(
    starBatchUrl("/api/v1/gallery/c1/annotations?imageId=v%201", 99),
    "/api/v1/gallery/c1/annotations?imageId=v%201&magnitude=99",
  );
  // The batch the viewer draws: its own once read, else the smallest read that
  // holds it, else the largest read; nothing while none is.
  assert.equal(batchToDraw([5.5, 10], 5.5), 5.5);
  assert.equal(batchToDraw([5.5, 10], 8.5), 10);
  assert.equal(batchToDraw([5.5], 99), 5.5);
  assert.equal(batchToDraw([], 5.5), undefined);
});

test("the HYG stars carry their proper name, else Bayer–Flamsteed, else HD or HIP, else none; the Sun is left out", () => {
  const csv = [
    "id,hip,hd,hr,gl,bf,proper,ra,dec,dist,pmra,pmdec,rv,mag",
    "0,,,,,,Sol,0,0,0,0,0,0,-26.7",
    "1,3881,4881,,,,,0.83,41.08,1,0,0,0,7.1",
    '2,,,,,"35Nu And",,0.83,41.08,1,0,0,0,4.5',
    "3,,9999,,,,Mirach,1.16,35.62,1,0,0,0,2.05",
    "4,4000,,,,,,1.2,40.1,1,0,0,0,8.9",
    "5,,,,,,,1.3,40.2,1,0,0,0,11.2",
    "6,,,,,,,nonsense,40.2,1,0,0,0,11.2",
  ].join("\n");
  assert.deepEqual(
    hygStarsFromCsv(csv).map((star) => [star.label, star.vmag, star.named]),
    [
      ["HD 4881", 7.1, false],
      ["35Nu And", 4.5, true],
      ["Mirach", 2.05, true],
      ["HIP 4000", 8.9, false],
      // Known by no number: kept, as a point.
      ["", 11.2, false],
    ],
  );
  near(hygStarsFromCsv(csv)[2].raDeg, 1.16 * 15, 1e-9, "degrees");
  assert.deepEqual(hygStarsFromCsv("nothing"), []);
});

test("a WCS written with CDELT and CROTA2 reads like its CD matrix", () => {
  const rho = (30 * Math.PI) / 180;
  const scale = 2.06 / 3600;
  const fromCdelt = skySolutionFromWcsCards({
    ...cards,
    CD1_1: undefined,
    CD1_2: undefined,
    CD2_1: undefined,
    CD2_2: undefined,
    CDELT1: -scale,
    CDELT2: -scale,
    CROTA2: 30,
  });
  const fromCd = skySolutionFromWcsCards({
    ...cards,
    CD1_1: -scale * Math.cos(rho),
    CD1_2: scale * Math.sin(rho),
    CD2_1: -scale * Math.sin(rho),
    CD2_2: -scale * Math.cos(rho),
  });
  near(fromCdelt.rotationDeg, fromCd.rotationDeg, 1e-9, "rotation");
  near(fromCdelt.raDeg, fromCd.raDeg, 1e-9, "ra");
  assert.equal(skySolutionFromWcsCards({ CRVAL1: 1 }), null);
});
