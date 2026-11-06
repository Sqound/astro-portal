import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { EquipmentEditor } =
  await import("portal/components/equipment/EquipmentEditor.js");
const { equipmentCopyFor, equipmentCopy } =
  await import("portal/components/equipment/equipment-copy.js");
const {
  equipmentToSave,
  integratedMountKind,
  isSmartTelescope,
  withIntegratedCamera,
  withIntegratedMount,
  withSmartTelescope,
} = await import("portal/components/equipment/smart-telescope.js");

// The box « Télescope intelligent
// (caméra et monture intégrées) » of a telescope's form in « Mon matériel »;
// its words are the specified ones, to the character.

const render = (selected) =>
  renderToStaticMarkup(
    createElement(EquipmentEditor, {
      locale: "fr",
      selected,
      onSave: async (item) => item,
      onClose: () => {},
    }),
  );

const lunette = {
  id: "eq-1",
  type: "telescope",
  name: "Lunette 72/432",
  specifications: { apertureMm: 72, focalLengthMm: 432 },
  planner: {},
};
const seestar = {
  id: "eq-2",
  type: "telescope",
  name: "Mon Seestar",
  specifications: { apertureMm: 50, focalLengthMm: 250 },
  planner: {
    integratedCamera: {
      name: "IMX462",
      sensorWidthMm: 5.6,
      sensorHeightMm: 3.2,
      pixelSizeUm: 2.9,
    },
    mount: { id: "integrated-eq", name: "Équatoriale intégrée" },
  },
};

test("the French words of the box, to the character", () => {
  const text = equipmentCopyFor("fr").editor.smart;
  assert.deepEqual(text, {
    label: "Télescope intelligent (caméra et monture intégrées)",
    help: "Seestar, Dwarf, Vespera… : la caméra et la monture sont dans le même boîtier.",
    ticked:
      "Choisi dans un plan, ce télescope apporte sa caméra et sa monture : elles sont choisies pour vous.",
    onPhone: "Le Wi-Fi et la clé restent sur votre téléphone.",
    sensor: "Capteur intégré",
    width: "Largeur (mm)",
    height: "Hauteur (mm)",
    pixels: "Pixels (µm)",
    sensorName: "Nom du capteur",
    mount: "Monture intégrée",
    mountType: "Type de monture intégrée",
    altaz: "Azimutale",
    equatorial: "Équatoriale",
  });
  for (const [locale, copy] of Object.entries(equipmentCopy))
    for (const key of Object.keys(text))
      assert.ok(
        String(copy.editor.smart?.[key] || "").trim(),
        `${locale} editor.smart.${key}`,
      );
});

test("unticked, a telescope's form shows the box and its sentence, no sensor or mount field; another kind has no box", () => {
  const html = render(lunette);
  assert.match(html, /Télescope intelligent \(caméra et monture intégrées\)/);
  assert.match(html, /la caméra et la monture sont dans le même boîtier/);
  assert.doesNotMatch(html, /Capteur intégré/);
  assert.doesNotMatch(html, /Monture intégrée/);
  assert.doesNotMatch(html, /restent sur votre téléphone/);
  // The box comes after the focal ratio and before the notes; the box
  // « paire de jumelles » is gone (EQUIPMENT-INSTRUMENTS-01: the kind of
  // instrument says it).
  assert.ok(
    html.indexOf("Rapport focal") < html.indexOf("Télescope intelligent"),
  );
  assert.ok(
    html.indexOf("Télescope intelligent") < html.indexOf("Notes privées"),
  );
  assert.doesNotMatch(html, /Cet instrument est une paire de jumelles/);
  const camera = render({
    type: "camera",
    name: "Caméra couleur",
    specifications: {},
  });
  assert.doesNotMatch(camera, /Télescope intelligent/);
});

test("ticked, the box opens « Capteur intégré » and « Monture intégrée » with what the item holds", () => {
  const html = render(seestar);
  assert.match(html, /type="checkbox" checked=""/);
  assert.match(html, /elles sont choisies pour vous/);
  // SMART-SCOPE-WIFI-01 (Q8): the Wi-Fi and the key stay on the phone.
  assert.ok(
    html.includes("Le Wi-Fi et la clé restent sur votre téléphone."),
    "on the phone",
  );
  for (const word of [
    "Capteur intégré",
    "Largeur (mm)",
    "Hauteur (mm)",
    "Pixels (µm)",
    "Nom du capteur",
    "Monture intégrée",
    "Azimutale",
    "Équatoriale",
  ])
    assert.ok(html.includes(word), word);
  assert.match(html, /role="radiogroup" aria-label="Type de monture intégrée"/);
  assert.match(html, /value="5.6"/);
  assert.match(html, /value="IMX462"/);
  assert.match(html, /checked="" value="equatorial"/);
  assert.doesNotMatch(html, /checked="" value="altaz"/);
});

test("the box writes the built-in sensor and mount, and an unticked box leaves them out of the saved item", () => {
  assert.equal(isSmartTelescope(lunette), false);
  assert.equal(isSmartTelescope(seestar), true);
  let draft = withSmartTelescope(lunette);
  assert.deepEqual(draft.planner.mount, {
    id: "integrated-altaz",
    name: "Azimutale intégrée",
  });
  draft = withIntegratedCamera(draft, "sensorWidthMm", "11.2");
  draft = withIntegratedCamera(draft, "sensorHeightMm", "6.3");
  draft = withIntegratedCamera(draft, "pixelSizeUm", "");
  draft = withIntegratedCamera(draft, "name", "IMX585");
  draft = withIntegratedMount(draft, "equatorial");
  assert.equal(integratedMountKind(draft), "equatorial");
  assert.deepEqual(equipmentToSave(draft, true).planner, {
    integratedCamera: {
      name: "IMX585",
      sensorWidthMm: 11.2,
      sensorHeightMm: 6.3,
      pixelSizeUm: "",
    },
    mount: { id: "integrated-eq", name: "Équatoriale intégrée" },
  });
  // Unticking hides without erasing; the saved item drops them, and keeps
  // what else its `planner` holds.
  const kept = { ...draft, planner: { ...draft.planner, group: "connected" } };
  assert.deepEqual(equipmentToSave(kept, false).planner, {
    group: "connected",
  });
  assert.deepEqual(withSmartTelescope(draft).planner, draft.planner);
  assert.deepEqual(
    equipmentToSave({ ...draft, type: "camera" }, true).planner,
    {},
  );
});
