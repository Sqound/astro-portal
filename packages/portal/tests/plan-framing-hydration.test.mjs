import assert from "node:assert/strict";
import test from "node:test";
import {
  dehydratePlanItems,
  hydratePlanItems,
  referencedFramingIds,
} from "../dist/persistence/plan-framing-hydration.js";

test("dehydratePlanItems reduces an item with a framingId to the bare reference and discards anything else the client sent", () => {
  const items = [
    {
      id: "item-1",
      framingId: "framing-1",
      target: {
        id: "framing-1",
        plannerSource: "framing",
        framingId: "framing-1",
        title: "Stale cached title",
        framing: { center: { ra: 1, dec: 2 } },
      },
      startMinute: 60,
    },
    // An item with no framingId is passed through unchanged, legacy relics
    // (target.framing without framingId) included.
    { id: "item-2", targetId: "m31", target: { id: "m31" } },
    { id: "item-3", target: { id: "old", framing: { center: {} } } },
  ];
  assert.deepEqual(dehydratePlanItems(items), [
    {
      id: "item-1",
      framingId: "framing-1",
      target: {
        id: "framing-1",
        plannerSource: "framing",
        framingId: "framing-1",
      },
      startMinute: 60,
    },
    { id: "item-2", targetId: "m31", target: { id: "m31" } },
    { id: "item-3", target: { id: "old", framing: { center: {} } } },
  ]);
});

test("referencedFramingIds collects every distinct framingId, ignoring items with none", () => {
  const items = [
    { id: "a", framingId: "framing-1" },
    { id: "b", framingId: "framing-2" },
    { id: "c", framingId: "framing-1" },
    { id: "d", targetId: "m31" },
    { id: "e", framingId: "" },
  ];
  assert.deepEqual(referencedFramingIds(items), ["framing-1", "framing-2"]);
});

test("hydratePlanItems replaces the bare reference with the framing's own target, name included", () => {
  const items = [
    {
      id: "item-1",
      framingId: "framing-1",
      target: {
        id: "framing-1",
        plannerSource: "framing",
        framingId: "framing-1",
      },
    },
  ];
  const records = new Map([
    [
      "framing-1",
      {
        target: {
          id: "framing-1",
          objects: ["M31"],
          coordinate: { ra: 10, dec: 41 },
          plannerSource: "framing",
        },
        name: "Andromeda wide field",
        revision: 3,
        state: "locked",
      },
    ],
  ]);
  const hydrated = hydratePlanItems(items, records);
  assert.equal(hydrated[0].target.title, "Andromeda wide field");
  assert.equal(hydrated[0].target.designation, "Andromeda wide field");
  assert.equal(hydrated[0].target.framingId, "framing-1");
  assert.equal(hydrated[0].target.framingRevision, 3);
  assert.equal(hydrated[0].target.framingState, "locked");
  assert.deepEqual(hydrated[0].target.coordinate, { ra: 10, dec: 41 });
});

test("hydratePlanItems leaves an item's stored target untouched when its framing is absent from the map (deleted, or legacy relic)", () => {
  const items = [
    {
      id: "item-1",
      framingId: "framing-missing",
      target: {
        id: "framing-missing",
        plannerSource: "framing",
        framingId: "framing-missing",
      },
    },
    { id: "item-2", targetId: "m31", target: { id: "m31" } },
  ];
  assert.deepEqual(hydratePlanItems(items, new Map()), items);
});
