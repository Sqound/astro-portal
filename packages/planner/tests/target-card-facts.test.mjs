import assert from "node:assert/strict";
import test from "node:test";
import {
  targetCardFactOrder,
  targetCardVisibleFacts,
} from "../src/recommendations.js";

// The target card's facts follow one order -- shared science facts, then
// logistics, with the suggested-integration duration always last.
// `targetCardVisibleFacts` is the pure "what shows, in what order" the JSX
// render (`PlannerPage.js`'s `TargetCard`) is built from, kept apart from
// formatting so it is testable without rendering anything.

function summary(overrides = {}) {
  return {
    savedFramingCoordinate: null,
    visualStatus: "suitable",
    magnification: null,
    exitPupilMm: null,
    horizonNote: null,
    moonNote: null,
    showSuggestedFilter: false,
    ...overrides,
  };
}

test("targetCardFactOrder lists every fact exactly once, in the card's order", () => {
  assert.deepEqual(targetCardFactOrder, [
    "window",
    "framingCenter",
    "culmination",
    "visual",
    "magnification",
    "exitPupil",
    "direction",
    "horizonNote",
    "moonNote",
    "suggestedFilter",
    "framing",
    "suggestedIntegration",
  ]);
  assert.equal(new Set(targetCardFactOrder).size, targetCardFactOrder.length);
});

test("a bare visual card only shows the always-on facts, culmination with no trailing text", () => {
  assert.deepEqual(targetCardVisibleFacts(summary()), [
    "window",
    "culmination",
    "visual",
    "direction",
    "framing",
  ]);
});

test("a visual card with magnification and exit pupil shows both right after the visual estimate", () => {
  const facts = targetCardVisibleFacts(
    summary({ magnification: 120, exitPupilMm: 4.2 }),
  );
  assert.deepEqual(facts, [
    "window",
    "culmination",
    "visual",
    "magnification",
    "exitPupil",
    "direction",
    "framing",
  ]);
});

test("an imaging-only card (visual status not-applicable) trades the visual group for suggested integration, moved to the very end", () => {
  const facts = targetCardVisibleFacts(
    summary({ visualStatus: "not-applicable" }),
  );
  assert.deepEqual(facts, [
    "window",
    "culmination",
    "direction",
    "framing",
    "suggestedIntegration",
  ]);
});

test("suggested integration never appears next to the visual facts, even when both a magnification and an exit pupil would otherwise show", () => {
  // Guards the exact regression: the web used to render suggested integration
  // in the same slot as the visual group (right after culmination) instead of
  // trailing every other fact
  const imaging = targetCardVisibleFacts(
    summary({
      visualStatus: "not-applicable",
      magnification: 120,
      exitPupilMm: 4.2,
    }),
  );
  assert.ok(!imaging.includes("magnification"));
  assert.ok(!imaging.includes("exitPupil"));
  assert.equal(imaging.at(-1), "suggestedIntegration");
});

test("logistics facts (horizon note, Moon note, suggested filter) sit between direction and framing regardless of card type", () => {
  const visualFacts = targetCardVisibleFacts(
    summary({
      horizonNote: {
        initiallyBlocked: true,
        clearTime: "2026-09-20T20:00:00Z",
      },
      moonNote: { moonSeparationMinimum: 30 },
      showSuggestedFilter: true,
    }),
  );
  assert.deepEqual(visualFacts, [
    "window",
    "culmination",
    "visual",
    "direction",
    "horizonNote",
    "moonNote",
    "suggestedFilter",
    "framing",
  ]);

  const imagingFacts = targetCardVisibleFacts(
    summary({
      visualStatus: "not-applicable",
      horizonNote: { initiallyBlocked: false, clearTime: null },
      moonNote: { moonSeparationMinimum: 30 },
      showSuggestedFilter: true,
    }),
  );
  assert.deepEqual(imagingFacts, [
    "window",
    "culmination",
    "direction",
    "horizonNote",
    "moonNote",
    "suggestedFilter",
    "framing",
    "suggestedIntegration",
  ]);
});

test("a saved framing target shows the framing-centre fact right after the window, before culmination", () => {
  const facts = targetCardVisibleFacts(
    summary({ savedFramingCoordinate: { ra: 83.633, dec: 22.0145 } }),
  );
  assert.deepEqual(facts, [
    "window",
    "framingCenter",
    "culmination",
    "visual",
    "direction",
    "framing",
  ]);
});
