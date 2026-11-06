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
const { FINDER_VALUES, finderOf, withFinder } =
  await import("portal/components/equipment/finder.js");
const { equipmentToSave } =
  await import("portal/components/equipment/smart-telescope.js");

// AXIS-CALIBRATION-FINDER-01 (AXF-3, Q1): « Chercheur » of a
// telescope's form in « Mon espace » → « Matériel », the same field and words
// as the application's « Mon matériel » (`planner.finder`).

const render = (selected) =>
  renderToStaticMarkup(
    createElement(EquipmentEditor, {
      locale: "fr",
      selected,
      onSave: async (item) => item,
      onClose: () => {},
    }),
  );

const lunette = (planner = {}) => ({
  id: "eq-1",
  type: "telescope",
  name: "Lunette 80/900",
  specifications: { apertureMm: 80, focalLengthMm: 900 },
  planner,
});

test("the French words of the line, to the character, and every language", () => {
  const text = equipmentCopyFor("fr").editor.finder;
  assert.deepEqual(text, {
    label: "Chercheur",
    unspecified: "Non précisé",
    aligned: "Aligné sur le tube",
    none: "Aucun",
    help: "Sert à « Calibrer l’axe » : sans chercheur, l’app conseille et aide à chercher.",
  });
  for (const [locale, copy] of Object.entries(equipmentCopy))
    for (const key of Object.keys(text))
      assert.ok(
        String(copy.editor.finder?.[key] || "").trim(),
        `${locale} editor.finder.${key}`,
      );
});

test("a telescope's form shows « Chercheur » with its three choices, between the focal ratio and the smart box", () => {
  const html = render(lunette());
  for (const word of [
    "Chercheur",
    "Non précisé",
    "Aligné sur le tube",
    "Aucun",
  ])
    assert.ok(html.includes(word), word);
  assert.ok(html.indexOf("Rapport focal") < html.indexOf("Chercheur"));
  assert.ok(html.indexOf("Chercheur") < html.indexOf("Télescope intelligent"));
  // Nothing said: « Non précisé » is the one chosen.
  assert.match(
    html,
    /<label class="is-active"><input type="radio" name="telescope-finder" checked="" value=""/,
  );
  const aligned = render(lunette({ finder: "aligned" }));
  assert.match(
    aligned,
    /<label class="is-active"><input type="radio" name="telescope-finder" checked="" value="aligned"/,
  );
});

test("a smart telescope and the other kinds have no « Chercheur »", () => {
  const smart = render(
    lunette({
      integratedCamera: {
        name: "IMX462",
        sensorWidthMm: 5.6,
        sensorHeightMm: 3.2,
      },
      mount: { id: "integrated-eq", name: "Équatoriale intégrée" },
    }),
  );
  assert.doesNotMatch(smart, /telescope-finder/);
  const camera = render({ type: "camera", name: "Caméra", specifications: {} });
  assert.doesNotMatch(camera, /telescope-finder/);
});

test("the value: `aligned`, `none`, or left out for « Non précisé »", () => {
  assert.deepEqual(FINDER_VALUES, ["", "aligned", "none"]);
  assert.equal(finderOf(lunette()), "");
  assert.equal(finderOf(lunette({ finder: "none" })), "none");
  assert.equal(finderOf(lunette({ finder: "other" })), "");
  const none = withFinder(lunette({ maker: "Sky-Watcher" }), "none");
  assert.deepEqual(none.planner, { maker: "Sky-Watcher", finder: "none" });
  const cleared = withFinder(none, "");
  assert.deepEqual(cleared.planner, { maker: "Sky-Watcher" });
  // Saved as it is (a telescope that is not smart keeps its `planner`).
  assert.equal(equipmentToSave(none, false).planner.finder, "none");
});
