import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import {
  solarSystemImageFor,
  solarSystemImageSources,
} from "../dist/solar-system-image-sources.js";

// NASA's PIA23791 is a comparison board, two views
// of Venus side by side with a white rule between them. The source record
// declares the crop the import applies; the other bodies declare none.

test("the Venus record declares its crop: the left half of PIA23791", () => {
  const venus = solarSystemImageSources.find(
    (source) => source.targetId === "solar-system-venus",
  );
  assert.equal(venus.nasaId, "PIA23791");
  assert.equal(venus.crop, "left-half");
});

test("the Venus image reference carries the crop, with the same source and licence", () => {
  const venus = solarSystemImageFor("solar-system-venus");
  assert.equal(venus.crop, "left-half");
  assert.equal(venus.file, "solar-system-venus.jpg");
  assert.equal(venus.source, "NASA Image and Video Library");
  assert.equal(venus.license, "NASA media usage guidelines");
  assert.equal(
    venus.licenseUrl,
    "https://www.nasa.gov/nasa-brand-center/images-and-media/",
  );
  assert.equal(venus.sourceUrl, "https://images.nasa.gov/details/PIA23791");
});

test("no other body declares a crop", () => {
  const cropped = solarSystemImageSources
    .filter((source) => source.crop)
    .map((source) => source.targetId);
  assert.deepEqual(cropped, ["solar-system-venus"]);
  assert.equal("crop" in solarSystemImageFor("solar-system-earth"), false);
});

// The eleven pictures ship with the code (`examples/target-library-images/`,
// beside their credits), so that the image of a portal and a private portal
// serve them without an import. A source declared here with no file there
// would bring back the broken thumbnails.
const shipped = new URL(
  "../../../examples/target-library-images/",
  import.meta.url,
);
const fileOf = (source) => solarSystemImageFor(source.targetId).file;

test("every picture the sources declare is in the repository, as a JPEG", () => {
  for (const source of solarSystemImageSources) {
    const bytes = readFileSync(new URL(fileOf(source), shipped));
    assert.ok(bytes.length > 1_000, `${fileOf(source)} is too small`);
    assert.deepEqual(
      [...bytes.subarray(0, 3)],
      [0xff, 0xd8, 0xff],
      `${fileOf(source)} is not a JPEG`,
    );
  }
});

test("the repository holds no picture the sources do not declare", () => {
  const declared = new Set(solarSystemImageSources.map(fileOf));
  const held = readdirSync(shipped).filter((name) => name.endsWith(".jpg"));
  assert.deepEqual(held.sort(), [...declared].sort());
});

test("SOURCES.json credits each picture exactly as the sources declare it", () => {
  const credits = JSON.parse(readFileSync(new URL("SOURCES.json", shipped)));
  assert.match(credits.notice, /not part of Astro Portal's AGPL-3\.0/);
  assert.equal(credits.license, "NASA media usage guidelines");
  assert.deepEqual(
    credits.images.map((entry) => entry.targetId),
    solarSystemImageSources.map((source) => source.targetId),
  );
  for (const entry of credits.images) {
    const reference = solarSystemImageFor(entry.targetId);
    for (const key of [
      "file",
      "sourceUrl",
      "assetUrl",
      "title",
      "credit",
      "license",
      "licenseUrl",
      "crop",
    ])
      assert.equal(entry[key], reference[key], `${entry.targetId}.${key}`);
    assert.ok(entry.creditLine, `${entry.targetId} has no credit line`);
    const bytes = readFileSync(new URL(entry.file, shipped));
    assert.equal(entry.bytes, bytes.length, `${entry.file} size`);
    assert.equal(
      entry.sha256,
      createHash("sha256").update(bytes).digest("hex"),
      `${entry.file} was changed without SOURCES.json`,
    );
  }
});

test("CREDITS.md names every picture, its NASA record and the licence", () => {
  const credits = readFileSync(new URL("CREDITS.md", shipped), "utf8");
  assert.match(credits, /not covered by its AGPL-3\.0 licence/);
  assert.ok(credits.includes("NASA media usage guidelines"));
  for (const source of solarSystemImageSources) {
    assert.ok(credits.includes(fileOf(source)), fileOf(source));
    assert.ok(credits.includes(source.nasaId), source.nasaId);
  }
});
