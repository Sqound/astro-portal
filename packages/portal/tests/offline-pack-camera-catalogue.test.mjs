import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  cameraCatalogueComponentId,
  cameraCatalogueHeader,
  cameraCataloguePackComponent,
  cameraCatalogueZoneOf,
  cameraCatalogueZones,
  encodeCameraCatalogue,
  tycho2MainStars,
  tycho2Photometry,
  tycho2SupplementStars,
} from "portal/offline-pack/camera-catalogue.js";

import { tycho2MainLine, tycho2SupplementLine } from "./tycho2-lines.mjs";

test("V and B−V come from BT and VT as the ReadMe's note 7 gives them", () => {
  const both = tycho2Photometry(10.6, 10.0);
  assert.ok(Math.abs(both.vmag - 9.946) < 1e-9);
  assert.ok(Math.abs(both.bv - 0.51) < 1e-9);
  assert.deepEqual(tycho2Photometry(Number.NaN, 9), { vmag: 9, bv: 0.5 });
  assert.deepEqual(tycho2Photometry(9.4, Number.NaN), { vmag: 9, bv: 0.5 });
  assert.equal(tycho2Photometry(Number.NaN, Number.NaN), null);
});

test("main records: the mean position, or the observed one under the X flag; a star without photometry is left out", () => {
  const text = [
    tycho2MainLine({ ra: 310.358, dec: 45.28, bt: 1.4, vt: 1.3 }),
    tycho2MainLine({ ra: 12.5, dec: -60, bt: null, vt: 11.2, observed: true }),
    tycho2MainLine({ ra: 1, dec: 1, bt: null, vt: null }),
    "short line",
  ].join("\n");
  const stars = tycho2MainStars(text);
  assert.equal(stars.length, 2);
  assert.equal(stars[0].ra, 310.358);
  assert.equal(stars[1].dec, -60);
  assert.equal(stars[1].vmag, 11.2);
  const supplement = tycho2SupplementStars(
    tycho2SupplementLine({ ra: 101.287, dec: -16.716, bt: -1.0, vt: -1.1 }),
  );
  assert.equal(supplement.length, 1);
  assert.ok(Math.abs(supplement[0].vmag - -1.109) < 1e-9);
});

test("zones: 2° bands, about square cells, every position in one zone", () => {
  const zones = cameraCatalogueZones(2);
  assert.equal(zones.bandCount, 90);
  assert.equal(zones.cells[45], 180);
  assert.ok(zones.cells[0] >= 1 && zones.cells[0] < 5);
  assert.equal(zones.zoneCount, 10312);
  assert.equal(cameraCatalogueZoneOf(0, -90, zones), 0);
  assert.equal(cameraCatalogueZoneOf(359.9999, 90, zones), zones.zoneCount - 1);
  assert.equal(
    cameraCatalogueZoneOf(-1, 0.5, zones),
    cameraCatalogueZoneOf(359, 0.5, zones),
  );
});

function decodeStars(bytes) {
  const header = cameraCatalogueHeader(bytes);
  const zones = cameraCatalogueZones(header.bandHeight);
  const cellsBytes = Math.ceil((header.bandCount * 2) / 4) * 4;
  const directory = 24 + cellsBytes;
  const first = directory + (header.zoneCount + 1) * 4;
  const stars = [];
  for (let band = 0; band < zones.bandCount; band += 1) {
    for (let cell = 0; cell < zones.cells[band]; cell += 1) {
      const zone = zones.firstZone[band] + cell;
      const start = bytes.readUInt32LE(directory + zone * 4);
      const end = bytes.readUInt32LE(directory + (zone + 1) * 4);
      const width = 360 / zones.cells[band];
      for (let index = start; index < end; index += 1) {
        const at = first + index * 8;
        stars.push({
          zone,
          ra: (cell + bytes.readUInt16LE(at) / 65535) * width,
          dec: -90 + (band + bytes.readUInt16LE(at + 2) / 65535) * 2,
          vmag: bytes.readInt16LE(at + 4) / 100,
          bv: bytes.readInt16LE(at + 6) / 100,
        });
      }
    }
  }
  return stars;
}

test("PSTZ: stars to the limit, zone by zone, brightest first, positions to 0.3″", () => {
  const stars = [
    { ra: 310.358, dec: 45.28, vmag: 1.25, bv: 0.09 },
    { ra: 310.9, dec: 45.9, vmag: 11.4, bv: 0.6 },
    { ra: 310.5, dec: 45.5, vmag: 9.2, bv: 1.1 },
    { ra: 192.859, dec: 27.128, vmag: 10.1, bv: 0.4 },
    { ra: 0.0001, dec: -89.99, vmag: 7, bv: 0 },
    { ra: 10, dec: 10, vmag: 11.6, bv: 0 },
  ];
  const bytes = encodeCameraCatalogue(stars);
  const header = cameraCatalogueHeader(bytes);
  assert.equal(bytes.toString("ascii", 0, 4), "PSTZ");
  assert.equal(header.stars, 5, "the star beyond 11.5 is left out");
  assert.equal(header.magnitudeLimit, 11.5);
  assert.equal(header.bandHeight, 2);
  const cellsBytes = Math.ceil((header.bandCount * 2) / 4) * 4;
  assert.equal(
    bytes.length,
    24 + cellsBytes + (header.zoneCount + 1) * 4 + 5 * 8,
  );
  const decoded = decodeStars(bytes);
  assert.equal(decoded.length, 5);
  for (const star of stars.slice(0, 5)) {
    const found = decoded.find(
      (entry) => Math.abs(entry.vmag - star.vmag) < 0.005,
    );
    const error =
      Math.hypot(
        (found.ra - star.ra) * Math.cos((star.dec * Math.PI) / 180),
        found.dec - star.dec,
      ) * 3600;
    assert.ok(error < 0.3, `${star.vmag}: ${error}″`);
  }
  // Deneb's zone: Deneb, then the 9.2 star, then the 11.4 one.
  const deneb = decoded.filter((entry) => entry.zone === decoded[1].zone);
  assert.deepEqual(
    deneb.map((entry) => entry.vmag),
    [...deneb.map((entry) => entry.vmag)].sort((a, b) => a - b),
  );
  // The same stars in another order: the same bytes.
  assert.deepEqual(encodeCameraCatalogue([...stars].reverse()), bytes);
});

test("a header that does not match its size is not a catalogue", () => {
  const bytes = encodeCameraCatalogue([{ ra: 1, dec: 1, vmag: 5, bv: 0 }]);
  assert.equal(
    cameraCatalogueHeader(bytes.subarray(0, bytes.length - 1)),
    null,
  );
  assert.equal(cameraCatalogueHeader(Buffer.from("PSTR")), null);
  assert.equal(cameraCataloguePackComponent({ bytes: Buffer.alloc(0) }), null);
});

test("the component: optional file-set, digest of the bytes, Tycho-2 credited with the authorisation asked", () => {
  const bytes = encodeCameraCatalogue([
    { ra: 1, dec: 1, vmag: 5, bv: 0 },
    { ra: 2, dec: 2, vmag: 6, bv: 0 },
  ]);
  const source = { catalogue: "Tycho-2", files: [] };
  const component = cameraCataloguePackComponent({ bytes, source });
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  assert.equal(component.id, cameraCatalogueComponentId);
  assert.equal(component.kind, "file-set");
  assert.equal(component.required, false);
  assert.equal(component.revision, digest);
  assert.equal(component.stars, 2);
  assert.equal(component.layout, "PSTZ");
  assert.equal(component.magnitudeLimit, 11.5);
  assert.deepEqual(component.files, [
    {
      name: "stars.bin",
      url: "camera-catalogue/stars.bin",
      bytes: bytes.length,
      checksum: digest,
    },
  ]);
  assert.equal(
    `${component.attribution}, ${component.license}`,
    "Tycho-2 Catalogue (Høg et al. 2000), ESA Hipparcos mission, CC BY-NC 3.0 IGO, autorisation commerciale demandée à l'ESA le 04/11/2026",
  );
  assert.deepEqual(component.source, source);
});
