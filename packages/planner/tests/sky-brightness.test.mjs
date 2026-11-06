import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The observer's sky background on the web: the measured values read and
// kept in the browser, the words of the pill and of the dialog, the place
// card and "Mes lieux" in their three kinds, and the check of the form's
// field. Synthetic places and values; nothing is asked of the network.
await registerJsx();
const {
  loadPlaceSkyMeasures,
  placeSkyBrightness,
  placeSkyMeasuresKey,
  skyBrightnessWords,
  eogAttribution,
} = await import("planner/sky-brightness.js");
const { PlaceSkyMeasuresContext, SkyBrightnessDialogBody } =
  await import("planner/components/SkyBrightnessParts.js");
const { MyPlaceCard } = await import("planner/components/PlacesView.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { skyEnteredFromInput } = await import("portal/sky-brightness-source.js");

const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const list = (placeId, sqm = 21.04, nights = ["2026-10-01"]) => ({
  places: [
    {
      placeId,
      measures: nights.map((night, index) => ({
        night,
        sqm: sqm - index * 0.2,
        poseCount: 14,
        methodVersion: "astro-sync-sky/1",
        observedAt: `${night}T22:10:00.000Z`,
        sessionId: null,
        updatedAt: `${night}T22:10:00.000Z`,
      })),
    },
  ],
});
const answer = (status, body) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});
const typed = { sqm: 20.9, enteredAt: "2026-09-28T12:00:00.000Z" };
const lac = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  latitude: "45.377",
  longitude: "-29.606",
  horizonStatus: "unverified",
  knownPlace: {
    source: "osm",
    id: "node/12",
    type: "campsite",
    linkedAt: "2026-09-20T18:00:00.000Z",
  },
};

test("the measured values are read, kept in the browser, and read back offline", async () => {
  const storage = memoryStorage();
  const fresh = await loadPlaceSkyMeasures({
    fetchImpl: answer(200, list("lac-noir")),
    storage,
    now: () => new Date("2026-10-02T12:00:00.000Z"),
  });
  assert.equal(fresh.status, "fresh");
  assert.ok(storage.getItem(placeSkyMeasuresKey));

  const offline = await loadPlaceSkyMeasures({
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    },
    storage,
  });
  assert.equal(offline.status, "kept");
  assert.equal(offline.fetchedAt, "2026-10-02T12:00:00.000Z");
  assert.equal(
    placeSkyBrightness({ place: lac, model: null, measures: offline }).choice
      .source,
    "measured",
  );

  const down = await loadPlaceSkyMeasures({
    fetchImpl: answer(503, {}),
    storage: memoryStorage(),
  });
  assert.equal(down.status, "unavailable");

  const visitor = await loadPlaceSkyMeasures({
    fetchImpl: answer(401, {}),
    storage,
  });
  assert.equal(visitor.status, "none");
  assert.equal(storage.getItem(placeSkyMeasuresKey), null, "nothing kept");
});

test("the dialog says which value is shown, the three side by side, the night, the poses and the kept date", () => {
  const sky = placeSkyBrightness({
    place: { ...lac, skyEntered: typed },
    model: { bortleClass: 3, sqm: 21.4 },
    measures: {
      status: "kept",
      list: list("lac-noir", 21.04, ["2026-10-01", "2026-09-20"]),
      fetchedAt: "2026-10-02T12:00:00.000Z",
    },
  });
  const words = skyBrightnessWords(sky, { locale: "fr" });
  assert.equal(words.pill, "mesuré");
  assert.equal(words.info, "À propos de cette valeur");
  const text = textOf(
    renderToStaticMarkup(
      createElement(SkyBrightnessDialogBody, { words, locale: "fr" }),
    ),
  );
  for (const expected of [
    "Valeur affichée : celle mesurée sur vos poses, la nuit la plus récente dans ce lieu.",
    // One decimal, like every other sky value of the product (X4).
    "mesuré 21,0 Bortle 4",
    "saisi 20,9 Bortle 4",
    "estimation 21,4 Bortle 3",
    "Nuit du 1 oct. 2026 · médiane de 14 poses",
    "2 nuits mesurées dans ce lieu ; la plus récente est retenue.",
    "Hors ligne : mesure gardée sur l’appareil le 2 oct. 2026.",
    "Saisi le 28 sept. 2026",
    "Comment la mesure est faite",
  ])
    assert.ok(text.includes(expected), `« ${expected} » in « ${text} »`);
  assert.equal(words.tiles.filter((tile) => tile.chosen).length, 1);
  assert.equal(words.close, "Fermer");
  // "Sources" is the last section: the data and calibration credits
  // translated, the licensor's sentence in English, marked as such.
  assert.ok(text.indexOf("Sources") > text.indexOf("Comment la mesure"));
  assert.ok(text.endsWith(eogAttribution), text);
  assert.match(text, /Lumières nocturnes VIIRS \(VNL\).*licence CC BY 4\.0\./);
  assert.match(text, /Calibré sur des mesures de luminance du ciel/);
  assert.ok(
    !text.includes(
      "This product was made utilizing VIIRS Nighttime Lights (VNL) data produced by the Earth Observation Group, Payne Institute for Public Policy, Colorado School of Mines (CC BY 4.0)",
    ),
  );
  assert.match(
    renderToStaticMarkup(
      createElement(SkyBrightnessDialogBody, { words, locale: "fr" }),
    ),
    /<p class="info-attribution" lang="en">This product was made/,
  );
  // The model's own description no longer carries the licence sentence.
  const model = words.sections.find((section) => section.kind === "model");
  assert.ok(model.lines.every((line) => !line.includes("This product")));
});

test("the model alone: the specified words, and the dialog says nothing was measured or typed", () => {
  const words = skyBrightnessWords(
    placeSkyBrightness({
      place: lac,
      model: { bortleClass: 3, sqm: 21.4 },
      measures: { status: "none" },
    }),
    { locale: "fr" },
  );
  assert.equal(words.pill, "estimation");
  assert.equal(words.info, "À propos de cette estimation");
  const lines = words.sections.flatMap((section) => section.lines);
  assert.ok(lines.includes("Aucune mesure pour ce lieu."));
  assert.ok(
    lines.includes(
      "Aucune valeur saisie. Vous pouvez en saisir une en modifiant le lieu.",
    ),
  );
  const en = skyBrightnessWords(
    placeSkyBrightness({ place: lac, model: null, measures: undefined }),
    { locale: "en" },
  );
  assert.equal(en.tiles[2].value, "—");
  assert.ok(
    en.sections[2].lines.includes("Estimate unavailable."),
    "no estimate either",
  );
});

test("« Mes lieux » and the place card show the measured or typed value with its pill; a suggestion keeps the estimate", () => {
  const measures = { status: "fresh", list: list("lac-noir") };
  const row = (place, provided) =>
    textOf(
      renderToStaticMarkup(
        createElement(
          PlaceSkyMeasuresContext.Provider,
          { value: provided },
          createElement(MyPlaceCard, {
            locale: "fr",
            place,
            isDefault: false,
            reference: null,
            skyOverride: { bortle: 3, sqm: 21.4 },
            onOpen: () => {},
          }),
        ),
      ),
    );
  assert.ok(
    row(lac, measures).includes("Bortle 4 · 21,0 mag/arcsec² · mesuré"),
  );
  assert.ok(
    row({ ...lac, skyEntered: typed }, { status: "none" }).includes(
      "Bortle 4 · 20,9 mag/arcsec² · saisi",
    ),
  );
  assert.ok(
    row(lac, { status: "none" }).includes(
      "Bortle 3 · 21,4 mag/arcsec² · estimation",
    ),
  );

  const card = (mode) =>
    renderToStaticMarkup(
      createElement(PlaceDetailView, {
        locale: "fr",
        mode,
        place: {
          id: "osm:node/12",
          name: "Camping du Lac Noir",
          type: "campsite",
          latitude: 45.377,
          longitude: -29.606,
        },
        mine: lac,
        sky: { bortle: 3, sqm: 21.4 },
        measures,
        onBack: () => {},
      }),
    );
  const linked = card("linked");
  assert.ok(textOf(linked).includes("Qualité du ciel mesuré"));
  assert.ok(textOf(linked).includes("21,0 mag/arcsec²"));
  assert.ok(linked.includes('aria-label="À propos de cette valeur"'));
  const suggested = card("suggested");
  assert.ok(textOf(suggested).includes("Qualité du ciel estimation"));
  assert.ok(textOf(suggested).includes("21,4 mag/arcsec²"));
  assert.ok(suggested.includes('aria-label="À propos de cette estimation"'));
});

test("the form's field: optional, range checked, the kept value keeps its date", () => {
  const kept = { sqm: 21.35, enteredAt: "2026-09-28T12:00:00.000Z" };
  const now = "2026-10-02T12:00:00.000Z";
  assert.deepEqual(skyEnteredFromInput("", kept, now), { skyEntered: null });
  assert.deepEqual(skyEnteredFromInput("23", kept, now), { error: "range" });
  assert.deepEqual(skyEnteredFromInput("13,99", null, now), {
    error: "range",
  });
  assert.deepEqual(skyEnteredFromInput("21,35", kept, now), {
    skyEntered: kept,
  });
  assert.deepEqual(skyEnteredFromInput("21.4", kept, now), {
    skyEntered: { sqm: 21.4, enteredAt: now },
  });
});

test("placeScoreSky: the value the note reads is the one the place shows, with its source when a person gave it (TARGET-STATS-SKY-PLACE-01, Q4)", async () => {
  const { placeScoreSky, scoreSkyOfChoice } =
    await import("planner/sky-brightness.js");
  const model = { bortleClass: 3, sqm: 21.9 };
  assert.deepEqual(placeScoreSky({ place: { id: "p" }, model }), {
    sqm: 21.9,
    bortleClass: 3,
  });
  const entered = { sqm: 21.3, enteredAt: "2026-09-01T00:00:00.000Z" };
  assert.deepEqual(
    placeScoreSky({ place: { id: "p", skyEntered: entered }, model }),
    { sqm: 21.3, bortleClass: 4, source: "entered" },
  );
  // The saved entry of the same id carries the typed value (a plan's snapshot
  // does not).
  assert.deepEqual(
    placeScoreSky({
      place: { id: "p" },
      model,
      knownPlaces: [{ id: "p", skyEntered: entered }],
    }),
    { sqm: 21.3, bortleClass: 4, source: "entered" },
  );
  const measures = {
    status: "fresh",
    list: {
      places: [
        {
          placeId: "p",
          measures: [
            {
              night: "2026-10-10",
              sqm: 20.0,
              poseCount: 12,
              observedAt: "2026-10-10T22:00:00.000Z",
            },
          ],
        },
      ],
    },
  };
  assert.deepEqual(
    placeScoreSky({
      place: { id: "p", skyEntered: entered },
      model,
      measures,
    }),
    { sqm: 20, bortleClass: 5, source: "measured" },
  );
  assert.equal(placeScoreSky({ place: { id: "p" } }), null);
  assert.equal(scoreSkyOfChoice(null), null);
});
