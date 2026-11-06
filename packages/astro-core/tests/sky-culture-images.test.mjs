import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  skyCultureImageFile,
  skyCultureImageFor,
  skyCultureImageKind,
  skyCultureImageUrl,
  skyCultureImageVariants,
} from "../dist/sky-culture-images.js";
import {
  brightStarCatalogueTargets,
  constellationCatalogueTargets,
} from "../dist/sky-targets.js";

// The pictures of the bright stars and of the constellations ship with the
// code (`examples/sky-culture-images/`): every subject has its files, in the
// sizes the pages ask for, and the catalogue entries name them.

const shipped = new URL(
  "../../../examples/sky-culture-images/",
  import.meta.url,
);
const subjects = [
  ...brightStarCatalogueTargets,
  ...constellationCatalogueTargets,
];

test("a star has a card picture and a full-screen one; a constellation its bare sky too", () => {
  assert.equal(skyCultureImageKind("star-hip-91262"), "star");
  assert.equal(skyCultureImageKind("constellation-lyr"), "constellation");
  assert.equal(skyCultureImageKind("openngc-ngc6720"), null);
  assert.equal(skyCultureImageKind(null), null);
  assert.deepEqual(
    skyCultureImageVariants("star-hip-91262").map((variant) => [
      variant.file,
      variant.pixels,
    ]),
    [
      ["star-hip-91262.jpg", 360],
      ["star-hip-91262-full.jpg", 900],
    ],
  );
  assert.deepEqual(
    skyCultureImageVariants("constellation-lyr").map((variant) => [
      variant.name,
      variant.file,
      variant.pixels,
    ]),
    [
      ["thumbnail", "constellation-lyr.jpg", 360],
      ["full", "constellation-lyr-full.jpg", 900],
      ["naked", "constellation-lyr-naked.jpg", 696],
      ["nakedLines", "constellation-lyr-naked-lines.jpg", 696],
    ],
  );
  assert.equal(
    skyCultureImageUrl("constellation-lyr", "nakedLines"),
    "/target-library-images/constellation-lyr-naked-lines.jpg",
  );
  assert.equal(skyCultureImageFile("star-hip-91262", "naked"), null);
  assert.equal(skyCultureImageUrl("openngc-ngc6720"), null);
});

test("every bright star and every constellation names its picture, a constellation with the drawing's credit", () => {
  assert.equal(subjects.length, 180);
  for (const target of subjects) {
    assert.deepEqual(target.dssImage, skyCultureImageFor(target.id), target.id);
    assert.equal(target.dssImage.file, `${target.id}.jpg`);
  }
  assert.equal(skyCultureImageFor("constellation-lyr").credit, "Stellarium");
  assert.equal(skyCultureImageFor("star-hip-91262").credit, null);
});

test("the folder holds every file of every subject, as JPEG, and nothing else", () => {
  const expected = subjects.flatMap((target) =>
    skyCultureImageVariants(target.id).map((variant) => variant.file),
  );
  assert.equal(expected.length, 92 * 2 + 88 * 4);
  const held = readdirSync(shipped).filter((name) => name.endsWith(".jpg"));
  assert.deepEqual(held.sort(), [...expected].sort());
  for (const file of expected) {
    const bytes = readFileSync(new URL(file, shipped));
    assert.ok(bytes.length > 2_000, `${file} is too small`);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], file);
  }
  const manifest = JSON.parse(
    readFileSync(new URL("sky-culture-images.json", shipped), "utf8"),
  );
  assert.match(manifest.notice, /Johan Meuris/);
  assert.equal(Object.keys(manifest.images).length, 180);
  const credits = readFileSync(new URL("CREDITS.md", shipped), "utf8");
  assert.match(credits, /Johan Meuris/);
  assert.match(credits, /Free Art License/);
});
