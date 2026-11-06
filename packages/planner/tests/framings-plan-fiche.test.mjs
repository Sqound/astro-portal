import assert from "node:assert/strict";
import test from "node:test";
import {
  framingMosaicSurface,
  framingPlanEquipmentDiffers,
  framingPlanMosaicGrid,
  framingReferenceEquipment,
  isSurfaceMosaicFraming,
} from "../src/framings.js";

// The web target's own framing fiche (`FramingPlanFiche`, `PlannerPage.js`) is
// built on these pure functions -- tested here as plain data-in/data-out.

const simpleTarget = (equipment) => ({
  framing: { center: { ra: 10, dec: 20 }, equipment: equipment || null },
});

const mosaicTarget = (surface, equipment) => ({
  framing: {
    center: { ra: 10, dec: 20 },
    mosaic: surface,
    equipment: equipment || null,
  },
});

const referenceEquipment = (overrides = {}) => ({
  schemaVersion: 1,
  mode: "imaging",
  telescope: { id: "newton-200-800", name: "Newton 200/800" },
  camera: { id: "asi2600mc", name: "ASI2600MC" },
  ...overrides,
});

test("framingReferenceEquipment reads target.framing.equipment, null when absent", () => {
  const equipment = referenceEquipment();
  assert.deepEqual(
    framingReferenceEquipment(simpleTarget(equipment)),
    equipment,
  );
  assert.equal(framingReferenceEquipment(simpleTarget(null)), null);
  assert.equal(framingReferenceEquipment({}), null);
});

test("framingMosaicSurface requires all three surface fields, else null", () => {
  const surface = { widthDegrees: 2, heightDegrees: 1.5, overlapPercent: 10 };
  assert.deepEqual(framingMosaicSurface(mosaicTarget(surface)), surface);
  assert.equal(
    framingMosaicSurface(mosaicTarget({ widthDegrees: 2 })),
    null,
    "a pre-A2 shape (missing overlap/height) is tolerated as absent, not guessed at",
  );
  assert.equal(framingMosaicSurface(simpleTarget()), null);
});

test("isSurfaceMosaicFraming mirrors framingMosaicSurface", () => {
  const surface = { widthDegrees: 2, heightDegrees: 1.5, overlapPercent: 10 };
  assert.equal(isSurfaceMosaicFraming(mosaicTarget(surface)), true);
  assert.equal(isSurfaceMosaicFraming(simpleTarget()), false);
});

test("framingPlanMosaicGrid recomputes the panel grid with the plan's own field", () => {
  const surface = { widthDegrees: 4, heightDegrees: 2, overlapPercent: 0 };
  const grid = framingPlanMosaicGrid(mosaicTarget(surface), {
    width: 2,
    height: 2,
  });
  assert.equal(grid.columns, 2);
  assert.equal(grid.rows, 1);
});

test("framingPlanMosaicGrid is null for a simple framing or an unknown plan field", () => {
  assert.equal(
    framingPlanMosaicGrid(simpleTarget(), { width: 2, height: 2 }),
    null,
  );
  const surface = { widthDegrees: 4, heightDegrees: 2, overlapPercent: 0 };
  assert.equal(framingPlanMosaicGrid(mosaicTarget(surface), null), null);
});

test("framingPlanEquipmentDiffers is false for a mosaic framing (its grid recompute already accounts for a different telescope)", () => {
  const surface = { widthDegrees: 4, heightDegrees: 2, overlapPercent: 0 };
  const target = mosaicTarget(surface, referenceEquipment());
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "imaging",
      telescopeId: "other-scope",
      cameraId: "other-camera",
    }),
    false,
  );
});

test("framingPlanEquipmentDiffers is false when no reference equipment was recorded", () => {
  assert.equal(
    framingPlanEquipmentDiffers(simpleTarget(null), {
      mode: "imaging",
      telescopeId: "newton-200-800",
      cameraId: "asi2600mc",
    }),
    false,
  );
});

test("framingPlanEquipmentDiffers compares mode, telescope and the mode-specific accessory", () => {
  const target = simpleTarget(referenceEquipment());
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "imaging",
      telescopeId: "newton-200-800",
      cameraId: "asi2600mc",
    }),
    false,
    "identical plan equipment: no warning",
  );
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "visual",
      telescopeId: "newton-200-800",
      eyepieceId: "whatever",
    }),
    true,
    "mode differs",
  );
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "imaging",
      telescopeId: "lunette-72-420",
      cameraId: "asi2600mc",
    }),
    true,
    "telescope differs",
  );
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "imaging",
      telescopeId: "newton-200-800",
      cameraId: "asi533mc",
    }),
    true,
    "camera differs",
  );
});

test("framingPlanEquipmentDiffers reads the eyepiece, not the camera, in visual mode", () => {
  const target = simpleTarget(
    referenceEquipment({
      mode: "visual",
      camera: undefined,
      eyepiece: { id: "ep-24mm", name: "24mm" },
    }),
  );
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "visual",
      telescopeId: "newton-200-800",
      eyepieceId: "ep-24mm",
    }),
    false,
  );
  assert.equal(
    framingPlanEquipmentDiffers(target, {
      mode: "visual",
      telescopeId: "newton-200-800",
      eyepieceId: "ep-10mm",
    }),
    true,
  );
});
