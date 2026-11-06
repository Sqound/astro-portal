// EQUIPMENT-INSTRUMENTS-01: the instruments of « Mon matériel » — a
// telescope, binoculars, a smartphone on a tripod — in the web's planner and
// « Mon espace » → « Matériel ».
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  binocularsProfiles,
  equipmentProfilesFromInventory,
  instrumentProfiles,
  resolveEquipment,
  telescopeProfiles,
  withCommonBinoculars,
} from "../src/planner.js";
import { telescopeSpecLine } from "../src/telescope-picker.js";
import { equipmentKindOrder } from "../src/equipment-search.js";
import {
  binocularsExitPupilMm,
  binocularsTrueFieldDegrees,
  instrumentKindOf,
  migrateBinocularsItem,
} from "portal/equipment/instrument-kind.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { EquipmentEditor } =
  await import("portal/components/equipment/EquipmentEditor.js");
const { equipmentSummary } =
  await import("portal/components/equipment/EquipmentLibrary.js");

const source = JSON.parse(
  await readFile(
    new URL("../src/common-equipment-profiles.json", import.meta.url),
    "utf8",
  ),
);

test("the common binoculars: the first nine configurations, then the later ones, each with its maker's magnification, objective, real field and page", () => {
  const configurations = binocularsProfiles.map(
    (profile) => `${profile.magnification}x${profile.apertureMm}`,
  );
  // EQUIPMENT-CATALOGUE-02: the nine of the first catalogue stay first, the
  // later ones follow; the count is a floor.
  assert.deepEqual(configurations.slice(0, 9), [
    "7x35",
    "7x50",
    "8x42",
    "10x42",
    "10x50",
    "12x50",
    "15x70",
    "20x80",
    "25x100",
  ]);
  assert.ok(configurations.length >= 24);
  for (const profile of binocularsProfiles) {
    assert.equal(profile.kind, "binoculars", profile.id);
    assert.equal(profile.group, "binoculars", profile.id);
    assert.equal(profile.isBinoculars, true, profile.id);
    assert.ok(profile.trueFieldDegrees > 0, profile.id);
    assert.ok(profile.makerPages.length > 0, profile.id);
    // A field the maker gives in metres at 1 000 m is converted, and says so.
    if (profile.calculated)
      assert.match(
        profile.calculation,
        /at 1000 m|1000m|^Estimation : /,
        profile.id,
      );
  }
  // The telescopes' own list is unchanged; the instruments add the binoculars.
  assert.equal(
    instrumentProfiles.length,
    telescopeProfiles.length + binocularsProfiles.length,
  );
  assert.deepEqual(
    instrumentProfiles.slice(telescopeProfiles.length).map((p) => p.id),
    source.binoculars.map((entry) => entry.id),
  );
  assert.equal(source.binoculars.length, binocularsProfiles.length);
  assert.ok(equipmentKindOrder.telescope.includes("binoculars"));
  assert.ok(equipmentKindOrder.telescope.includes("smartphone"));
});

test("the binoculars a list read from the portal predates are added once, by id", () => {
  const list = withCommonBinoculars([
    { id: "t1" },
    { id: "nikon-aculon-a211-10x50" },
  ]);
  assert.equal(list.length, 2 + binocularsProfiles.length - 1);
  assert.equal(
    list.filter((profile) => profile.id === "nikon-aculon-a211-10x50").length,
    1,
  );
});

test("the kind: planner.kind, else the former box « paire de jumelles »; the box is converted", () => {
  assert.equal(instrumentKindOf(null), "telescope");
  assert.equal(instrumentKindOf({ kind: "refractor" }), "telescope");
  assert.equal(instrumentKindOf({ isBinoculars: true }), "binoculars");
  assert.equal(
    instrumentKindOf({ planner: { kind: "smartphone" } }),
    "smartphone",
  );
  const legacy = {
    id: "b",
    type: "telescope",
    name: "Mes 10×50",
    isBinoculars: true,
    planner: { kind: "refractor", maker: "Nikon" },
  };
  assert.deepEqual(migrateBinocularsItem(legacy).planner, {
    kind: "binoculars",
    maker: "Nikon",
  });
  const telescope = { id: "t", type: "telescope", name: "Lunette" };
  assert.equal(migrateBinocularsItem(telescope), telescope);
  assert.equal(binocularsExitPupilMm(50, 10), 5);
  assert.equal(binocularsExitPupilMm(50, 0), null);
  assert.equal(
    binocularsTrueFieldDegrees({ apparentFieldDegrees: 65, magnification: 10 }),
    6.5,
  );
});

test("binoculars carry their eyepieces: the plan's eyepiece and reducer are not applied", () => {
  const resolved = resolveEquipment({
    mode: "visual",
    telescopeId: "nikon-aculon-a211-10x50",
    eyepieceId: "plossl-25",
  });
  assert.equal(resolved.instrumentKind, "binoculars");
  assert.equal(resolved.magnification, 10);
  assert.equal(resolved.exitPupilMm, 5);
  assert.equal(resolved.visualFieldDiameterDegrees, 6.5);
  assert.equal(resolved.name, "Nikon Aculon A211 10×50");
  // A telescope resolves as before, with no kind.
  const telescope = resolveEquipment({
    mode: "visual",
    telescopeId: "skywatcher-skymax-127",
    eyepieceId: "plossl-25",
  });
  assert.equal(telescope.instrumentKind, undefined);
});

test("« Mon matériel »: binoculars without focal length and a smartphone with its camera are instruments", () => {
  const profiles = equipmentProfilesFromInventory([
    {
      id: "b1",
      type: "telescope",
      name: "Jumelles 10×50",
      specifications: {
        apertureMm: 50,
        magnification: 10,
        trueFieldDegrees: 6.5,
      },
      planner: { kind: "binoculars" },
    },
    {
      id: "p1",
      type: "telescope",
      name: "Pixel 9 sur trépied",
      specifications: { focalLengthMm: 6.9, apertureMm: 4.06, focalRatio: 1.7 },
      planner: {
        kind: "smartphone",
        integratedCamera: {
          name: "Grand-angle",
          sensorWidthMm: 9.8,
          sensorHeightMm: 7.4,
        },
        mount: { id: "phone-tripod", name: "Trépied" },
        phone: {
          fieldWidthDegrees: 70.7,
          fieldHeightDegrees: 56.4,
          fNumber: 1.7,
        },
      },
    },
  ]);
  const [binoculars, phone] = profiles.telescopes;
  assert.equal(binoculars.kind, "binoculars");
  assert.equal(binoculars.isBinoculars, true);
  assert.equal(binoculars.focalLengthMm, undefined);
  assert.equal(
    telescopeSpecLine("fr", binoculars),
    "10× · 50 mm · 6,5° · 5 mm",
  );
  assert.equal(phone.kind, "smartphone");
  assert.equal(phone.integratedCamera.sensorWidthMm, 9.8);
  assert.equal(telescopeSpecLine("fr", phone), "71° × 56° · f/1,7");
  assert.equal(
    equipmentSummary(
      {
        type: "telescope",
        specifications: {
          apertureMm: 50,
          magnification: 10,
          trueFieldDegrees: 6.5,
        },
        planner: { kind: "binoculars" },
      },
      "—",
    ),
    "10× · 50 mm · 6.5°",
  );
});

test("the web form: « Type d’instrument » in place of the box, the binoculars' fields, a smartphone shown and editable", () => {
  const render = (selected) =>
    renderToStaticMarkup(
      createElement(EquipmentEditor, {
        locale: "fr",
        selected,
        onSave: async (draft) => draft,
        onClose: () => {},
      }),
    );
  const binoculars = render({
    id: "b1",
    type: "telescope",
    name: "Jumelles 10×50",
    specifications: {
      apertureMm: 50,
      magnification: 10,
      trueFieldDegrees: 6.5,
    },
    planner: { kind: "binoculars" },
  });
  assert.match(binoculars, /Type d’instrument/);
  assert.match(
    binoculars,
    /<option value="binoculars" selected="">Jumelles<\/option>/,
  );
  assert.match(binoculars, /Grossissement/);
  assert.match(binoculars, /Champ réel \(°\)/);
  assert.match(binoculars, /5 mm/);
  assert.doesNotMatch(binoculars, /Cet instrument est une paire de jumelles/);
  assert.doesNotMatch(binoculars, /Télescope intelligent/);
  const phone = render({
    id: "p1",
    type: "telescope",
    name: "iPhone 16 Pro sur trépied",
    specifications: { focalLengthMm: 24.5, focalRatio: 1.78 },
    planner: {
      kind: "smartphone",
      integratedCamera: {
        name: "Grand-angle",
        sensorWidthMm: 34.6,
        sensorHeightMm: 25.9,
      },
      phone: {
        fieldWidthDegrees: 70.4,
        fieldHeightDegrees: 55.8,
        imageWidth: 2016,
        imageHeight: 1512,
        maxExposureSeconds: 0.333,
      },
    },
  });
  assert.match(phone, /Smartphone sur trépied/);
  assert.match(phone, /70° × 56°/);
  assert.match(phone, /2[\s\u202f]016 × 1[\s\u202f]512\u00a0px/);
  assert.match(phone, /1\/3 s/);
  assert.match(phone, /Ajouté par l’application sur le téléphone/);
});
