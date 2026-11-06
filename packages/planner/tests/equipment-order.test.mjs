import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  equipmentProfilesFromInventory,
  resolveEquipment,
} from "planner/planner.js";
import { integratedMountName } from "planner/telescope-picker.js";

// Stage 2 of the web planner in this order — Photo / Visuel, Télescope, Caméra
// (or Oculaire), Réducteur / Barlow, Filtres, Monture — and a smart telescope
// of "Mon matériel" brings its built-in camera and mount. The page is read as a
// source, as `planner-stage-order.test.mjs` does.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/components/PlannerPage.js");
const dist = read("../dist/components/PlannerPage.js");

const stageOf = (text) => {
  const start = text.indexOf("planner-flow-stage planner-equipment-stage");
  const end = text.indexOf("planner-flow-stage planner-constraints-stage");
  assert.ok(start >= 0 && end > start);
  return text.slice(start, end);
};
const at = (text, needle, from = 0) => {
  const index = text.indexOf(needle, from);
  assert.ok(index >= 0, `expected ${needle}`);
  return index;
};

test("stage 2 lists the telescope first, then the camera or eyepiece, the reducer, the filters, the mount last; the wind tolerance is no longer in stage 2", () => {
  for (const text of [source, dist]) {
    const stage = stageOf(text);
    const mode = at(stage, '"plannerObservationMode"');
    const telescope = at(stage, '"plannerTelescope"');
    const eyepiece = at(stage, '"plannerEyepiece"');
    const camera = at(stage, '"plannerCamera"');
    const modifier = at(stage, '"plannerOpticalModifier"');
    const filters = at(stage, "<FiltersField");
    const mount = at(stage, "!connectedTelescope && mountChoicesShown");
    assert.ok(mode < telescope, "Photo / Visuel above the telescope");
    assert.ok(telescope < eyepiece && eyepiece < camera);
    assert.ok(camera < modifier, "the camera before the reducer");
    assert.ok(modifier < filters, "the reducer before the filters");
    assert.ok(filters < mount, "the mount after the filters");
    assert.ok(
      !stage.includes("<WindTolerance") && !stage.includes("WindTolerance,"),
      "the wind tolerance is a row of stage 3",
    );
  }
});

test("a smart telescope's built-in mount sits under it, with its built-in camera, before the reducer", () => {
  const stage = stageOf(source);
  const camera = at(stage, "integratedCameraLine(");
  const integratedMount = at(stage, "integratedMountName(");
  const modifier = at(stage, '"plannerOpticalModifier"');
  assert.ok(at(stage, '"plannerTelescope"') < camera);
  assert.ok(camera < integratedMount && integratedMount < modifier);
  // Behind a smart telescope the reducer leaves the sheet too.
  assert.match(
    stage,
    /\{!connectedTelescope && \(\s*<fieldset[^>]*>\s*<legend>\s*\{message\(locale, "plannerOpticalModifier"\)\}/,
  );
  // The mount picker is never drawn for a smart telescope.
  assert.match(stage, /\{!connectedTelescope && mountChoicesShown && \(/);
  assert.match(
    stage,
    /\{connectedTelescope && \(\s*<fieldset[^>]*planner-mount-group/,
  );
});

test("a smart item of « Mon matériel » resolves to its built-in camera and names its built-in mount", () => {
  const profiles = equipmentProfilesFromInventory([
    {
      id: "smart-1",
      type: "telescope",
      name: "Mon Seestar",
      specifications: { apertureMm: 50, focalLengthMm: 250 },
      planner: {
        integratedCamera: {
          name: "IMX462",
          sensorWidthMm: 5.6,
          sensorHeightMm: 3.2,
        },
        mount: { id: "integrated-eq", name: "Équatoriale intégrée" },
      },
    },
    {
      id: "camera-1",
      type: "camera",
      name: "Caméra couleur",
      specifications: { sensorWidthMm: 23.5, sensorHeightMm: 15.7 },
    },
  ]);
  const [smart] = profiles.telescopes;
  assert.equal(smart.integratedCamera.name, "IMX462");
  const equipment = resolveEquipment(
    { telescopeId: "smart-1", cameraId: "camera-1", modifierId: "none" },
    profiles,
  );
  assert.equal(equipment.name, "Mon Seestar · IMX462");
  assert.equal(equipment.sensorWidthMm, 5.6);
  // A Barlow the plan still names is not applied behind it.
  const barlow = resolveEquipment(
    {
      telescopeId: "smart-1",
      modifierId: "barlow",
    },
    profiles,
  );
  assert.equal(barlow.focalLengthMm, 250);
  assert.equal(barlow.name, "Mon Seestar · IMX462");
  assert.equal(integratedMountName("fr", smart), "Équatoriale intégrée");
  assert.equal(integratedMountName("en", smart), "Built-in equatorial");
  assert.equal(
    integratedMountName("fr", { ...smart, mount: undefined }),
    "Azimutale intégrée",
  );
});
