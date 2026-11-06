import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { message } from "portal/i18n.js";
import {
  windPresetLabelKey,
  windSectionLabels,
  windTonightLine,
} from "planner/wind-section.js";
import {
  normalizeWindTolerance,
  windAssessment,
  windTolerancePresets,
} from "planner/wind.js";

// "Tolérance au vent": a row of the web planner's stage 3 and its dialog.

const at = (iso) => Date.parse(iso);
const night = {
  start: "2026-10-14T20:50:00.000Z",
  end: "2026-10-15T05:40:00.000Z",
};
const hourly = [
  { time: at("2026-10-14T22:00:00Z"), wind: 10, gust: 18 },
  { time: at("2026-10-15T00:00:00Z"), wind: 15, gust: 27 },
  { time: at("2026-10-15T01:00:00Z"), wind: 13, gust: 24 },
];
const plain = (text) => text.replaceAll(" ", " ");
const assess = (tolerance) =>
  windAssessment({ hourly, tolerance, window: night });
const component = readFileSync(
  new URL("../src/components/WindTolerance.js", import.meta.url),
  "utf8",
);

test("the French copy: title, sentence, presets, limits", () => {
  assert.equal(message("fr", "plannerWindTitle"), "Tolérance au vent");
  assert.equal(
    message("fr", "plannerWindDescription"),
    "Au-delà de ces limites, les créneaux sont signalés et les cibles perdent des points.",
  );
  assert.deepEqual(
    windTolerancePresets.map((entry) => message("fr", entry.label)),
    ["Léger", "Standard", "Lourd ou abrité", "Personnalisé"],
  );
  const labels = windSectionLabels({
    locale: "fr",
    tolerance: normalizeWindTolerance("standard"),
    mountName: "Équatoriale compacte",
  });
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(labels).map(([key, value]) => [key, plain(value)]),
    ),
    {
      value: "Standard · 20 / 30 km/h",
      summary: "vent Standard",
      forMount: "Pour la monture : Équatoriale compacte",
      limitsOf: "Limites du réglage Standard",
      sustained: "20 km/h",
      gust: "30 km/h",
      mount:
        "Réglage de la monture : Équatoriale compacte. Il est repris dans chaque plan qui l’utilise.",
    },
  );
  assert.equal(message("fr", "plannerWindSustained"), "Vent soutenu");
  assert.equal(message("fr", "plannerWindGusts"), "Rafales");
  assert.equal(windPresetLabelKey("storm"), "plannerWindPresetStandard");
  for (const key of ["mount", "forMount"])
    assert.equal(
      plain(windSectionLabels({ locale: "fr", tolerance: undefined })[key]),
      "Aucune monture choisie : le réglage vaut pour les plans sans monture.",
    );
  // "Personnalisé": the folded stage says the limits.
  assert.equal(
    plain(
      windSectionLabels({
        locale: "fr",
        tolerance: normalizeWindTolerance({
          preset: "custom",
          sustainedKmh: 22,
          gustKmh: 34,
        }),
      }).summary,
    ),
    "vent 22 / 34 km/h",
  );
});

test("tonight's line: near, under, over, another night, no forecast", () => {
  const line = (tolerance, tonight = true) =>
    windTonightLine({
      locale: "fr",
      assessment: assess(tolerance),
      tonight,
      timeZone: "UTC",
    });
  assert.equal(line("standard").tone, "near");
  assert.equal(
    plain(line("standard").text),
    "Ce soir : rafales jusqu’à 27 km/h vers 00:00, proches de la limite.",
  );
  assert.deepEqual(
    { ...line("heavy"), text: plain(line("heavy").text) },
    {
      tone: "calm",
      text: "Ce soir : rafales jusqu’à 27 km/h vers 00:00, sous la limite.",
    },
  );
  assert.equal(line("light", false).tone, "over");
  assert.equal(
    plain(line("light", false).text),
    "Cette nuit : rafales jusqu’à 27 km/h vers 00:00, au-delà de la limite.",
  );
  assert.equal(
    windTonightLine({ locale: "fr", assessment: null, tonight: true }).text,
    "Prévision indisponible ce soir.",
  );
  assert.equal(
    windTonightLine({ locale: "fr", assessment: null, tonight: false }).text,
    "Prévision indisponible pour cette nuit.",
  );
});

test("English and Japanese say the same thing, every placeholder filled", () => {
  for (const locale of ["en", "ja"]) {
    const { text } = windTonightLine({
      locale,
      assessment: assess("standard"),
      tonight: true,
      timeZone: "UTC",
    });
    assert.ok(text.includes("27") && text.includes("00:00"), locale);
    assert.ok(!text.includes("{"), locale);
    const labels = windSectionLabels({
      locale,
      tolerance: normalizeWindTolerance("heavy"),
      mountName: "M",
    });
    for (const value of Object.values(labels))
      assert.ok(!value.includes("{"), `${locale}: ${value}`);
  }
});

test("the component: a radio group of the four presets, two whole-number fields in custom, the line as a status", () => {
  assert.match(component, /role="radiogroup"/);
  assert.match(component, /type="radio"/);
  assert.match(component, /type="number"/);
  assert.match(component, /min=\{windToleranceRule\.minimumKmh\}/);
  assert.match(component, /max=\{windToleranceRule\.maximumKmh\}/);
  assert.match(component, /step=\{windToleranceRule\.stepKmh\}/);
  assert.match(component, /role="status"/);
  // A custom value is written when the field is left, not at each key.
  assert.match(component, /onBlur=\{commit\}/);
});

test("the planner shows the row in stage 3, its dialog applies a choice through the plan history", () => {
  const source = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /<WindToleranceDialog[\s\S]*onChoose=\{chooseWindTolerance\}/,
  );
  assert.match(source, /applyWindToleranceToPlans\(/);
  assert.match(source, /changedIds\.forEach\(rememberPlanChange\)/);
  assert.match(source, /equipmentWithWindTolerance\(merged/);
});

test("tonight's line speaks of the sustained wind when it sets the level", () => {
  // Setting 22 / 34: gusts reach 31, under 34; the sustained wind reaches
  // 24, over 22.
  const sustained = windAssessment({
    hourly: [
      { time: at("2026-10-14T22:00:00Z"), wind: 24, gust: 31 },
      { time: at("2026-10-15T00:00:00Z"), wind: 14, gust: 20 },
    ],
    tolerance: { preset: "custom", sustainedKmh: 22, gustKmh: 34 },
    window: night,
  });
  const expected = {
    fr: "Ce soir : vent soutenu jusqu’à 24 km/h vers 22:00, au-delà de la limite.",
    en: "Tonight: sustained wind up to 24 km/h around 22:00, beyond the limit.",
  };
  for (const [locale, text] of Object.entries(expected)) {
    const line = windTonightLine({
      locale,
      assessment: sustained,
      tonight: true,
      timeZone: "UTC",
    });
    assert.equal(line.tone, "over");
    assert.equal(plain(line.text), text);
  }
  const ja = windTonightLine({
    locale: "ja",
    assessment: sustained,
    tonight: true,
    timeZone: "UTC",
  }).text;
  assert.ok(ja.includes("24") && ja.includes("22:00") && !ja.includes("{"));
  // The gusts still speak when they set the level.
  assert.match(
    windTonightLine({
      locale: "fr",
      assessment: assess("standard"),
      tonight: true,
      timeZone: "UTC",
    }).text,
    /rafales jusqu’à 27/,
  );
});
