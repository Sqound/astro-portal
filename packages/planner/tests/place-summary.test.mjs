import assert from "node:assert/strict";
import test from "node:test";
import { nightDateLabel } from "portal/planner/state.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import {
  foldedPlaceSummary,
  placeSummaryLabel,
  placeSummaryLabelLimit,
} from "../src/place-summary.js";

test("a named place gives name, night and horizon", () => {
  assert.equal(
    foldedPlaceSummary({
      dateLabel: "Nuit du 16 au 17 septembre 2026",
      placeLabel: placeSummaryLabel({ name: "Plateau de Calern" }),
      horizonLabel: "Horizon enregistré",
      noPlaceLabel: "Choisissez un lieu",
    }),
    "Plateau de Calern · Nuit du 16 au 17 septembre 2026 · Horizon enregistré",
  );
});

test("no place falls back to the open stage's own invitation", () => {
  assert.equal(
    foldedPlaceSummary({
      dateLabel: "Nuit du 16 au 17 septembre 2026",
      placeLabel: "",
      horizonLabel: "Horizon dégagé",
      noPlaceLabel: "Choisissez un lieu",
    }),
    "Choisissez un lieu · Nuit du 16 au 17 septembre 2026",
    "an absent place has no horizon to describe either",
  );
});

test("the place label prefers the name, then the locality, then coordinates", () => {
  assert.equal(
    placeSummaryLabel({
      name: "Pic Sirius",
      locality: "Val-Imaginaire",
      coordinates: "44,34°, 6,80°",
    }),
    "Pic Sirius",
  );
  assert.equal(
    placeSummaryLabel({
      name: "   ",
      locality: "Val-Imaginaire",
      coordinates: "44,34°, 6,80°",
    }),
    "Val-Imaginaire",
  );
  assert.equal(
    placeSummaryLabel({ coordinates: "44,34°, 6,80°" }),
    "44,34°, 6,80°",
  );
  assert.equal(placeSummaryLabel(), "", "nothing known yet");
});

test("a pathological name is cut short rather than taking the line over", () => {
  const long = "A".repeat(placeSummaryLabelLimit + 40);
  const label = placeSummaryLabel({ name: long });
  assert.equal(label.length, placeSummaryLabelLimit + 1);
  assert.ok(label.endsWith("…"));
  assert.equal(
    placeSummaryLabel({ name: "A".repeat(placeSummaryLabelLimit) }).length,
    placeSummaryLabelLimit,
    "exactly at the limit is left whole",
  );
});

test("the horizon fragment comes from the shared flow catalogue", () => {
  // Two keys, in the three locales the portal ships.
  for (const [locale, saved, clear] of [
    ["en", flow("en", "horizonSaved"), flow("en", "horizonClear")],
    ["fr", flow("fr", "horizonSaved"), flow("fr", "horizonClear")],
    ["ja", flow("ja", "horizonSaved"), flow("ja", "horizonClear")],
  ]) {
    assert.ok(saved && clear, `${locale} carries both horizon fragments`);
    assert.notEqual(saved, clear);
    const line = foldedPlaceSummary({
      dateLabel: nightDateLabel("2026-09-16", locale),
      placeLabel: "Plateau de Calern",
      horizonLabel: saved,
    });
    assert.ok(line.endsWith(saved));
    assert.equal(line.split(" · ").length, 3);
  }
});

test("every locale composes three readable fragments", () => {
  for (const locale of ["en", "fr", "ja"]) {
    const line = foldedPlaceSummary({
      dateLabel: nightDateLabel("2026-09-16", locale),
      placeLabel: placeSummaryLabel({ coordinates: "45,00°, 5,00°" }),
      horizonLabel: flow(locale, "horizonClear"),
      noPlaceLabel: flow(locale, "noPlace"),
    });
    assert.ok(line.includes("45,00°, 5,00°"));
    assert.ok(line.startsWith("45,00°, 5,00°"));
    assert.ok(line.endsWith(flow(locale, "horizonClear")));
    assert.ok(line.includes(nightDateLabel("2026-09-16", locale)));
  }
});

test("missing fragments never leave a dangling separator", () => {
  assert.equal(
    foldedPlaceSummary({ dateLabel: "", placeLabel: "Plateau de Calern" }),
    "Plateau de Calern",
  );
  assert.equal(foldedPlaceSummary(), "");
});
