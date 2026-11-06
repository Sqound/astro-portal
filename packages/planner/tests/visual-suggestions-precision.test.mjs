import assert from "node:assert/strict";
import test from "node:test";

import {
  nakedEyeLimitingMagnitude,
  planNight,
  visualSkySqm,
  visualSuitability,
} from "../src/planner.js";
import {
  rankSuggestionCandidates,
  visualSuggestionMalus,
} from "../src/suggestion-ranking.js";

// VISUAL-SUGGESTIONS-PRECISION-01: a 114/900 reflector with a 25 mm Plössl
// (52°): 36x, 3.2 mm of exit pupil, 1.44° of true field; under a city sky
// (SQM 18.5) and a country one (SQM 21.5), against the dark-sky limit of
// before (no sky known).
const profile = {
  mode: "visual",
  apertureMm: 114,
  focalLengthMm: 900,
  magnification: 36,
  exitPupilMm: 114 / 36,
  visualFieldDiameterDegrees: 52 / 36,
};
const field = {
  width: 52 / 36,
  height: 52 / 36,
  diameter: 52 / 36,
  shape: "circle",
};
const city = { sqm: 18.5 };
const country = { sqm: 21.5 };
// The catalogue's values (the device's index, `target_index/en.json.gz`).
const target = (designation, size, magnitude, typeKey) => ({
  id: designation,
  designation,
  apparentSizeArcmin: size,
  integratedMagnitude: magnitude,
  skyTarget: { typeKey },
  tags: [],
});
const targets = {
  M13: target("M13", [16.5, 16.5], 5.8, "Amas globulaire"),
  M57: target("M57", [1.3, 1.3], 8.8, "Nébuleuse planétaire"),
  M101: target("M101", [24, 23.1], 7.9, "Galaxie"),
  M33: target("M33", [62.1, 36.7], 5.8, "Galaxie"),
  "NGC 7662": target("NGC 7662", [0.3, 0.3], 8.3, "Nébuleuse planétaire"),
  M31: target("M31", [177.8, 69.7], 3.4, "Galaxie"),
  M45: target("M45", [150, 150], 1.2, "Amas ouvert"),
  "NGC 891": target("NGC 891", [13, 3], 10, "Galaxie"),
  M42: target("M42", [90, 60], 4, "Nébuleuse en émission"),
};
const read = (name, sky) =>
  visualSuitability(targets[name], profile, field, sky);
const round = (value) => Math.round(value * 100) / 100;

test("without a sky the limit and every status are the ones of before", () => {
  for (const name of Object.keys(targets)) {
    const result = read(name, null);
    assert.equal(result.status, "suitable", name);
    assert.equal(round(result.magnitudeLimit), 12.98);
    assert.equal(result.skySqm, null);
    assert.equal(result.contrastMargin, null);
  }
  assert.equal(round(read("M101", null).magnitudeMargin), 4.88);
  assert.equal(round(read("NGC 891", null).magnitudeMargin), 2.89);
});

test("the naked-eye limit follows Schaefer's relation", () => {
  assert.equal(round(nakedEyeLimitingMagnitude(21.5)), 6.38);
  assert.equal(round(nakedEyeLimitingMagnitude(18.5)), 4.38);
  assert.equal(round(nakedEyeLimitingMagnitude(22)), 6.62);
});

test("a city sky lowers the limit, the diffuse galaxies first", () => {
  assert.equal(round(read("M13", city).magnitudeLimit), 11.7);
  assert.equal(round(read("M13", country).magnitudeLimit), 13.15);
  // Stars and clusters keep their margin of magnitude.
  for (const name of ["M13", "M45"]) {
    assert.equal(read(name, city).status, "suitable", name);
    assert.equal(read(name, city).contrastMargin, null, name);
  }
  // A low surface brightness costs its contrast under a bright sky.
  for (const name of ["M101", "M33", "NGC 891"]) {
    assert.equal(read(name, city).status, "difficult", name);
    assert.equal(read(name, country).status, "suitable", name);
  }
  assert.equal(round(read("M101", city).magnitudeMargin), -0.92);
  assert.equal(round(read("M33", city).magnitudeMargin), -0.36);
  assert.equal(round(read("NGC 891", city).magnitudeMargin), -0.14);
  // The bright cores stay suitable in town, as do the planetaries.
  for (const name of ["M31", "M42", "M57", "NGC 7662"])
    assert.equal(read(name, city).status, "suitable", name);
  // What a city sky costs against the dark-sky rule of before: a diffuse
  // object pays its contrast (M101 5.8 mag of margin), a cluster its
  // magnitude only (M13 1.3).
  const loss = (name) =>
    read(name, null).magnitudeMargin - read(name, city).magnitudeMargin;
  assert.equal(round(loss("M101")), 5.8);
  assert.equal(round(loss("M13")), 1.28);
});

test("a Bortle class alone reads its typical SQM; an unreadable sky is none", () => {
  assert.equal(visualSkySqm({ bortleClass: 8 }), 17.7);
  assert.equal(visualSkySqm({ bortleClass: 8, sqm: 18.4 }), 18.4);
  assert.equal(visualSkySqm({ bortleClass: 12, sqm: "" }), null);
  assert.equal(visualSkySqm(null), null);
  assert.equal(read("M101", { bortleClass: 12 }).status, "suitable");
  assert.equal(
    round(read("M101", { bortleClass: 12 }).magnitudeLimit),
    round(read("M101", null).magnitudeLimit),
  );
});

test("a higher magnification darkens the background and shows fainter stars", () => {
  const high = visualSuitability(
    targets.M13,
    { ...profile, magnification: 180, exitPupilMm: 114 / 180 },
    { ...field, width: 52 / 180, height: 52 / 180, diameter: 52 / 180 },
    city,
  );
  assert.ok(high.magnitudeLimit > read("M13", city).magnitudeLimit + 1.5);
});

test("the size: small for the magnification, large for the field, clusters swept", () => {
  assert.equal(read("NGC 7662", null).sizeFit, "small");
  assert.equal(round(read("NGC 7662", null).sizeShare), 0.44);
  assert.equal(read("M31", null).sizeFit, "large");
  assert.equal(round(read("M31", null).sizeShare), 0.32);
  // The Pleiades (1.7 times the field) are a cluster one sweeps.
  assert.equal(read("M45", null).sizeFit, null);
  assert.equal(read("M45", null).sizeShare, 0);
  for (const name of ["M13", "M57", "M101", "M33", "NGC 891", "M42"])
    assert.equal(read(name, null).sizeShare, 0, name);
  // The size never changes the status.
  assert.equal(read("NGC 7662", city).status, "suitable");
});

test("photo mode is untouched by the sky", () => {
  assert.deepEqual(
    visualSuitability(targets.M101, { mode: "imaging" }, field, city),
    { status: "not-applicable", visible: true },
  );
});

test("the malus: a difficult target and a target of the wrong size pay", () => {
  assert.deepEqual(visualSuggestionMalus(read("M13", city)), {
    malus: 0,
    difficult: 0,
    size: 0,
  });
  assert.equal(visualSuggestionMalus(read("M101", city)).malus, 14.6);
  assert.equal(visualSuggestionMalus(read("M33", city)).malus, 11.8);
  assert.equal(visualSuggestionMalus(read("NGC 7662", city)).malus, 6.7);
  assert.equal(visualSuggestionMalus(read("M31", city)).malus, 4.8);
  assert.equal(
    visualSuggestionMalus({ status: "not-applicable", sizeShare: 1 }).malus,
    0,
  );
});

// A pool as `autoFillNight` prepares it: the card and its score of the night.
const candidate = (name, total, sky) => ({
  id: name,
  card: {
    target: { id: name, designation: name, title: "" },
    visual: read(name, sky),
  },
  score: { total, max: 100 },
  culmination: 0,
});
const order = (pool, mode = "visual") =>
  rankSuggestionCandidates(pool, { mode }).strict.map((entry) => entry.id);

test("in town a difficult galaxy goes below a suitable target of a comparable night", () => {
  const pool = [
    candidate("M101", 92, city),
    candidate("M13", 88, city),
    candidate("M57", 86, city),
  ];
  assert.deepEqual(order(pool), ["M13", "M57", "M101"]);
  // In the country, nothing is difficult: the order of the night's score.
  const countryPool = [
    candidate("M101", 92, country),
    candidate("M13", 88, country),
    candidate("M57", 86, country),
  ];
  assert.deepEqual(order(countryPool), ["M101", "M13", "M57"]);
  // Photo keeps the order of the score.
  assert.deepEqual(order(pool, "photo"), ["M101", "M13", "M57"]);
});

test("the order between suitable targets of the right size is unchanged", () => {
  const pool = [
    candidate("M57", 80, city),
    candidate("M13", 95, city),
    candidate("M42", 90, city),
    candidate("M45", 70, city),
  ];
  assert.deepEqual(order(pool), order(pool, "photo"));
});

test("a target too small or too large goes down, never out", () => {
  const pool = [
    candidate("NGC 7662", 93, country),
    candidate("M31", 92, country),
    candidate("M13", 90, country),
  ];
  assert.deepEqual(order(pool), ["M13", "M31", "NGC 7662"]);
  assert.equal(order(pool).length, 3);
});

test("planNight reads the place's sky for its visual cards", () => {
  const args = {
    date: "2025-05-10",
    location: {
      latitude: 48.85,
      longitude: 2.35,
      elevation: 35,
      timeZone: "Europe/Paris",
    },
    targets: [
      {
        ...targets.M101,
        id: "m101",
        source: "M101",
        coordinate: { ra: 210.8, dec: 54.35 },
      },
      {
        ...targets.M13,
        id: "m13",
        source: "M13",
        coordinate: { ra: 250.42, dec: 36.46 },
      },
    ],
    profile,
    locale: "fr",
    minAltitude: 30,
    moonSeparationMinimum: 0,
    planetReferences: { planets: [] },
  };
  const status = (night) =>
    Object.fromEntries(
      night.cards.map((card) => [card.target.id, card.visual.status]),
    );
  assert.deepEqual(status(planNight(args)), {
    m101: "suitable",
    m13: "suitable",
  });
  assert.deepEqual(status(planNight({ ...args, skyQuality: city })), {
    m101: "difficult",
    m13: "suitable",
  });
});

// The printable plan of another plan than the one on screen
// (`contextForPlan`, `PlannerPage.js`) reads its place's sky as the
// sky-brightness rule shows it: measured, else typed, else the estimate.
test("a plan's place's sky: measured, else typed, else the estimate", async () => {
  const { placeVisualSky } = await import("../src/sky-brightness.js");
  const place = { id: "ville", latitude: 45, longitude: 5 };
  const measures = {
    status: "kept",
    fetchedAt: "2026-10-02T12:00:00.000Z",
    list: {
      places: [
        {
          placeId: "ville",
          measures: [
            {
              night: "2026-10-01",
              sqm: 18.3,
              poseCount: 14,
              methodVersion: "astro-sync-sky/1",
              observedAt: "2026-10-01T22:10:00.000Z",
              sessionId: null,
              updatedAt: "2026-10-01T22:10:00.000Z",
            },
          ],
        },
      ],
    },
  };
  const knownPlaces = [
    {
      id: "ville",
      skyEntered: { sqm: 18.9, enteredAt: "2026-09-28T12:00:00.000Z" },
    },
  ];
  const model = { bortleClass: 4, sqm: 21.1 };
  assert.equal(
    placeVisualSky({ place, model, measures, knownPlaces }).sqm,
    18.3,
  );
  assert.equal(
    placeVisualSky({ place, model, measures: { status: "none" }, knownPlaces })
      .sqm,
    18.9,
  );
  assert.equal(
    placeVisualSky({ place, model, measures: { status: "none" } }).sqm,
    21.1,
  );
  assert.equal(
    placeVisualSky({ place, measures: { status: "none" }, knownPlaces: [] }),
    null,
  );
});

test("the printable plan's night passes the plan's place's sky in visual", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  const context = source.slice(
    source.indexOf("const contextForPlan = (plan) =>"),
    source.indexOf("const printablePlan ="),
  );
  assert.match(
    context,
    /skyQuality:\s*\n?\s*equipmentForPlan\.mode !== "visual"/,
  );
  assert.equal((context.match(/placeVisualSky\(/g) || []).length, 2);
});
