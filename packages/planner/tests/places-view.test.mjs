import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// "Lieux" on the web — "Mes lieux", "Lieux suggérés" and the detail of a
// place — read as text and markup, in the specified words. The components
// are rendered from synthetic data (invented names, a position in the open
// Atlantic); nothing is asked of the network.
await registerJsx();
// A horizon really recorded: one direction rises above 0° (a mask whose points
// are all 0° records nothing).
const surveyedHorizon = {
  enabled: true,
  points: Array.from({ length: 36 }, (_, index) => ({
    azimuth: index * 10,
    altitude: index === 9 ? 12 : 0,
  })),
};

const { MyPlacesList } = await import("planner/components/PlacesView.js");
const { SuggestedResults, PlacesFailureNotice } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { normalizeSuggestedPlace } = await import("planner/places-rules.js");

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

const link = (id, type) => ({
  source: "osm",
  id,
  type,
  linkedAt: "2026-09-20T18:00:00.000Z",
});
const col = {
  id: "col",
  name: "Col des Mélèzes",
  latitude: "45.3418",
  longitude: "-30",
  horizonStatus: "verified",
  horizonMask: surveyedHorizon,
};
const lac = {
  id: "lac",
  name: "Camping du Lac Noir",
  latitude: "45.377",
  longitude: "-29.606",
  horizonStatus: "unverified",
  knownPlace: link("node/12", "campsite"),
};
const jardin = {
  id: "jardin",
  name: "Jardin de la maison",
  latitude: "45.0018",
  longitude: "-30",
  horizonStatus: "verified",
  horizonMask: surveyedHorizon,
};
const mine = [col, lac, jardin];
const skies = {
  col: { bortle: 4, sqm: 20.9 },
  lac: { bortle: 3, sqm: 21.4 },
  jardin: { bortle: 6, sqm: 19 },
};
const node = (id, name, type, latitude, longitude, sqm, extra = {}) =>
  normalizeSuggestedPlace({
    id: `osm:node/${id}`,
    name,
    type,
    latitude,
    longitude,
    ...extra,
    skyQuality: { bortle: 2, sqm, estimate: true },
  });
const crest = node(
  11,
  "Belvédère de la Crête",
  "viewpoint",
  45.5037,
  -30,
  21.7,
  {
    website: "https://exemple.invalid/crete",
    access: "yes",
    elevation: 1720,
  },
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
    mine,
    onAdd() {},
    onOpen() {},
    ...props,
  });

test("« Mes lieux »: the count from the position, each place with its kind, distance, sky and tags, in the order of the document", () => {
  const markup = render(MyPlacesList, {
    locale: "fr",
    places: mine,
    defaultId: "col",
    position: { latitude: 45, longitude: -30 },
    skies,
    onOpen() {},
    onNewPlace() {},
  });
  const text = textOf(markup);
  assert.match(
    text,
    /^3 lieux · distances à vol d’oiseau depuis votre position/,
  );
  const order = [
    "Col des Mélèzes",
    "Camping du Lac Noir",
    "Jardin de la maison",
  ].map((name) => text.indexOf(name));
  assert.ok(
    order.every((at, index) => at >= 0 && (!index || at > order[index - 1])),
    order.join(),
  );
  assert.match(
    text,
    /Col des Mélèzes Privé 38 km Bortle 4 · 20,9 mag\/arcsec² · estimation Lieu par défaut Horizon relevé/,
  );
  assert.match(
    text,
    /Camping du Lac Noir Camping 52 km Bortle 3 · 21,4 mag\/arcsec² · estimation Horizon à relever/,
  );
  assert.match(
    text,
    /Jardin de la maison Privé 0,2 km Bortle 6 · 19,0 mag\/arcsec² · estimation Horizon relevé/,
  );
  assert.equal((markup.match(/Lieu par défaut/g) || []).length, 1);
  assert.match(text, /Ajouter un lieu$/);
  assert.equal((markup.match(/btn-primary/g) || []).length, 1, "one primary");
});

test("« Mes lieux » without a position measures from the default place, which has no distance of its own", () => {
  const text = textOf(
    render(MyPlacesList, {
      locale: "fr",
      places: mine,
      defaultId: "col",
      position: null,
      skies,
      onOpen() {},
      onNewPlace() {},
    }),
  );
  assert.match(
    text,
    /3 lieux · distances à vol d’oiseau depuis votre lieu par défaut/,
  );
  assert.match(text, /Col des Mélèzes Privé Bortle 4/);
  assert.match(text, /Camping 31 km/);
  // The gap to the default place in front of the state tags (the same
  // treatment as the suggested places); none on the default place itself.
  assert.match(
    text,
    /Camping du Lac Noir Camping 31 km Bortle 3 · 21,4 mag\/arcsec² · estimation −0,5 Horizon à relever/,
  );
  assert.match(
    text,
    /Jardin de la maison Privé 38 km Bortle 6 · 19,0 mag\/arcsec² · estimation \+1,9 Horizon relevé/,
  );
  assert.match(
    text,
    /Col des Mélèzes Privé Bortle 4 · 20,9 mag\/arcsec² · estimation Lieu par défaut/,
  );
  // No place yet: the count says so and the add button stays.
  const empty = textOf(
    render(MyPlacesList, {
      locale: "fr",
      places: [],
      defaultId: null,
      position: null,
      skies: {},
      onOpen() {},
      onNewPlace() {},
    }),
  );
  assert.match(empty, /Aucun lieu · .*Aucun lieu enregistré\. Ajouter un lieu/);
});

test("« Lieux suggérés »: darkest first with the comparison of each sky, « Déjà dans vos lieux » for the place that is mine", () => {
  const text = textOf(results({}));
  assert.match(
    text,
    /^3 lieux trouvés Distances à vol d’oiseau\. Temps de trajet estimés\./,
  );
  const order = [
    "Belvédère de la Crête",
    "Camping du Lac Noir",
    "Rocher des Trois Chouettes",
  ].map((name) => text.indexOf(name));
  assert.ok(
    order.every((at, index) => at >= 0 && (!index || at > order[index - 1])),
    order.join(),
  );
  assert.match(
    text,
    /Belvédère de la Crête Point de vue 18 km · ≈ 30 min Bortle 2 · 21,70 mag\/arcsec² · estimation Accès libre −0,8 Itinéraire Ajouter/,
  );
  assert.match(
    text,
    /Camping du Lac Noir Camping 31 km · ≈ 50 min Bortle 2 · 21,40 mag\/arcsec² · estimation −0,5 Déjà dans vos lieux Itinéraire/,
  );
  assert.match(
    text,
    /Rocher des Trois Chouettes Point de vue 9 km · ≈ 15 min Bortle 2 · 20,90 mag\/arcsec² · estimation Ciel comparable Itinéraire Ajouter/,
  );
  assert.equal((text.match(/Déjà dans vos lieux/g) || []).length, 1);
  assert.match(
    text,
    /Accès, horaires et sécurité de nuit non vérifiés\. Lieux : © OpenStreetMap contributors \(ODbL\)$/,
  );
});

test("« Lieux suggérés » by distance puts the nearest first", () => {
  const text = textOf(results({ sort: "distance" }));
  assert.ok(
    text.indexOf("Rocher des Trois Chouettes") <
      text.indexOf("Camping du Lac Noir"),
  );
  assert.ok(
    text.indexOf("Belvédère de la Crête") < text.indexOf("Camping du Lac Noir"),
  );
});

test("the attribution is on every state that shows places, and opens the licence in a new tab safely", () => {
  const states = {
    fresh: results({}),
    offline: results({ outcome: { ...fresh, failure: "offline" } }),
    "no result": results({
      outcome: {
        page: {
          places: [],
          truncated: false,
          fetchedAt: "2026-10-01T12:00:00.000Z",
        },
        failure: null,
      },
    }),
    "nothing kept": results({ outcome: { page: null, failure: "source" } }),
  };
  for (const [state, markup] of Object.entries(states)) {
    assert.match(
      textOf(markup),
      /Lieux : © OpenStreetMap contributors \(ODbL\)/,
      state,
    );
    assert.match(
      markup,
      /<a href="https:\/\/www\.openstreetmap\.org\/copyright" target="_blank" rel="noopener noreferrer">/,
      state,
    );
  }
  const english = textOf(
    render(SuggestedResults, {
      locale: "en",
      outcome: fresh,
      reference,
      referenceSky: null,
      sort: "darkest",
      mine: [],
      onAdd() {},
      onOpen() {},
    }),
  );
  assert.match(english, /Places: © OpenStreetMap contributors/);
  const japanese = textOf(
    render(SuggestedResults, {
      locale: "ja",
      outcome: fresh,
      reference,
      referenceSky: null,
      sort: "darkest",
      mine: [],
      onAdd() {},
      onOpen() {},
    }),
  );
  assert.match(japanese, /© OpenStreetMap contributors \(ODbL\)/);
});

test("offline: the connection is asked for and the last results are kept with their date", () => {
  const text = textOf(results({ outcome: { ...fresh, failure: "offline" } }));
  assert.match(
    text,
    /^Hors ligne — résultats du 1 octobre 2026 3 lieux trouvés/,
  );
  const nothing = textOf(
    results({ outcome: { page: null, failure: "offline" } }),
  );
  assert.match(
    nothing,
    /^La recherche de lieux demande une connexion\. Lieux : ©/,
  );
  assert.doesNotMatch(nothing, /lieux trouvés|Derniers résultats/);
});

test("the source down, the search switched off and no result each say so", () => {
  assert.match(
    textOf(render(PlacesFailureNotice, { locale: "fr", failure: "source" })),
    /La source des lieux ne répond pas pour le moment\./,
  );
  assert.match(
    textOf(render(PlacesFailureNotice, { locale: "fr", failure: "disabled" })),
    /Ce service ne propose pas la recherche de lieux\./,
  );
  const none = textOf(
    results({
      outcome: {
        page: {
          places: [],
          truncated: false,
          fetchedAt: "2026-10-01T12:00:00.000Z",
        },
        failure: null,
      },
    }),
  );
  assert.match(
    none,
    /Aucun lieu trouvé Distances à vol d’oiseau\. Temps de trajet estimés\. Aucun lieu trouvé dans ce rayon\. Élargissez le rayon ou ajoutez des types de lieux\./,
  );
  // While the service is asked: the loading star, then the sentence.
  const asking = results({ outcome: null });
  assert.ok(asking.includes("data-brand-loader"));
  assert.match(textOf(asking), /Recherche des lieux…$/);
});

const detail = (props) =>
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
    ...props,
  });

test("the detail of a suggested place follows the specified layout: sky card, figures, weather, horizon, facts, source, the two actions", () => {
  const markup = detail({});
  const text = textOf(markup);
  for (const expected of [
    "Lieu suggéré",
    "Point de vue",
    "Belvédère de la Crête",
    "Qualité du ciel estimation Bortle 2 21,7 mag/arcsec²",
    "18 · ciel urbain ciel très sombre · 22",
    "0,8 magnitude plus sombre que Col des Mélèzes",
    "Distance 18 km à vol d’oiseau de Col des Mélèzes",
    "Altitude 1 720 m approximative",
    "Horizon : à relever sur place Possible une fois le lieu ajouté.",
    "À savoir Type Point de vue Site internet Ouvrir le site Horaires Non renseigné Accès Accès libre",
    "Informations non vérifiées, à confirmer avant de partir.",
    "Source : © OpenStreetMap contributors (ODbL)",
  ])
    assert.ok(
      text.replace(/\u202f/g, " ").includes(expected),
      `« ${expected} » is shown`,
    );
  // "Voir la météo de ce soir" is gone.
  assert.ok(!text.includes("Voir la météo de ce soir"));
  assert.match(
    markup,
    /aria-label="21,7 mag\/arcsec² sur une échelle de 18 à 22"/,
  );
  // The primary adds; the secondary opens the directions in a new tab
  // ("Itinéraire" on the left with the glyph of the cards, the add on the
  // right with its "+").
  assert.match(
    markup,
    /<button type="button" class="btn-primary"><svg[^>]*>[\s\S]*?<\/svg>Ajouter à mes lieux<\/button>/,
  );
  assert.match(
    markup,
    /<a class="btn-secondary places-route" href="https:\/\/www\.openstreetmap\.org\/directions\?to=45\.5037,-30" target="_blank" rel="noopener noreferrer"/,
  );
  assert.match(
    markup,
    /<a class="btn-link" href="https:\/\/exemple\.invalid\/crete" target="_blank" rel="noopener noreferrer"/,
  );
  assert.equal((markup.match(/btn-primary/g) || []).length, 1);
});

test("a suggestion that is already mine has no « Ajouter à mes lieux »; a linked place reads « Détails du lieu »", () => {
  const already = detail({ mine: lac });
  assert.ok(!textOf(already).includes("Ajouter à mes lieux"));
  assert.match(textOf(already), /Déjà dans vos lieux/);
  const linked = textOf(
    detail({ mode: "linked", mine: lac, place: lake, sky: lake.sky }),
  );
  assert.match(linked, /^Retour Détails du lieu/);
  assert.ok(!linked.includes("Ajouter à mes lieux"));
  assert.ok(
    !linked.includes("Possible une fois le lieu ajouté"),
    "the horizon is the place's own",
  );
  assert.match(linked, /Horizon : à relever sur place/);
  // Offline, the details of the source cannot be read: said, and no "À savoir".
  const offline = textOf(
    detail({
      mode: "linked",
      mine: lac,
      place: lake,
      sky: lake.sky,
      failure: "offline",
    }),
  );
  assert.match(offline, /Les détails ne peuvent pas être lus pour le moment\./);
  assert.ok(!offline.includes("À savoir"));
  assert.match(offline, /Source : © OpenStreetMap contributors \(ODbL\)/);
});

test("a place the source dropped says so, keeps the attribution and offers no facts; the personal place is left alone", () => {
  const text = textOf(
    detail({
      mode: "linked",
      mine: lac,
      place: { ...lake, website: undefined },
      failure: "gone",
    }),
  );
  assert.match(text, /Ce lieu n’est plus proposé par la source\./);
  assert.ok(!text.includes("À savoir"));
  assert.ok(
    !text.includes("Camping Camping"),
    "no kind tag for a place that is gone",
  );
  assert.match(text, /Source : © OpenStreetMap contributors \(ODbL\)/);
  assert.match(text, /Camping du Lac Noir/);
});

test("every word of the places screens exists in the three languages and keeps the app's vocabulary", () => {
  const keys = Object.keys(messages.en).filter(
    (key) =>
      /^(places|placePicker|place[A-Z])/.test(key) || key === "plannerPlaces",
  );
  assert.ok(keys.length > 100, `${keys.length} keys`);
  for (const key of keys)
    for (const locale of ["fr", "en", "ja"]) {
      assert.ok(messages[locale][key], `${locale}.${key}`);
      if (locale === "fr")
        assert.doesNotMatch(
          messages.fr[key],
          /portail|(?<!\p{L})comptes?(?!\p{L})|appair|dissoci/iu,
          key,
        );
    }
  assert.equal(
    messages.fr.placesAttribution,
    "© contributeurs d’OpenStreetMap",
  );
  assert.equal(messages.en.placesAttribution, "© OpenStreetMap contributors");
});

test("the ODbL credit is invariant in every shipped locale, outside translated prose", async () => {
  const { shippedLocales } = await import("astro-contracts/locales");
  const { PlaceAttribution } =
    await import("planner/components/PlacesParts.js");
  const { placesAttributionCredit } = await import("planner/places-rules.js");
  assert.equal(placesAttributionCredit, "© OpenStreetMap contributors (ODbL)");
  for (const locale of shippedLocales()) {
    const markup = render(PlaceAttribution, { locale });
    assert.ok(textOf(markup).endsWith(placesAttributionCredit), locale);
    assert.match(markup, /href="https:\/\/www.openstreetmap.org\/copyright"/);
    assert.match(markup, /rel="noopener noreferrer"/);
  }
});
