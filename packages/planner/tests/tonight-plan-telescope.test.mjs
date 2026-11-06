import assert from "node:assert/strict";
import test from "node:test";

import {
  tonightPlanIsVisual,
  tonightPlanTelescope,
} from "planner/tonight-plan-telescope.js";

// What a plan's card of "Cette nuit" writes of its telescope
// and of its type.
const profileSets = {
  telescopes: [{ id: "mine-1", name: "Lunette 80 mm" }],
  commonTelescopes: [{ id: "common-1", name: "Dobson 300" }],
};

test("the telescope of a plan is the name of the element it points at", () => {
  assert.equal(
    tonightPlanTelescope(profileSets, { telescopeId: "mine-1" }),
    "Lunette 80 mm",
  );
  assert.equal(
    tonightPlanTelescope(profileSets, { telescopeId: "common-1" }),
    "Dobson 300",
  );
});

test("no telescope chosen, or one no list holds, is null", () => {
  assert.equal(tonightPlanTelescope(profileSets, { telescopeId: null }), null);
  assert.equal(
    tonightPlanTelescope(profileSets, { telescopeId: "archived-1" }),
    null,
  );
  assert.equal(tonightPlanTelescope(profileSets, {}), null);
  assert.equal(tonightPlanTelescope(profileSets, undefined), null);
});

test("the type of a plan is read from the equipment's mode", () => {
  assert.equal(tonightPlanIsVisual({ mode: "visual" }), true);
  assert.equal(tonightPlanIsVisual({ mode: "imaging" }), false);
  assert.equal(tonightPlanIsVisual(undefined), false);
});
