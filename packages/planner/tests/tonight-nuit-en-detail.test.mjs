import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// "La nuit en détail" of the web's "Cette nuit": the planner's hourly strip
// out of `PlannerPage.js`, with its title and each hour's score; the two sky cards
// and their dialogs with their scales; the threshold's dialog and the
// document it writes. Synthetic place and values; nothing leaves the test.
await registerJsx();
const { HourlyForecast, scoreLevel } =
  await import("planner/components/HourlyForecast.js");
const { SkyQualityCards, SkyBrightnessDialogBody, BortleDialogBody } =
  await import("planner/components/SkyBrightnessParts.js");
const { DarknessSettingButton } =
  await import("planner/components/DarknessDialog.js");
const { placeSkyBrightness, skyBackgroundWords, bortleWords, bortleHowText } =
  await import("planner/sky-brightness.js");
const {
  lightMapScaleSteps,
  skyBrightnessScaleGradient,
  skyBrightnessScalePosition,
} = await import("planner/sky-scale.js");
const { tonightWords } = await import("planner/tonight-words.js");
const { tonightOverview } = await import("planner/tonight-overview.js");
const { planNightSpanSky } = await import("planner/planner.js");
const { writePlannerDocument } = await import("planner/quick-plan-web.js");

const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));

const lac = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: 45,
  longitude: -30,
  timeZone: "UTC",
};
const measured = {
  status: "ready",
  list: {
    places: [
      {
        placeId: "lac-noir",
        measures: [
          {
            night: "2026-10-03",
            sqm: 21.04,
            poseCount: 42,
            methodVersion: "astro-sync-sky/1",
            observedAt: "2026-10-03T22:10:00.000Z",
            sessionId: null,
            updatedAt: "2026-10-03T22:10:00.000Z",
          },
        ],
      },
    ],
  },
};
const model = { bortleClass: 3, sqm: 21.4 };
const sky = (source) =>
  placeSkyBrightness({
    place:
      source === "entered"
        ? {
            ...lac,
            skyEntered: { sqm: 20.9, enteredAt: "2026-09-28T12:00:00.000Z" },
          }
        : lac,
    model,
    measures: source === "measured" ? measured : { status: "none" },
  });

const hours = [19, 20, 21, 22].map((hour, index) => ({
  time: `2026-10-14T${hour}:00:00.000Z`,
  cloud: [0, 2, 30, 60][index],
  precipitation: 0,
  humidity: 62,
  wind: 6,
  windDirection: 270,
  visibilityKm: 24,
  score: [100, 70, 50, 20][index],
}));
const night = {
  start: "2026-10-14T18:54:00.000Z",
  end: "2026-10-15T04:38:00.000Z",
};

test("the strip on « Cette nuit » carries its title and each hour’s score in its level; the planner’s keeps its own, without scores", () => {
  const tonight = render(HourlyForecast, {
    forecast: { hourly: hours, fetchedAt: "2026-10-14T17:42:00.000Z" },
    locale: "fr",
    night,
    timeZone: "UTC",
    title: "Estimation météo heure par heure",
    hourScores: true,
    onRefresh: () => {},
  });
  assert.match(tonight, /<h3>Estimation météo heure par heure<\/h3>/);
  assert.match(
    tonight,
    /aria-label="Estimation météo heure par heure"/,
    "the section is named by its title",
  );
  const levels = [
    ...tonight.matchAll(
      /class="planner-hourly-forecast-score" data-level="(\w+)"[^>]*>(\d+)</g,
    ),
  ].map((match) => [match[2], match[1]]);
  // The number at the head of a column has a name.
  assert.match(
    tonight,
    /class="planner-hourly-forecast-score" data-level="excellent" role="img" aria-label="Note de l’heure 100" title="Note de l’heure"/,
  );
  assert.deepEqual(levels, [
    ["100", "excellent"],
    ["70", "favourable"],
    ["50", "variable"],
    ["20", "poor"],
  ]);
  assert.match(tonight, /aria-label="Actualiser la prévision"/);
  assert.ok(textOf(tonight).includes("Faites glisser pour voir toute la nuit"));
  // The ⓘ holds the estimate's sentence (the note that left the tiles).
  assert.match(
    tonight,
    /aria-label="Estimation météo sur la nuit astronomique ; elle ne mesure pas/,
  );

  const planner = render(HourlyForecast, {
    forecast: { hourly: hours },
    locale: "fr",
    night,
    timeZone: "UTC",
  });
  assert.match(planner, /<strong>Conditions heure par heure<\/strong>/);
  assert.ok(!planner.includes("planner-hourly-forecast-score"));
  assert.equal(scoreLevel(82), "excellent");
  assert.equal(scoreLevel(81), "favourable");
  assert.equal(scoreLevel(42), "variable");
  assert.equal(scoreLevel(41), "poor");
});

test("two cards drawn like the tiles, each a button named with what it shows and opens; the subtitle says the provenance", () => {
  const cards = (source) => {
    const brightness = sky(source);
    const words = tonightWords(
      tonightOverview({
        place: lac,
        date: "2026-10-14",
        night: planNightSpanSky({ date: "2026-10-14" }, lac),
        hourly: [],
        moonIllumination: 17,
        skyQuality: brightness.choice.shown,
        plans: [],
      }),
      {
        locale: "fr",
        timeZone: "UTC",
        skySource: brightness.choice.source,
      },
    ).skyQuality;
    return {
      words,
      markup: render(SkyQualityCards, {
        locale: "fr",
        sky: brightness,
        words,
      }),
    };
  };
  const { words, markup } = cards("measured");
  assert.equal(words.sqm.value, "21,0");
  assert.equal(words.sqm.detail, "mesuré");
  assert.equal(words.bortle.value, "4");
  assert.equal(words.bortle.detail, "Ciel de campagne périurbaine");
  assert.match(
    markup,
    /<button type="button" class="tonight-card tonight-tile tonight-sky-card" data-card="sqm" aria-label="Fond de ciel : 21,0 mag\/arcsec², mesuré\. À propos du fond de ciel">/,
  );
  assert.match(
    markup,
    /data-card="bortle" aria-label="Bortle : 4, Ciel de campagne périurbaine\. À propos de la classe de Bortle"/,
  );
  assert.match(markup, /<h2 id="tonight-sky-title" class="tonight-sky-title">/);
  assert.equal((markup.match(/class="info-button/g) || []).length, 0);
  assert.equal((markup.match(/tonight-sky-card-info/g) || []).length, 2);
  // The figure is before the sentence: the long sentence is not on the page.
  assert.ok(!textOf(markup).includes("Voie lactée pâle à l’horizon"));
  assert.equal(cards("entered").words.sqm.detail, "saisi");
  assert.equal(cards("entered").words.sqm.value, "20,9");
  assert.equal(cards("model").words.sqm.detail, "estimé");
  assert.equal(cards("model").words.bortle.detail, "Ciel rural");
});

test("the dialog « Fond de ciel (SQM) » — the three values, the continuous scale marked « Ici · 21,0 », « Le SQM, c’est… », then today’s sections", () => {
  const words = skyBackgroundWords(sky("measured"), { locale: "fr" });
  assert.equal(words.title, "Fond de ciel (SQM)");
  assert.equal(words.scale.here, "Ici · 21,0");
  // 21,04 measured, shown 21,0: a fifth of the way from 22,0 to 17,0.
  assert.equal(Math.round(words.scale.position * 100), 19);
  assert.deepEqual(
    words.scale.ticks.map((tick) => [
      tick.figure,
      Math.round(tick.position * 10),
    ]),
    [
      [21, 2],
      [20, 4],
      [19, 6],
      [18, 8],
    ],
  );
  const markup = render(SkyBrightnessDialogBody, { words, locale: "fr" });
  const text = textOf(markup);
  const order = [
    "mesuré 21,0 Bortle 4",
    "Ici · 21,0",
    "22,0 · ciel le plus sombre",
    "ciel de ville · 17,0",
    "Le SQM, c’est…",
    "Une unité de moins, c’est un ciel 2,5 fois plus clair.",
    "Mesuré sur vos poses",
    "Sources",
  ].map((expected) => text.indexOf(expected));
  assert.ok(
    order.every((at, index) => at >= 0 && (!index || at > order[index - 1])),
    `in order: ${order.join(", ")} — ${text}`,
  );
  assert.match(
    markup,
    /role="img" aria-label="Échelle du fond de ciel, de 22,0 \(ciel le plus sombre\) à 17,0 \(ciel de ville\) : vous êtes à 21,0\."/,
  );
  assert.match(markup, /class="sky-scale-mark" style="left:19.2%"/);
});

test("the dialog « Classe de Bortle » — the figure before the full sentence, the nine steps with the class ringed and « Ici · 4 », how it was obtained", () => {
  const words = bortleWords(sky("measured"), { locale: "fr" });
  assert.equal(words.title, "Classe de Bortle");
  const markup = render(BortleDialogBody, { words, locale: "fr" });
  const text = textOf(markup);
  assert.ok(
    text.startsWith(
      "4 Ciel de campagne périurbaine, Voie lactée pâle à l’horizon.",
    ),
    text,
  );
  assert.equal((markup.match(/class="is-here"/g) || []).length, 1);
  assert.match(markup, /<li class="is-here" data-bortle="4">/);
  assert.ok(text.includes("Ici · 4"));
  assert.ok(text.includes("22,0 · ciel plus sombre"));
  assert.ok(text.includes("L’échelle de Bortle"));
  assert.ok(
    text.includes(
      "Déduite du fond de ciel mesuré sur vos poses : 21,0 mag/arcsec² se range en classe 4, qui va de 20,49 à 21,69.",
    ),
    text,
  );
  // The figures under the steps: the odd ones and the ringed one.
  assert.deepEqual(
    words.scale.steps.filter((step) => step.labelled).map((s) => s.bortle),
    [1, 3, 4, 5, 7, 9],
  );
  assert.equal(
    bortleHowText({ source: null, sqm: 22.1, bortle: 1 }, { locale: "fr" }),
    "Déduite du fond de ciel estimé par le modèle à partir des lumières nocturnes VIIRS : 22,1 mag/arcsec² se range en classe 1, à partir de 21,99.",
  );
  assert.equal(
    bortleHowText(
      { source: "entered", sqm: 16.4, bortle: 9 },
      { locale: "en" },
    ),
    "Derived from the sky background you entered: 16.4 mag/arcsec² falls in class 9, below 17.00.",
  );
});

test("the continuous scale clamps at its ends and runs through the light map's nine colours", () => {
  assert.equal(skyBrightnessScalePosition(22.6), 0);
  assert.equal(skyBrightnessScalePosition(16.2), 1);
  const gradient = skyBrightnessScaleGradient();
  assert.match(gradient, /^linear-gradient\(90deg, #0c120e 0%, /);
  assert.ok(gradient.endsWith(`${lightMapScaleSteps()[8].colour} 100%)`));
});

test("the threshold’s icon is named « Changer le seuil d’obscurité »; a choice writes the document where the page read it", async () => {
  const markup = render(DarknessSettingButton, {
    locale: "fr",
    darkness: "astronomical",
    place: lac,
    date: "2026-10-14",
    timeZone: "UTC",
    onChoose: () => {},
  });
  assert.match(
    markup,
    /<button type="button" class="tonight-night-threshold" aria-label="Changer le seuil d’obscurité" title="Changer le seuil d’obscurité">/,
  );
  // A visitor: the browser's document.
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const state = { plans: [{ id: "p", darkness: "nautical" }] };
  await writePlannerDocument({ state, previous: null, storage });
  assert.deepEqual(JSON.parse(values.get("astro-portal:planner:v1")), state);
  // A signed-in person: the space, by its replace path.
  const asked = [];
  await writePlannerDocument({
    state,
    previous: { plans: [] },
    signedIn: true,
    email: "camille@exemple.test",
    storage,
    csrf: () => "token",
    fetcher: async (url, init) => {
      asked.push([url, init.method, JSON.parse(init.body).mode]);
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.deepEqual(asked, [["/api/plans", "PUT", "replace"]]);
  // Refused: the previous document comes back, and the caller hears it.
  await assert.rejects(
    writePlannerDocument({
      state,
      previous: { plans: [] },
      signedIn: true,
      storage,
      csrf: () => "token",
      fetcher: async () => ({
        ok: false,
        json: async () => ({ error: "planOperationFailed" }),
      }),
    }),
    /planOperationFailed/,
  );
});
