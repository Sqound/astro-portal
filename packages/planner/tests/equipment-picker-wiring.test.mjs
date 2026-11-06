// Where the web's equipment pickers (`EquipmentPicker`) are drawn: every field
// of stage 2, the map's equipment controls and the framing editor's, the
// filters' dialog, « Matériel de l'aperçu » and « Ma configuration par
// défaut »; « Définir mon matériel » once per place, and the return from
// « Mon espace » that picks the piece just declared.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("stage 2 draws one picker per field, the link once under the last, and reads the equipment again on return", () => {
  const page = source("components/PlannerPage.js");
  for (const category of ["telescope", "eyepiece", "camera", "modifier"])
    assert.match(
      page,
      new RegExp(
        `<EquipmentPicker\\s+\\{\\.\\.\\.equipmentPickerProps\\(\\s*"${category}"`,
      ),
      category,
    );
  assert.match(
    page,
    /<EquipmentPicker\s+\{\.\.\.equipmentPickerProps\(\s*"mount",\s*state\.equipment\.mountId \?\? "none",/,
  );
  // « Aucun » and « Aucune » first, outside the groups and the filters.
  assert.match(
    page,
    /\{ id: "none", label: message\(locale, "plannerModifierNone"\) \}/,
  );
  assert.match(
    page,
    /\{ id: "none", label: message\(locale, "plannerMountNone"\) \}/,
  );
  // One « Définir mon matériel » next to « Gérer mon matériel », hidden while
  // a picker shows its own.
  assert.match(
    page,
    /\{defineEquipment && !equipmentSectionNoMatch \? \(\s*<DefineEquipmentLink/,
  );
  assert.ok(
    page.indexOf("<DefineEquipmentLink") < page.indexOf("<EquipmentManageLink"),
  );
  // A visitor of a service with spaces is sent to the sign-in.
  assert.match(
    page,
    /auth\.authenticated \|\| \(auth\.checked && auth\.enabled\)/,
  );
  assert.match(page, /signedIn: Boolean\(auth\.authenticated\)/);
  // The return: `GET /api/equipment` again, each kind to its field.
  assert.match(page, /useEquipmentReturn\(\{/);
  for (const [kind, key] of [
    ["telescope", "telescopeId"],
    ["camera", "cameraId"],
    ["lens", "modifierId"],
    ["mount", "mountId"],
  ])
    assert.match(
      page,
      new RegExp(
        `if \\(forPlan\\.${kind}\\) patch\\.${key} = forPlan\\.${kind};`,
      ),
    );
  assert.match(page, /patch\.eyepieceId = forPlan\.eyepiece;/);
  assert.match(page, /patch\.filterIds = \[\.\.\.filterIds, forPlan\.filter\]/);
  // The framing editor open, its telescope, camera, eyepiece and reducer
  // take what came back, not the plan.
  assert.match(
    page,
    /if \(framingEditorStateRef\.current\) \{\s*const \{ telescope, camera, eyepiece, lens, \.\.\.rest \} = chosen;/,
  );
  assert.match(page, /setFramingEditorReturned\(\{ chosen: editorPieces \}\)/);
  // The map's controls and the framing editor's open the same pickers; the
  // preview's box receives them.
  assert.equal((page.match(/picker: equipmentPickerProps\(/g) || []).length, 4);
  assert.equal(
    (page.match(/picker: editorPickerProps\?\.\(/g) || []).length,
    4,
  );
  assert.match(page, /pickerProps=\{equipmentPickerProps\}/);
  assert.equal(
    (
      page.match(/props: equipmentPickerProps,\s*define: defineEquipment,/g) ||
      []
    ).length,
    2,
  );
  assert.match(page, /define=\{defineEquipment\}/);
  const map = source("components/PlannerNightSkyMap.js");
  assert.match(map, /isOpen && control\.picker \? \(\s*<QuickEquipmentPicker/);
  // The old pickers are gone.
  assert.doesNotMatch(page, /TelescopePicker|EquipmentChoiceOptions/);
  for (const file of [
    "components/TelescopePicker.js",
    "components/EquipmentChoiceOptions.js",
  ])
    assert.equal(
      existsSync(new URL(`../src/${file}`, import.meta.url)),
      false,
      file,
    );
});

test("the filters' dialog: the shared search and « Type », the link just above « Effacer » and « Appliquer »", () => {
  const filters = source("components/FiltersField.js");
  assert.match(filters, /useEquipmentSearch\(\{\s*category: "filter"/);
  assert.match(
    filters,
    /<EquipmentSearchBar locale=\{locale\} category="filter"/,
  );
  const footer = filters.slice(filters.indexOf("footer={"));
  assert.ok(
    footer.indexOf("<DefineEquipmentLink") <
      footer.indexOf("data-filters-clear"),
  );
  assert.ok(
    footer.indexOf("data-filters-clear") < footer.indexOf("data-filters-apply"),
  );
});
