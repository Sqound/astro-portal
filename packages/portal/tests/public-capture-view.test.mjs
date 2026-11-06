import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { schemaErrors } from "../../astro-contracts/tests/schema-assert.mjs";
import {
  comparePublicCaptures,
  formatNightMonth,
  nightMonth,
  publicCaptureAliases,
  publicCaptureTitle,
  publicGalleryCapture,
  publicGalleryItem,
  publicGalleryTag,
} from "../dist/captures/public-capture-view.js";

// The view model of the public gallery: what a visitor reads of a public
// capture, checked against gallery.schema.json — strict at every level, so
// that nothing it does not name may leave.
const schema = JSON.parse(
  await readFile(
    new URL(
      "../../astro-contracts/schemas/api/gallery.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const errors = (pointer, value) =>
  schemaErrors({ ...schema, $ref: `#/$defs/${pointer}` }, value);

const row = {
  id: "0b6c7a3e-1f62-4c8a-9d64-3a1f5b2c7d10",
  nightAt: "2026-10-03T19:42:00.000Z",
  createdAt: "2026-10-04T08:00:00.000Z",
  publicName: "Camille",
  // What the repository also reads, and the view model never carries.
  tenantId: "space-1",
  originalName: "M31_LRGB_final.jpg",
  sha256: "a".repeat(64),
};
const m31 = {
  id: "m31",
  designation: "M31",
  aliases_json: '["NGC 224","UGC 454"]',
  common_names_json: "[]",
  type_key: "Galaxie",
  constellation_key: "Andromède",
  ra_hours: 0.712,
  dec_degrees: 41.269,
  catalogues_json: '["Messier"]',
};

test("a card: the target, its generic tag, the month, the signature — in the contract", () => {
  const item = publicGalleryItem({
    row,
    targets: [m31],
    telescope: "Lunette 72 mm",
    locale: "fr",
  });
  assert.deepEqual(errors("item", item), []);
  assert.equal(item.tag, "Galaxie");
  assert.deepEqual(item.tags, ["Galaxie", "Messier"]);
  assert.equal(item.nightMonth, "2026-10");
  assert.equal(item.signature, "Camille");
  assert.equal(item.telescope, "Lunette 72 mm");
  assert.equal(item.exposure, null);
  assert.equal(
    publicCaptureTitle(item, "Sans cible"),
    "M31 — Galaxie d’Andromède",
  );
  assert.equal(publicCaptureAliases(item), "M31 · NGC 224");
  assert.equal(
    item.media.thumbnail,
    `/api/v1/gallery/${row.id}/media?variant=thumbnail`,
  );
  // The target's position, never the place's.
  assert.ok(Math.abs(item.targets[0].ra - 10.68) < 0.01);
});

test("the schema refuses a key it does not name, at every level", () => {
  const item = publicGalleryItem({ row, targets: [m31], locale: "fr" });
  assert.notDeepEqual(errors("item", { ...item, location: "Lac Noir" }), []);
  assert.notDeepEqual(
    errors("item", {
      ...item,
      targets: [{ ...item.targets[0], latitude: 45 }],
    }),
    [],
  );
  assert.notDeepEqual(
    errors("item", { ...item, media: { ...item.media, original: "/x" } }),
    [],
  );
  const capture = publicGalleryCapture({ row, targets: [m31], locale: "fr" });
  assert.notDeepEqual(
    errors("capture", { ...capture, tenantId: "space-1" }),
    [],
  );
  assert.notDeepEqual(
    errors("capture", { ...capture, nightMonth: "2026-10-03" }),
    [],
    "the day of the night is never a valid value",
  );
});

test("every optional row absent: no target, no signature, no equipment, no sky quality, no image", () => {
  const capture = publicGalleryCapture({
    row: { id: "c2", nightAt: "2026-09-12T21:00:00.000Z", publicName: "  " },
    locale: "fr",
  });
  assert.deepEqual(errors("capture", capture), []);
  assert.equal(capture.signature, null);
  assert.equal(capture.tag, "Grand champ");
  assert.deepEqual(capture.tags, ["Grand champ"]);
  assert.deepEqual(capture.equipment, []);
  assert.equal(capture.skyQuality, null);
  assert.equal(capture.image, null);
  assert.equal(capture.telescope, null);
  assert.equal(publicCaptureTitle(capture, "Sans cible"), "Sans cible");
});

test("a visitor never reads a quality — a row that holds one gives a public capture without it, and the schema refuses one", () => {
  const capture = publicGalleryCapture({
    row: {
      ...row,
      quality: { fwhmPixels: 2.8, fwhmArcsec: 2.1, eccentricity: 0.38 },
      sessionQuality: { fwhm: 2.6, skyBackground: 905 },
    },
    targets: [m31],
    locale: "fr",
  });
  assert.deepEqual(errors("capture", capture), []);
  assert.doesNotMatch(
    JSON.stringify(capture),
    /"(quality|sessionQuality)"|fwhm|eccentricity/i,
  );
  assert.notDeepEqual(
    errors("capture", { ...capture, quality: { fwhmArcsec: 2.1 } }),
    [],
  );
});

test("the detail: the equipment by kind in a fixed order, the Bortle class, the pixel size", () => {
  const capture = publicGalleryCapture({
    row,
    targets: [m31],
    equipment: [
      { kind: "filter", name: "L-Pro" },
      { kind: "mount", name: "Monture équatoriale" },
      { kind: "telescope", name: "Lunette 72 mm" },
      { kind: "camera", name: "Caméra couleur refroidie" },
      { kind: "eyepiece", name: "Oculaire 25 mm" },
    ],
    skyQuality: { bortle: 4, source: "entered", latitude: 45 },
    image: { width: 4096, height: 2730, format: "jpeg" },
    locale: "fr",
  });
  assert.deepEqual(errors("capture", capture), []);
  assert.deepEqual(
    capture.equipment.map((item) => item.kind),
    ["telescope", "camera", "mount", "filter"],
  );
  assert.deepEqual(capture.skyQuality, { bortle: 4, source: "entered" });
  assert.deepEqual(capture.image, { width: 4096, height: 2730 });
  assert.equal(capture.telescope, "Lunette 72 mm");
});

test("the order: the date of the night, newest first, then the id; reversed by « Inverser le tri par date »", () => {
  const rows = [
    { id: "b", nightAt: "2026-09-01T20:00:00.000Z" },
    { id: "c", nightAt: "2026-10-03T19:00:00.000Z" },
    { id: "a", nightAt: "2026-10-03T19:00:00.000Z" },
    { id: "d", nightAt: "2026-08-15T22:00:00.000Z" },
  ];
  assert.deepEqual(
    [...rows].sort(comparePublicCaptures).map((entry) => entry.id),
    ["c", "a", "b", "d"],
  );
  assert.deepEqual(
    [...rows]
      .sort((left, right) =>
        comparePublicCaptures(left, right, { newestFirst: false }),
      )
      .map((entry) => entry.id),
    ["d", "b", "a", "c"],
  );
});

test("the month of the night in French, English and Japanese, never the day", () => {
  assert.equal(nightMonth("2026-10-03T19:42:00.000Z"), "2026-10");
  assert.equal(nightMonth("2026-10-03"), "2026-10");
  assert.equal(nightMonth("not a date"), null);
  assert.equal(formatNightMonth("2026-10", "fr"), "Octobre 2026");
  assert.equal(formatNightMonth("2026-08", "fr"), "Août 2026");
  assert.equal(formatNightMonth("2026-10", "en"), "October 2026");
  assert.equal(formatNightMonth("2026-10", "ja"), "2026年10月");
  assert.equal(formatNightMonth(null, "fr"), null);
});

test("the generic tags come from the object type, never a free word", () => {
  assert.equal(publicGalleryTag("Nébuleuse en émission"), "Nébuleuse");
  assert.equal(
    publicGalleryTag("Région H II / nébuleuse en émission"),
    "Nébuleuse",
  );
  assert.equal(publicGalleryTag("Amas globulaire"), "Amas");
  assert.equal(publicGalleryTag("Planète naine"), "Planète");
  // A star and a comet have a generic tag; the solar system has none.
  assert.equal(publicGalleryTag("Étoile"), "Étoile");
  assert.equal(publicGalleryTag("Comète"), "Comète");
  assert.equal(publicGalleryTag("Système solaire"), null);
  assert.equal(publicGalleryTag(null, { hasTarget: false }), "Grand champ");
});

test("a card never says its target twice: no line under a title that is the designation alone", () => {
  const card = (target) => ({ targets: [target] });
  // Designation alone: it is the title, there is nothing to add under it.
  assert.equal(
    publicCaptureAliases(
      card({ designation: "Sh2-103", name: null, aliases: [] }),
    ),
    "",
  );
  assert.equal(
    publicCaptureAliases(card({ designation: "LBN 455", aliases: [] })),
    "",
  );
  // Before a name too: « M31 — Galaxie d’Andromède » over « M31 » says it twice.
  assert.equal(
    publicCaptureAliases(
      card({ designation: "M31", name: "Galaxie d’Andromède", aliases: [] }),
    ),
    "",
  );
  // Aliases are what the line is for, and none is said twice.
  assert.equal(
    publicCaptureAliases(
      card({
        designation: "Sh2-103",
        aliases: ["Sh2-103", "Nébuleuse du Voile"],
      }),
    ),
    "Sh2-103 · Nébuleuse du Voile",
  );
});
