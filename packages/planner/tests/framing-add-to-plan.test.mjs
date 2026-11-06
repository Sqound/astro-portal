import assert from "node:assert/strict";
import test from "node:test";
import { plannedPlanItem } from "../src/recommendations.js";
import { frozenPlanTarget } from "../src/framings.js";

// Adding an existing framing to a plan, on the web: the generic
// "Add to plan" path (`plannedPlanItem`, used by every card type -- the
// dedicated `addFramingReferenceToPlan`/`commitFramingEditor` paths in
// `PlannerPage.js` are a different story, already tested by hand) used to
// silently drop a saved framing's `framingId` on both the item and its
// frozen target, so a framing added this way (from the "Framings" catalogue
// tab, or a framing suggested a second time on another night) would never
// again show its framing state (lock icon, plan fiche) and, once the plan
// reloaded, the server would treat it as an unhydrated framing
// (`packages/portal/src/persistence/plan-framing-hydration.js` keys off
// `item.framingId`, not `item.target.framingId`).

const night = { start: "2026-09-25T00:00:00.000Z" };

const framingTarget = () => ({
  id: "f1",
  source: "framing:f1",
  designation: "Simple Test Field",
  title: "Simple Test Field",
  objects: [],
  coordinate: { ra: 10, dec: 20 },
  catalogue: "Framing",
  plannerSource: "framing",
  framingId: "f1",
  framingRevision: 3,
  framingState: "shared",
  framing: { center: { ra: 10, dec: 20 }, field: { width: 1, height: 1 } },
});

const cardFor = (target) => ({
  target,
  usableStart: "2026-09-25T01:00:00.000Z",
  usableEnd: "2026-09-25T02:00:00.000Z",
  filter: "",
});

test("frozenPlanTarget preserves framingId/framingRevision/framingState when present", () => {
  const frozen = frozenPlanTarget(framingTarget());
  assert.equal(frozen.framingId, "f1");
  assert.equal(frozen.framingRevision, 3);
  assert.equal(frozen.framingState, "shared");
});

test("frozenPlanTarget adds no framing fields for an ordinary catalogue target", () => {
  const frozen = frozenPlanTarget({
    id: "m31",
    coordinate: { ra: 10, dec: 41 },
    plannerSource: "catalogue",
  });
  assert.equal(Object.hasOwn(frozen, "framingId"), false);
  assert.equal(Object.hasOwn(frozen, "framingRevision"), false);
  assert.equal(Object.hasOwn(frozen, "framingState"), false);
});

test("plannedPlanItem carries the framingId onto the item itself, not only its frozen target", () => {
  const item = plannedPlanItem({ card: cardFor(framingTarget()), night });
  assert.equal(item.framingId, "f1");
  assert.equal(item.target.framingId, "f1");
});

test("plannedPlanItem adds no framingId for an ordinary catalogue target", () => {
  const item = plannedPlanItem({
    card: cardFor({
      id: "m31",
      coordinate: { ra: 10, dec: 41 },
      plannerSource: "catalogue",
    }),
    night,
  });
  assert.equal(Object.hasOwn(item, "framingId"), false);
});
