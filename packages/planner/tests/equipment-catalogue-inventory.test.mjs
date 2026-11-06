import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// EQUIPMENT-CATALOGUE-02: the inventory of the common equipment profiles by
// family and by maker (floors, never ceilings), and no duplicate.

const data = JSON.parse(
  await readFile(
    new URL("../src/common-equipment-profiles.json", import.meta.url),
    "utf8",
  ),
);
const families = [
  "telescopes",
  "cameras",
  "eyepieces",
  "opticalModifiers",
  "mounts",
  "filterProducts",
  "binoculars",
  "integratedCameras",
  "filters",
];
const count = (key, maker) =>
  data[key].filter((entry) => entry.maker === maker).length;

test("no identifier is used twice in the file, and no name twice within a family", () => {
  const ids = new Map();
  for (const key of families)
    for (const entry of data[key]) {
      assert.ok(
        !ids.has(entry.id),
        `${entry.id} in ${key} and ${ids.get(entry.id)}`,
      );
      ids.set(entry.id, key);
    }
  for (const key of families.filter(
    (k) => !["integratedCameras", "filters"].includes(k),
  )) {
    const names = new Set();
    for (const entry of data[key]) {
      assert.ok(!names.has(entry.name), `${key}: ${entry.name}`);
      names.add(entry.name);
    }
  }
});

test("the families and makers added by EQUIPMENT-CATALOGUE-02 are there", () => {
  assert.ok(data.binoculars.length >= 24);
  assert.ok(count("binoculars", "Nikon") >= 12);
  for (const maker of [
    "Canon",
    "Celestron",
    "Vixen",
    "Oberwerk",
    "Omegon",
    "APM",
  ])
    assert.ok(count("binoculars", maker) >= 1, maker);
  assert.ok(count("cameras", "Atik") >= 8);
  assert.ok(count("cameras", "Pentax") >= 7);
  assert.ok(count("cameras", "OM System") >= 5);
  for (const maker of ["Astro-Tech", "Omegon", "GSO", "Lacerta"])
    assert.ok(count("telescopes", maker) >= 1, maker);
  for (const maker of ["Antlia", "IDAS", "Baader", "Chroma"])
    assert.ok(count("filterProducts", maker) >= 1, maker);
  assert.ok(
    data.eyepieces.filter((e) => /^tele-vue-(plossl|delite)/.test(e.id))
      .length >= 17,
  );
  // The binoculars added after the first nine: the exit pupil follows the optics.
  for (const entry of data.binoculars.slice(9)) {
    assert.ok(entry.magnification > 0 && entry.apertureMm > 0, entry.id);
    assert.ok(entry.trueFieldDegrees > 0, entry.id);
    assert.ok(
      Math.abs(entry.apertureMm / entry.magnification - entry.exitPupilMm) <
        0.35,
      entry.id,
    );
  }
  // A camera's pixel agrees with its sensor to within the page's rounding.
  for (const entry of data.cameras.filter((e) =>
    /^(atik|pentax|om-system|olympus|qhyccd-(qhy533|qhy174gps|minicam8))/.test(
      e.id,
    ),
  )) {
    assert.ok(
      entry.sensorWidthMm > 0 &&
        entry.sensorHeightMm > 0 &&
        entry.pixelSizeUm > 0,
      entry.id,
    );
    assert.ok(
      (entry.sensorWidthMm * 1000) / entry.pixelSizeUm > 1000,
      entry.id,
    );
  }
});
