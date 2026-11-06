import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The drive-time estimate, "Trajet" and "Meilleur cette nuit" on the web
// — read as text and markup, with synthetic places in the open Atlantic.
// Nothing is asked of the network.
await registerJsx();
const { SuggestedResults } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { normalizeSuggestedPlace } = await import("planner/places-rules.js");
const {
  driveByCarLabel,
  driveDurationLabel,
  placeRankFactsLabel,
  placesCaptionWords,
} = await import("planner/places-copy.js");
const { placeCloudKey, placesForecastBatch, readPlaceClouds } =
  await import("planner/places-forecast.js");
const { placeCloudOverNight, placesReferenceNight } =
  await import("planner/places-weather.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const node = (id, name, type, latitude, longitude, sqm) =>
  normalizeSuggestedPlace({
    id: `osm:node/${id}`,
    name,
    type,
    latitude,
    longitude,
    skyQuality: { bortle: 2, sqm, estimate: true },
  });
const crest = node(
  11,
  "Belvédère de la Crête",
  "viewpoint",
  45.5037,
  -30,
  21.7,
);
const lake = node(12, "Camping du Lac Noir", "campsite", 45.377, -29.606, 21.4);
const rocher = node(
  41,
  "Rocher des Trois Chouettes",
  "viewpoint",
  45.3418,
  -30.115,
  20.9,
);
const reference = {
  name: "Col des Mélèzes",
  latitude: 45.3418,
  longitude: -30,
  placeId: "col",
};
const night = {
  start: "2026-10-14T19:20:00.000Z",
  end: "2026-10-15T05:40:00.000Z",
};
const fresh = {
  page: {
    places: [rocher, lake, crest],
    truncated: false,
    fetchedAt: "2026-10-01T12:00:00.000Z",
  },
  failure: null,
};
const results = (props) =>
  render(SuggestedResults, {
    locale: "fr",
    outcome: fresh,
    reference,
    referenceSky: { bortle: 4, sqm: 20.9 },
    sort: "darkest",
    mine: [],
    onAdd() {},
    onOpen() {},
    ...props,
  });
const orderOf = (text) =>
  [crest, lake, rocher]
    .map((place) => [place.name, text.indexOf(place.name)])
    .sort((left, right) => left[1] - right[1])
    .map(([name]) => name);

test("each suggestion says its drive time, as an estimate, and the caption says so", () => {
  const text = textOf(results({}));
  assert.match(text, /Point de vue 18 km · ≈ 30 min Bortle 2/);
  assert.match(text, /Camping 31 km · ≈ 50 min/);
  assert.match(text, /Point de vue 9 km · ≈ 15 min/);
  // "Une ligne, puis ⓘ": the data warning stays visible in one line;
  // today's whole caption is behind the ⓘ, word for word.
  assert.match(
    text,
    /^3 lieux trouvés Distances à vol d’oiseau\. Temps de trajet estimés\. /,
  );
  assert.doesNotMatch(text, /Ciel comparé à/);
  assert.match(results({}), /<button type="button" class="info-button/);
  // With the reference's sky known, the ⓘ keeps the distances and the
  // drive times; what "3,5 magnitudes plus sombre" means moved to the
  // explanation of the gap badge.
  const withSky = placesCaptionWords("fr", {
    reference,
    referenceSky: { bortle: 4, sqm: 20.9 },
  });
  assert.deepEqual(withSky.paragraphs, [
    "Distances à vol d’oiseau. Temps de trajet estimés.",
  ]);
  assert.equal(withSky.detail, withSky.paragraphs.join(" "));
  assert.doesNotMatch(withSky.detail, /Ciel comparé à/);
  assert.equal(
    placesCaptionWords("fr", { reference }).detail,
    "Distances à vol d’oiseau depuis Col des Mélèzes. Temps de trajet estimés.",
  );
});

test("« Itinéraire » opens the directions of OpenStreetMap in a new tab, safely, on every row", () => {
  const markup = results({});
  const links = [...markup.matchAll(/<a [^>]*places-route[^>]*>/g)].map(
    (match) => match[0],
  );
  assert.equal(links.length, 3);
  const first = links.find((link) => link.includes("45.5037"));
  assert.match(
    first,
    /href="https:\/\/www\.openstreetmap\.org\/directions\?to=45\.5037,-30"/,
  );
  assert.match(first, /target="_blank"/);
  assert.match(first, /rel="noopener noreferrer"/);
  assert.match(first, /class="btn-secondary places-route"/);
  assert.match(
    first,
    /aria-label="Itinéraire vers Belvédère de la Crête \(s’ouvre dans un nouvel onglet\)"/,
  );
  // The button says nothing about the duration.
  assert.doesNotMatch(first, /min/);
});

test("« Meilleur cette nuit » reorders by tonight's weather, the sky and the drive, and shows the three facts", () => {
  const clouds = {
    [crest.id]: 70,
    [lake.id]: 12,
    [rocher.id]: 40,
  };
  const markup = results({ sort: "bestTonight", clouds, night });
  const text = textOf(markup);
  assert.deepEqual(orderOf(text), [
    "Camping du Lac Noir",
    "Rocher des Trois Chouettes",
    "Belvédère de la Crête",
  ]);
  assert.match(
    text,
    /Classés selon la météo de cette nuit, le ciel et le temps de trajet \(estimations\)\./,
  );
  // The ranked caption replaces the distances line; the whole caption is
  // behind the ⓘ.
  assert.doesNotMatch(text, /Distances à vol d’oiseau\. Temps de trajet/);
  // Line 4 keeps only what lines 2–3 do not say: the Bortle class and
  // the drive time are on the kind and sky lines already.
  assert.ok(text.includes("Nuages 12 % en moyenne cette nuit"));
  assert.doesNotMatch(text, /Nuages \d+ % en moyenne cette nuit ·/);
  assert.ok(text.includes("Nuages 70 % en moyenne cette nuit"));
  // Never an opaque score.
  assert.doesNotMatch(text, /\/ ?100|points|score/i);
});

test("the ranking waits for the forecasts: « Calcul du classement… », no row yet", () => {
  const markup = results({ sort: "bestTonight", clouds: null, night });
  assert.match(textOf(markup), /Calcul du classement…/);
  assert.doesNotMatch(markup, /places-card/);
  assert.match(markup, /role="status"/);
});

test("a place without a forecast is listed after the ranked ones and says so", () => {
  const text = textOf(
    results({
      sort: "bestTonight",
      clouds: { [lake.id]: 30, [rocher.id]: 80 },
      night,
    }),
  );
  assert.deepEqual(orderOf(text), [
    "Camping du Lac Noir",
    "Rocher des Trois Chouettes",
    "Belvédère de la Crête",
  ]);
  assert.ok(text.includes("Prévision indisponible"));
  assert.doesNotMatch(text, /Prévision indisponible ·/);
});

test("without any forecast the list falls back to the darkest sky and says so", () => {
  const text = textOf(results({ sort: "bestTonight", clouds: {}, night }));
  assert.match(text, /Prévisions indisponibles\./);
  assert.deepEqual(orderOf(text), [
    "Belvédère de la Crête",
    "Camping du Lac Noir",
    "Rocher des Trois Chouettes",
  ]);
  assert.doesNotMatch(text, /Nuages \d+ %/);
  assert.doesNotMatch(text, /Classés selon/);
});

test("offline: no ranking, the kept suggestions still say their drive time and open the route", () => {
  const markup = results({
    sort: "bestTonight",
    clouds: null,
    night,
    outcome: { ...fresh, failure: "offline" },
  });
  const text = textOf(markup);
  assert.doesNotMatch(text, /Calcul du classement/);
  assert.match(text, /Hors ligne — résultats du/);
  assert.match(text, /Point de vue 18 km · ≈ 30 min/);
  assert.equal((markup.match(/places-route/g) || []).length >= 3, true);
  assert.deepEqual(orderOf(text), [
    "Belvédère de la Crête",
    "Camping du Lac Noir",
    "Rocher des Trois Chouettes",
  ]);
});

test("the detail adds « Trajet · ≈ 30 min en voiture · estimation » after the distance, and keeps « Itinéraire »", () => {
  const text = textOf(
    render(PlaceDetailView, {
      locale: "fr",
      mode: "suggested",
      place: crest,
      mine: null,
      reference,
      referenceSky: { bortle: 4, sqm: 20.9 },
      sky: crest.sky,
      onBack() {},
      onAdd() {},
    }),
  );
  assert.match(
    text,
    /Distance 18 km à vol d’oiseau de Col des Mélèzes Altitude .*Trajet · ≈ 30 min en voiture · estimation/,
  );
  assert.match(text, /Itinéraire/);
});

test("long and short durations are written in the three languages", () => {
  assert.equal(driveDurationLabel("fr", 0), "moins de 5 min");
  // One duration writing from the first hour (U4): "≈ 1 h 10", never
  // "≈ 70 min".
  assert.equal(driveDurationLabel("fr", 70), "≈ 1\u00a0h\u00a010");
  assert.equal(driveDurationLabel("fr", 115), "≈ 1\u00a0h\u00a055");
  assert.equal(driveDurationLabel("fr", 120), "≈ 2\u00a0h");
  assert.equal(driveDurationLabel("fr", 135), "≈ 2\u00a0h\u00a015");
  assert.equal(driveDurationLabel("fr", 125), "≈ 2\u00a0h\u00a005");
  assert.equal(driveByCarLabel("fr", 30), "≈ 30\u00a0min en voiture");
  assert.equal(
    driveByCarLabel("en", 135),
    "≈ 2\u00a0h\u00a015\u00a0min by car",
  );
  assert.equal(driveByCarLabel("ja", 30), "車で約30分");
  assert.equal(driveByCarLabel("ja", 125), "車で約2時間5分");
  assert.equal(
    placeRankFactsLabel("en", { hasForecast: true, cloud: 12, minutes: 30 }),
    "Clouds 12% on average tonight",
  );
  assert.equal(
    placeRankFactsLabel("fr", { hasForecast: false, cloud: null }),
    "Prévision indisponible",
  );
});

test("every new word exists in the three languages", () => {
  const keys = Object.keys(messages.fr).filter((key) =>
    /^(placesDrive|placesRoute|placesSortBestTonight|placesBestTonight|placesRanking|placesForecast|placesFact|placesByCar|placeDriveTimeLine)/.test(
      key,
    ),
  );
  // "placesDriveHours" and "placesDriveHoursSharp" gave way to one
  // "placesDriveApprox" filled by the duration writing (U4).
  assert.ok(keys.length >= 15, keys.join());
  for (const locale of ["en", "ja"])
    for (const key of keys)
      assert.ok(
        typeof messages[locale][key] === "string" && messages[locale][key],
        `${locale}.${key}`,
      );
});

test("the forecasts are read five at a time and kept for the session", async () => {
  const places = Array.from({ length: 12 }, (_, index) => ({
    id: `osm:node/${300 + index}`,
    latitude: 45 + index / 100,
    longitude: -30,
  }));
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const hourly = {
    time: [1792000800, 1792004400, 1792008000],
    cloud_cover: [10, 20, 30],
  };
  const request = async () => {
    calls += 1;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((resolve) => setTimeout(resolve, 3));
    running -= 1;
    return { hourly };
  };
  const session = new Map();
  const window = {
    start: "2026-10-14T17:50:00.000Z",
    end: "2026-10-14T20:10:00.000Z",
  };
  const clouds = await readPlaceClouds({
    places,
    night: window,
    request,
    session,
  });
  assert.equal(calls, 12);
  assert.equal(maxRunning, placesForecastBatch);
  assert.equal(Object.keys(clouds).length, 12);
  assert.equal(clouds[places[0].id], 20);
  // The session knows them all: nothing is asked again.
  await readPlaceClouds({ places, night: window, request, session });
  assert.equal(calls, 12);
  assert.ok(session.has(placeCloudKey(places[0], window)));
  // A read that failed is absent, and asked again next time.
  const broken = await readPlaceClouds({
    places: places.slice(0, 2),
    night: { ...window, end: "2026-10-14T19:10:00.000Z" },
    request: async () => {
      throw new Error("offline");
    },
    session: new Map(),
  });
  assert.deepEqual(broken, {});
});

test("the night of the ranking is the reference place's astronomical night; a forecast outside it counts for nothing", () => {
  const place = { latitude: 45.3418, longitude: -30, timeZone: "Etc/GMT+2" };
  const found = placesReferenceNight({
    place,
    now: Date.parse("2026-10-14T14:00:00Z"),
  });
  assert.ok(Date.parse(found.start) < Date.parse(found.end));
  assert.equal(
    placesReferenceNight({ place: { latitude: "x", longitude: "y" } }),
    null,
  );
  assert.equal(
    placeCloudOverNight({
      hourly: { time: [1, 2], cloud_cover: [10, 20] },
      night: found,
    }),
    null,
  );
});
