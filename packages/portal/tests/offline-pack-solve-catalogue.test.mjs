import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  encodeSolveCatalogue,
  solveCatalogueComponentId,
  solveCataloguePackComponent,
  solveCatalogueStarsFromHyg,
} from "portal/offline-pack/solve-catalogue.js";

// A synthetic HYG v4.1 extract: the header's own columns, invented stars.
const csv = [
  '"id","hip","proper","ra","dec","mag","ci"',
  '0,,"Sol",0,0,-26.7,0.656',
  '1,1,"",20.0,40.0,9.1,0.5',
  '2,2,"Synthétique",20.5,38.0,2.2,1.1',
  '3,3,"",1.0,-10.0,8.4,',
  '4,4,"",23.99,60.0,6.4,0.2',
].join("\n");

test("the deep catalogue keeps HYG stars to magnitude 8.5, brightest first, without the Sun", () => {
  const stars = solveCatalogueStarsFromHyg(csv);
  assert.deepEqual(
    stars.map((star) => star.vmag),
    [2.2, 6.4, 8.4],
  );
  // Hours become degrees; a missing colour index is 0.5.
  assert.equal(stars[0].ra, 307.5);
  assert.equal(stars[2].bv, 0.5);
  assert.equal(solveCatalogueStarsFromHyg(csv, { magnitude: 7 }).length, 2);
});

test("the deep catalogue is written in the app's PSTR layout", () => {
  const stars = solveCatalogueStarsFromHyg(csv);
  const bytes = encodeSolveCatalogue(stars);
  assert.equal(bytes.toString("ascii", 0, 4), "PSTR");
  assert.equal(bytes.readUInt8(4), 1);
  assert.equal(bytes.readUInt32LE(8), 3);
  // Stars at or brighter than 6.5.
  assert.equal(bytes.readUInt32LE(12), 2);
  assert.equal(bytes.length, 24 + 3 * 12);
  assert.ok(Math.abs(bytes.readFloatLE(24) - 307.5) < 1e-4);
  assert.ok(Math.abs(bytes.readFloatLE(24 + 3 * 4) - 38) < 1e-4);
  assert.equal(bytes.readInt16LE(24 + 3 * 8), 220);
});

test("the component: optional file-set, revision and checksum of the bytes, attributed", () => {
  const bytes = encodeSolveCatalogue(solveCatalogueStarsFromHyg(csv));
  const component = solveCataloguePackComponent({ bytes, starCount: 3 });
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  assert.equal(component.id, solveCatalogueComponentId);
  assert.equal(component.kind, "file-set");
  assert.equal(component.required, false);
  assert.equal(component.revision, digest);
  assert.equal(component.estimatedBytes, bytes.length);
  assert.equal(component.stars, 3);
  assert.deepEqual(component.files, [
    {
      name: "stars.bin",
      url: "solve-catalogue/stars.bin",
      bytes: bytes.length,
      checksum: digest,
    },
  ]);
  assert.match(component.attribution, /HYG v4\.1/);
  assert.equal(component.license, "CC BY-SA 4.0");
  assert.equal(solveCataloguePackComponent({ bytes: null }), null);
});
