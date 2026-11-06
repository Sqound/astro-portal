// A guide scope of « Mon matériel » (`type: guide-scope`, made on the
// phone) in the web planner: never a telescope, a camera or binoculars of
// the pickers, so never an instrument of the visual rule nor of the
// suggestions. The mobile client tests the same rule.
import assert from "node:assert/strict";
import test from "node:test";
import { equipmentProfilesFromInventory } from "planner/planner.js";
import {
  observingBinoculars,
  visualInstrumentFor,
} from "../src/tonight-suggestions-mode.js";

const guideScope = {
  id: "guide-1",
  type: "guide-scope",
  name: "Lunette guide 50/200",
  specifications: { apertureMm: 50, focalLengthMm: 200 },
  planner: {
    guideScope: {
      telescopeId: "newton",
      placement: "guide",
      camera: {
        name: "ZWO ASI120MM Mini",
        pixelSizeUm: 3.75,
        widthPx: 1280,
        heightPx: 960,
        sensor: "mono",
      },
      protocol: "alpaca",
      method: "rings",
      exposureSeconds: 2,
      binning: 1,
    },
  },
};

const newton = {
  id: "newton",
  type: "telescope",
  name: "Newton 150/750",
  specifications: { apertureMm: 150, focalLengthMm: 750 },
};

test("a guide scope is no instrument of the pickers", () => {
  const alone = equipmentProfilesFromInventory([guideScope]);
  assert.deepEqual(alone.telescopes, []);
  assert.deepEqual(alone.cameras, []);
  assert.deepEqual(alone.eyepieces, []);
  const both = equipmentProfilesFromInventory([newton, guideScope]);
  assert.deepEqual(
    both.telescopes.map((profile) => profile.id),
    ["newton"],
  );
  assert.deepEqual(both.cameras, []);
});

test("the visual rule never reads a guide scope", () => {
  const { telescopes } = equipmentProfilesFromInventory([newton, guideScope]);
  // No binoculars of « Mon matériel »: the generic 7×50 stands in.
  assert.equal(observingBinoculars(telescopes).id, observingBinoculars([]).id);
  // Even handed the raw item, it is not binoculars.
  assert.equal(
    observingBinoculars([guideScope]).id,
    observingBinoculars([]).id,
  );
  const m13 = {
    id: "m13",
    integratedMagnitude: 5.8,
    apparentSizeArcmin: 16.5,
  };
  assert.equal(
    visualInstrumentFor(m13, null, observingBinoculars(telescopes)),
    visualInstrumentFor(m13, null),
  );
});
