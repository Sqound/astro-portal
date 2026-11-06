import assert from "node:assert/strict";
import test from "node:test";
import { framingFitKey } from "../src/recommendations.js";

// `framing(target, field)` (`planner.js`) returns `fit: "unknown"` in two
// different situations: the target's own apparent size is not known at all,
// or it is known but there is no equipment field to measure it against
// (`occupancy` stays null either way -- see the `framing-fit` fixture's
// "missing-field-returns-unknown" and "missing-size-returns-unknown" cases).
// `framingFitKey` used to treat any fit other than "comfortable"/"tight" as
// a mosaic, so a target with a perfectly well-known size but no resolved
// field read as "Mosaic recommended" instead of "Object size unknown".
const card = (framing) => ({
  target: { id: "m31", plannerSource: "catalogue" },
  framing,
});

test("an unknown fit with a known size is reported as unknown, not as a mosaic", () => {
  assert.equal(
    framingFitKey(card({ fit: "unknown", size: [180, 60], occupancy: null })),
    "plannerFramingUnknown",
  );
});

test("an unknown fit with no known size is still reported as unknown", () => {
  assert.equal(
    framingFitKey(card({ fit: "unknown", size: null, occupancy: null })),
    "plannerFramingUnknown",
  );
});

test("a missing framing fact is reported as unknown", () => {
  assert.equal(
    framingFitKey({ target: { id: "m31" } }),
    "plannerFramingUnknown",
  );
});

test("only a fit of exactly 'mosaic' is reported as a mosaic", () => {
  assert.equal(
    framingFitKey(card({ fit: "mosaic", size: [600, 400], occupancy: 140 })),
    "plannerFramingMosaic",
  );
});

test("a comfortable fit is still reported as comfortable", () => {
  assert.equal(
    framingFitKey(card({ fit: "comfortable", size: [180, 60], occupancy: 20 })),
    "plannerFramingComfortable",
  );
});

test("a tight fit is still reported as tight", () => {
  assert.equal(
    framingFitKey(card({ fit: "tight", size: [180, 60], occupancy: 80 })),
    "plannerFramingTight",
  );
});

test("a saved framing target is reported as saved regardless of its fit", () => {
  assert.equal(
    framingFitKey({
      target: { id: "cygnus", plannerSource: "framing" },
      framing: { fit: "unknown", size: null, occupancy: null },
    }),
    "plannerFramingSaved",
  );
});
