import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// "Autour de" starts on "Votre position"
// when no place of mine can be the start; the gap of sky is written — a
// title naming the reference, then "3,5 magnitudes plus sombre" — in the
// normal colour, explained behind the ⓘ and said in the same words on the
// place's own sheet. Rendered from synthetic data; nothing reaches the network.
await registerJsx();
const { PlacesSuggestedPane, SuggestedResults, placesSearchReference } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { normalizeSuggestedPlace, magnitudePluralCount } =
  await import("planner/places-rules.js");
const {
  skyComparisonSentence,
  skyDeltaBadgeLabel,
  skyDeltaExplanation,
  skyDeltaTitle,
} = await import("planner/places-copy.js");

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

const position = { latitude: 45.0018, longitude: -30 };
const col = {
  id: "col",
  name: "Col des Mélèzes",
  latitude: "45.3418",
  longitude: "-30",
  horizonStatus: "verified",
};
const settings = {
  around: null,
  radiusKm: 60,
  sort: "darkest",
  kinds: ["viewpoint", "campsite", "park"],
};
const pane = (props) =>
  render(PlacesSuggestedPane, {
    locale: "fr",
    places: [],
    settings,
    onSettings() {},
    client: { search: () => new Promise(() => {}) },
    onOpen() {},
    ...props,
  });

test("no place of mine and a position — the position is the start, really chosen", () => {
  const reference = placesSearchReference({
    locale: "fr",
    places: [],
    defaultPlaceId: null,
    around: null,
    position,
  });
  assert.equal(reference.name, "Votre position");
  assert.equal(reference.placeId, null);
  assert.equal(reference.latitude, position.latitude);
  const markup = pane({ position });
  assert.match(markup, /<option value="position" selected="">Votre position/);
  assert.doesNotMatch(markup, /Ajoutez un lieu ou autorisez votre position/);
  // The search is started: the page says so, it does not ask for a place.
  assert.match(textOf(markup), /Recherche des lieux…/);
});

test("a place of mine stays the default start, even with a position; « position » is chosen by hand", () => {
  assert.equal(
    placesSearchReference({
      locale: "fr",
      places: [col],
      defaultPlaceId: "col",
      around: null,
      position,
    }).placeId,
    "col",
  );
  assert.equal(
    placesSearchReference({
      locale: "fr",
      places: [col],
      defaultPlaceId: "col",
      around: "position",
      position,
    }).placeId,
    null,
  );
  // The position asked for but not known: the default place.
  assert.equal(
    placesSearchReference({
      locale: "fr",
      places: [col],
      defaultPlaceId: "col",
      around: "position",
      position: null,
    }).placeId,
    "col",
  );
});

test("neither a place nor a position — « — » and the sentence stay; while the browser answers, « Recherche de votre position… »", () => {
  const none = textOf(pane({}));
  assert.match(none, /— .*Ajoutez un lieu ou autorisez votre position/);
  assert.doesNotMatch(none, /Recherche de votre position/);
  const waiting = pane({ positionPending: true });
  assert.match(
    waiting,
    /<option value="" selected="">Recherche de votre position…/,
  );
  assert.match(
    waiting,
    /<div [^>]*data-locating[^>]*role="status"[^>]*>.*?data-brand-loader.*?Recherche de votre position…/s,
  );
  assert.doesNotMatch(waiting, /Ajoutez un lieu ou autorisez/);
  // With a place of mine there is nothing to wait for.
  assert.doesNotMatch(
    pane({ places: [col], positionPending: true }),
    /Recherche de votre position/,
  );
});

test("the plural is the language's own — « une magnitude » up to 1,99 in French and Portuguese, « 1,0 » is not « one » in English", () => {
  assert.equal(magnitudePluralCount("fr", 0.8), 1);
  assert.equal(magnitudePluralCount("fr", 1.5), 1);
  assert.equal(magnitudePluralCount("fr", 2), 2);
  assert.equal(magnitudePluralCount("pt-BR", 1.9), 1);
  assert.equal(magnitudePluralCount("en", 1), 2);
  assert.equal(magnitudePluralCount("ja", 0.8), 2);
  const darker = (delta) => ({ kind: "darker", delta });
  const col = { name: "Col des Mélèzes", placeId: "col" };
  assert.equal(
    skyDeltaTitle("fr", darker(0.8), col),
    "0,8 magnitude plus sombre que Col des Mélèzes",
  );
  assert.equal(
    skyDeltaTitle("fr", darker(1.5), col),
    "1,5 magnitude plus sombre que Col des Mélèzes",
  );
  assert.equal(
    skyDeltaTitle("fr", darker(3.5), col),
    "3,5 magnitudes plus sombre que Col des Mélèzes",
  );
  assert.equal(
    skyDeltaTitle("fr", { kind: "brighter", delta: 0.6 }, col),
    "0,6 magnitude plus clair que Col des Mélèzes",
  );
  assert.equal(
    skyDeltaTitle("fr", { kind: "comparable", delta: 0.1 }, col),
    "Ciel comparable",
  );
  assert.equal(
    skyDeltaTitle("en", darker(3.5), col),
    "3.5 magnitudes darker than Col des Mélèzes",
  );
  // The browser's own position is a common noun in the sentence.
  assert.equal(
    skyDeltaTitle("fr", darker(1.6), { name: "Votre position", placeId: null }),
    "1,6 magnitude plus sombre que votre position",
  );
  assert.equal(
    skyComparisonSentence("fr", darker(0.8), "Col des Mélèzes"),
    "0,8 magnitude plus sombre que Col des Mélèzes",
  );
  // The badge: the sign and the figure, in the language's decimals.
  assert.equal(skyDeltaBadgeLabel("fr", darker(3.5)), "−3,5");
  assert.equal(
    skyDeltaBadgeLabel("en", { kind: "brighter", delta: 0.6 }),
    "+0.6",
  );
  assert.equal(
    skyDeltaBadgeLabel("fr", { kind: "comparable", delta: 0.1 }),
    "≈ 0",
  );
});

test("the gap exists in the ten languages, whole — no placeholder left, the value in it", () => {
  for (const locale of Object.keys(messages)) {
    const place = { name: "Col", placeId: "col" };
    for (const kind of ["darker", "brighter"]) {
      for (const delta of [0.8, 3.5]) {
        const title = skyDeltaTitle(locale, { kind, delta }, place);
        assert.doesNotMatch(title, /[{}]/, `${locale} ${kind} ${delta}`);
        assert.match(title, delta === 0.8 ? /0[.,]8/ : /3[.,]5/);
        assert.ok(title.includes("Col"), `${locale}: ${title}`);
        const badge = skyDeltaBadgeLabel(locale, { kind, delta });
        assert.match(badge, kind === "darker" ? /^−/ : /^\+/, locale);
        assert.match(badge, delta === 0.8 ? /0[.,]8/ : /3[.,]5/);
        const sentence = skyComparisonSentence(locale, { kind, delta }, "Col");
        assert.doesNotMatch(sentence, /[{}]/, `${locale} sentence`);
      }
    }
    assert.doesNotMatch(
      skyDeltaExplanation(locale, place, { sqm: 20.9 }),
      /[{}]/,
    );
    assert.ok(
      skyDeltaExplanation(locale, place, { sqm: 20.9 }).includes("Col"),
    );
    for (const key of [
      "placesAroundSearching",
      "placesCompareExplainPosition",
      "placesCompareExplainPlace",
      "placesDeltaBadgeDarker",
      "placesDeltaBadgeBrighter",
      "placesDeltaBadgeComparable",
      "placesDeltaExplain",
      "placesDeltaColourNote",
      "placesDeltaClose",
    ])
      assert.ok(messages[locale][key], `${locale} ${key}`);
    // The old badge and the line that said the gap are gone.
    for (const key of [
      "placesDarker",
      "placesBrighter",
      "placesComparedTo",
      "placesCompareToPosition",
      "placesCompareToPlace",
      "placesDarkerTextOne",
      "placesDarkerTextMany",
      "placesBrighterTextOne",
      "placesBrighterTextMany",
    ])
      assert.equal(messages[locale][key], undefined, `${locale} ${key}`);
  }
});

const crest = normalizeSuggestedPlace({
  id: "osm:node/11",
  name: "Belvédère de la Crête",
  type: "viewpoint",
  latitude: 45.5037,
  longitude: -30,
  skyQuality: { bortle: 2, sqm: 21.7, estimate: true },
});
const results = (reference) =>
  render(SuggestedResults, {
    locale: "fr",
    outcome: {
      page: {
        places: [crest],
        truncated: false,
        fetchedAt: "2026-10-01T12:00:00Z",
      },
      failure: null,
    },
    reference,
    referenceSky: { bortle: 4, sqm: 20.9 },
    sort: "darkest",
    mine: [],
    onAdd() {},
    onOpen() {},
  });

test("a card says the gap in a signed badge at the left of the buttons — no line « Par rapport à », no colour class", () => {
  const markup = results({
    name: "Votre position",
    latitude: 45.0018,
    longitude: -30,
    placeId: null,
  });
  const text = textOf(markup);
  assert.match(
    text,
    /Bortle 2 · 21,70 mag\/arcsec² · estimation −0,8 Itinéraire Ajouter/,
  );
  assert.doesNotMatch(text, /Par rapport à/);
  assert.doesNotMatch(markup, /places-comparison/);
  assert.match(markup, /data-testid="places-delta"/);
  assert.match(markup, /class="places-delta-frame" data-kind="darker"/);
  // Its name says the gap, then what the badge does (the explanation).
  assert.match(
    markup,
    /aria-label="0,8 magnitude plus sombre que votre position\. Expliquer l’écart"/,
  );
  // The badge comes before the buttons in the line.
  assert.ok(
    markup.indexOf("places-delta-button") < markup.indexOf("places-route"),
  );
});

test("a place without a sky estimate shows no badge", () => {
  const bare = normalizeSuggestedPlace({
    id: "osm:node/12",
    name: "Sans estimation",
    type: "park",
    latitude: 45.4,
    longitude: -30,
  });
  const markup = render(SuggestedResults, {
    locale: "fr",
    outcome: {
      page: {
        places: [bare],
        truncated: false,
        fetchedAt: "2026-10-01T12:00:00Z",
      },
      failure: null,
    },
    reference: {
      name: "Col des Mélèzes",
      latitude: 45.3418,
      longitude: -30,
      placeId: "col",
    },
    referenceSky: { bortle: 4, sqm: 20.9 },
    sort: "darkest",
    mine: [],
    onAdd() {},
    onOpen() {},
  });
  assert.doesNotMatch(markup, /places-delta/);
});

test("the ⓘ of the line keeps the distances and the drive times only — the explanation of the gap moved to the badge", () => {
  const markup = results({
    name: "Votre position",
    latitude: 45.0018,
    longitude: -30,
    placeId: null,
  });
  // The dialog opens on a press: the line and its button are in the markup.
  assert.match(markup, /places-caption-info/);
  assert.ok(!markup.includes("veut dire un ciel"));
});

test("the place's own sheet says the gap in the same words, in the normal colour", () => {
  const markup = render(PlaceDetailView, {
    locale: "fr",
    mode: "suggested",
    place: crest,
    mine: null,
    reference: {
      name: "Col des Mélèzes",
      latitude: 45.3418,
      longitude: -30,
      placeId: "col",
    },
    referenceSky: { bortle: 4, sqm: 20.9 },
    sky: crest.sky,
    onBack() {},
    onAdd() {},
  });
  const text = textOf(markup);
  assert.match(text, /0,8 magnitude plus sombre que Col des Mélèzes/);
  assert.doesNotMatch(markup, /places-comparison-sentence is-darker/);
});
