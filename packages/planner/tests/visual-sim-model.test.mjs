// The visual model (structure and filling factor, filters,
// best pair, generic profiles), the photo advice, and the coherence of the
// suggestions with the preview, on the reference case (NGC 6960, Newton 250/1200,
// Plössl 10 mm, UHC, Bortle 1).
import assert from "node:assert/strict";
import test from "node:test";
import {
  eyepieceProfiles,
  planNight,
  resolveEquipment,
  visualSuitability,
} from "../src/planner.js";
import { recommendedFilterFamilies } from "../src/filters.js";
import {
  visualFilterGain,
  visualTargetStructure,
} from "../src/visual-model.js";
import {
  genericVisualEyepieces,
  genericVisualFilters,
  visualBestPair,
  visualBestPairText,
} from "../src/visual-pairs.js";
import { photoAdvice } from "../src/photo-advice.js";
import { targetPreviewVisibility } from "../src/target-preview.js";
import { visualSuggestionMalus } from "../src/suggestion-ranking.js";
import common from "../src/common-equipment-profiles.json" with { type: "json" };

const veil = {
  id: "openngc-ngc6960",
  source: "NGC 6960",
  designation: "NGC 6960",
  coordinate: { ra: 20.7662 * 15, dec: 30.5951 },
  integratedMagnitude: 7,
  apparentSizeArcmin: [210, 160],
  skyTarget: { typeKey: "Rémanent de supernova" },
  tags: [],
};
const uhc = { id: "own-uhc", name: "UHC", family: "uhc" };
const sets = {
  telescopes: common.telescopes,
  eyepieces: common.eyepieces,
  filters: [uhc],
};
const newton = (eyepieceId, filterIds = ["own-uhc"]) =>
  resolveEquipment(
    {
      mode: "visual",
      telescopeId: "skywatcher-newton-250-1200",
      eyepieceId,
      filterIds,
    },
    sets,
  );
const eyepiece = (id) => eyepieceProfiles.find((profile) => profile.id === id);
const bortle1 = { bortleClass: 1 };

test("structure: the Veil's ellipse is filamentary, M42 and M31 concentrated, a galaxy diffuse", () => {
  assert.deepEqual(visualTargetStructure(veil), {
    structureClass: "filamentary",
    fillingFactor: 0.1,
  });
  assert.deepEqual(
    visualTargetStructure({
      id: "openngc-ngc1976",
      skyTarget: { typeKey: "Nébuleuse en émission" },
    }),
    { structureClass: "concentrated", fillingFactor: 0.3 },
  );
  assert.equal(
    visualTargetStructure({ designation: "M31" }).structureClass,
    "concentrated",
  );
  assert.deepEqual(
    visualTargetStructure({ skyTarget: { typeKey: "Galaxie" } }),
    { structureClass: "diffuse", fillingFactor: 1 },
  );
  // Any remnant without its own entry: the class's factor.
  assert.equal(
    visualTargetStructure({ skyTarget: { typeKey: "Rémanent de supernova" } })
      .fillingFactor,
    0.15,
  );
  // A target's own fields win over the table and the type.
  assert.deepEqual(
    visualTargetStructure({
      ...veil,
      structureClass: "diffuse",
      fillingFactor: 0.5,
    }),
    { structureClass: "diffuse", fillingFactor: 0.5 },
  );
});

test("filters: a gain on emission objects, a loss on galaxies and clusters", () => {
  assert.equal(visualFilterGain(veil, "oiii"), 2);
  assert.equal(visualFilterGain(veil, "uhc"), 1.5);
  assert.equal(visualFilterGain(veil, null), 0);
  assert.ok(
    visualFilterGain({ skyTarget: { typeKey: "Galaxie" } }, "oiii") < 0,
  );
  assert.ok(
    visualFilterGain({ skyTarget: { typeKey: "Amas globulaire" } }, "uhc") < 0,
  );
  assert.equal(visualFilterGain({ designation: "NGC 1499" }, "hb"), 1.5);
  // The advice follows the gains: OIII first on a remnant.
  assert.deepEqual(recommendedFilterFamilies(veil, "visual"), ["oiii", "uhc"]);
  assert.deepEqual(
    recommendedFilterFamilies(
      { skyTarget: { typeKey: "Nébuleuse en émission" } },
      "visual",
    ),
    ["uhc", "oiii", "hb"],
  );
  assert.deepEqual(
    recommendedFilterFamilies(
      {
        designation: "NGC 1499",
        skyTarget: { typeKey: "Nébuleuse en émission" },
      },
      "visual",
    ),
    ["hb", "uhc"],
  );
});

test("the verdict: the UHC of the reference case now counts, a filter that dims is taken off", () => {
  const withUhc = visualSuitability(
    veil,
    newton("plossl-10"),
    undefined,
    bortle1,
  );
  const without = visualSuitability(
    veil,
    newton("plossl-10", []),
    undefined,
    bortle1,
  );
  assert.equal(withUhc.filterFamily, "uhc");
  assert.equal(withUhc.filterGain, 1.5);
  assert.ok(
    Math.abs(withUhc.magnitudeMargin - without.magnitudeMargin - 1.5) < 1e-9,
  );
  // Positive but under one magnitude: a filamentary target stays difficult.
  assert.equal(withUhc.status, "difficult");
  assert.ok(withUhc.magnitudeMargin > 0);
  assert.equal(
    visualSuitability(veil, newton("plossl-32"), undefined, bortle1).status,
    "suitable",
  );
  const galaxy = visualSuitability(
    {
      designation: "M51",
      integratedMagnitude: 8.4,
      apparentSizeArcmin: [13.7, 11.7],
      skyTarget: { typeKey: "Galaxie" },
    },
    newton("plossl-10"),
    undefined,
    { bortleClass: 4 },
  );
  assert.equal(galaxy.filterFamily, null);
  assert.equal(galaxy.filterGain, 0);
});

test("the generic profiles: Plössl 32, 25 and 10 mm, OIII, UHC and Hβ", () => {
  assert.deepEqual(
    genericVisualEyepieces.map((entry) => [entry.focalLengthMm, entry.generic]),
    [
      [32, true],
      [25, true],
      [10, true],
    ],
  );
  assert.deepEqual(
    genericVisualFilters.map((entry) => entry.family),
    ["oiii", "uhc", "hb"],
  );
  assert.ok(genericVisualFilters.every((entry) => entry.generic === true));
});

test("the best pair: « Mon matériel » first, the generic profiles only when it shows nothing", () => {
  const owned = visualBestPair({
    target: veil,
    profile: newton("plossl-10"),
    eyepieces: [eyepiece("plossl-10"), eyepiece("plossl-32")],
    filters: [uhc],
    sky: bortle1,
  });
  assert.equal(owned.chosen.status, "difficult");
  assert.equal(owned.best.eyepiece.focalLengthMm, 32);
  assert.equal(owned.best.filter.family, "uhc");
  assert.equal(owned.best.generic, false);
  assert.equal(owned.advice.key, "eyepiece");
  assert.equal(visualBestPairText("fr", owned.advice), "Visible au 32 mm");

  const generic = visualBestPair({
    target: veil,
    profile: newton("plossl-10", []),
    eyepieces: [eyepiece("plossl-10")],
    filters: [],
    sky: bortle1,
  });
  assert.equal(generic.own.status, "difficult");
  assert.equal(generic.best.status, "suitable");
  assert.equal(generic.best.generic, true);
  assert.equal(generic.best.filter.family, "oiii");
  assert.equal(
    visualBestPairText("fr", generic.advice),
    "Visible avec un filtre OIII",
  );

  const kept = visualBestPair({
    target: veil,
    profile: newton("plossl-10", []),
    eyepieces: [],
    filters: [],
    sky: { bortleClass: 4 },
    generic: false,
  });
  assert.equal(kept.advice.key, "chosen");
  assert.equal(visualBestPairText("fr", kept.advice), null);
});

test("photo advice: the planche's ranges, the filter by sensor, « Mon matériel » first", () => {
  const camera = common.cameras.find(
    (entry) => entry.id === "zwo-asi2600mc-pro",
  );
  const profile = resolveEquipment(
    {
      mode: "imaging",
      telescopeId: "skywatcher-newton-250-1200",
      cameraId: camera.id,
    },
    { telescopes: common.telescopes, cameras: common.cameras },
  );
  const advice = photoAdvice({
    target: veil,
    profile,
    pixelSizeUm: camera.pixelSizeUm,
    sensorKind: camera.sensorKind,
  });
  assert.deepEqual(advice.focalRange, {
    minimumMm: 140,
    maximumMm: 230,
    sampled: false,
  });
  assert.deepEqual(advice.apertureRange, [4, 6]);
  assert.equal(advice.filterFamily, "dual");
  assert.equal(advice.framing.fit, "centre");
  assert.equal(advice.generic, true);
  const own = photoAdvice({
    target: veil,
    profile,
    pixelSizeUm: camera.pixelSizeUm,
    sensorKind: camera.sensorKind,
    telescopes: [{ id: "lens", name: "Objectif 200 mm", focalLengthMm: 200 }],
  });
  assert.equal(own.telescope.focalLengthMm, 200);
  assert.equal(own.generic, false);
  const galaxy = photoAdvice({
    target: {
      designation: "M51",
      apparentSizeArcmin: [13.7, 11.7],
      skyTarget: { typeKey: "Galaxie" },
    },
    profile,
    pixelSizeUm: camera.pixelSizeUm,
    sensorKind: "mono",
  });
  assert.deepEqual(galaxy.focalRange, {
    minimumMm: 930,
    maximumMm: 1550,
    sampled: true,
  });
  assert.equal(galaxy.filterFamily, null);
  assert.equal(galaxy.current.inFocalRange, true);
  assert.equal(galaxy.framing.fit, "fits");
  assert.equal(
    photoAdvice({
      target: { skyTarget: { typeKey: "Nébuleuse en émission" } },
      profile,
      sensorKind: "mono",
    }).filterFamilies.join(","),
    "ha,oiii",
  );
});

test("coherence: the suggestion and the preview judge the same pair under the same sky", () => {
  const profile = newton("plossl-10");
  const inventory = { eyepieces: [eyepiece("plossl-10")], filters: [uhc] };
  const night = planNight({
    date: "2026-08-15",
    location: { latitude: "44.0", longitude: "6.0", timezone: "Europe/Paris" },
    targets: [veil],
    profile,
    locale: "fr",
    skyQuality: bortle1,
    planetReferences: { planets: [] },
    visualInventory: inventory,
  });
  const card = night.cards.find((entry) => entry.target.id === veil.id);
  assert.ok(card, "NGC 6960 is proposed");
  const preview = targetPreviewVisibility({
    target: veil,
    resolved: profile,
    sky: bortle1,
    forced: true,
    locale: "fr",
    inventory,
  });
  // The pair chosen is difficult in both; the card says what to change.
  assert.equal(card.visual.status, "difficult");
  assert.equal(preview.status, "difficult");
  assert.deepEqual(card.visual.pair.advice, preview.advice);
  assert.equal(preview.adviceText, "Visible au 32 mm");
  assert.equal(card.visual.pair.advice.generic, true);

  // Without a UHC and with the 10 mm only, under a town sky (SQM 18.5):
  // « Mon matériel » cannot show it (unlikely); the card stays with the
  // generic pair that brings it closest, says so, and pays for it.
  const town = planNight({
    date: "2026-08-15",
    location: { latitude: "44.0", longitude: "6.0", timezone: "Europe/Paris" },
    targets: [veil],
    profile: newton("plossl-10", []),
    locale: "fr",
    skyQuality: { sqm: 18.5 },
    planetReferences: { planets: [] },
    visualInventory: { eyepieces: [eyepiece("plossl-10")], filters: [] },
  });
  const kept = town.cards.find((entry) => entry.target.id === veil.id);
  assert.ok(kept, "kept with a generic pair");
  assert.equal(kept.visual.status, "difficult");
  assert.equal(kept.visual.pair.generic, true);
  assert.equal(kept.visual.pair.eyepiece.focalLengthMm, 32);
  assert.equal(kept.visual.pair.filter.family, "oiii");
  assert.equal(
    visualBestPairText("fr", kept.visual.pair.advice),
    "Plus facile au 32 mm avec un filtre OIII",
  );
  assert.ok(visualSuggestionMalus(kept.visual).malus >= 8);
  // Without the generic profiles' rescue the verdict of before would drop it.
  assert.equal(
    visualSuitability(veil, newton("plossl-10", []), undefined, {
      sqm: 18.5,
    }).status,
    "unlikely",
  );
});

// VISUAL-SIM-02c: the gains read from Knisely's ratings (VISUAL-SIM-02 § 3.7).
test("the Crab, the California Nebula and IC 434 have their own gains", () => {
  const crab = { designation: "M1", typeKey: "supernova remnant" };
  assert.equal(visualFilterGain(crab, "uhc"), 1.5);
  assert.equal(visualFilterGain(crab, "oiii"), 1);
  assert.equal(visualFilterGain(crab, "hb"), -2);
  const california = { designation: "NGC1499", typeKey: "emission nebula" };
  assert.equal(visualFilterGain(california, "hb"), 1.5);
  assert.equal(visualFilterGain(california, "uhc"), 0.5);
  assert.equal(visualFilterGain(california, "oiii"), 0);
  const horsehead = { designation: "IC434", typeKey: "emission nebula" };
  assert.equal(visualFilterGain(horsehead, "uhc"), 1);
  assert.equal(visualFilterGain(horsehead, "oiii"), -2);
});

test("the verdict by sky: NGC 6960 on the Newton 250/1200, Plössl 10 mm, Bortle 1, 4 and 7, UHC and none", () => {
  const rows = [];
  for (const bortleClass of [1, 4, 7]) {
    for (const filterIds of [["own-uhc"], []]) {
      const verdict = visualSuitability(
        veil,
        newton("plossl-10", filterIds),
        undefined,
        { bortleClass },
      );
      rows.push([
        bortleClass,
        filterIds.length ? "uhc" : "none",
        verdict.status,
        Math.round(verdict.magnitudeMargin * 100) / 100,
      ]);
    }
  }
  // Pinned as they were validated; a change of fillingFactor or of
  // contrastThresholdMaximum moves these on purpose, never by accident.
  assert.deepEqual(rows, [
    [1, "uhc", "difficult", 0.83],
    [1, "none", "difficult", -0.67],
    [4, "uhc", "difficult", 0.38],
    [4, "none", "difficult", -1.12],
    [7, "uhc", "difficult", -0.82],
    [7, "none", "unlikely", -2.32],
  ]);
});
