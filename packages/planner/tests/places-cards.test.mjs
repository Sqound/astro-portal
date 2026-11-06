import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The type badge, the signed gap badge and its explanation, the source's
// description, access and fee, "Itinéraire" secondary and "Ajouter"
// primary. Rendered from synthetic data; nothing reaches the network.
await registerJsx();
const { SuggestedResults } =
  await import("planner/components/PlacesSuggestedPane.js");
const { PlaceDetailView } =
  await import("planner/components/PlaceSuggestedDetail.js");
const { SkyDeltaDialogBody, PlaceKindBadge } =
  await import("planner/components/PlacesParts.js");
const { normalizeSuggestedPlace, placeKindTones, skyDeltaTone, compareSky } =
  await import("planner/places-rules.js");

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

const reference = {
  name: "Jardin de la maison",
  latitude: 45,
  longitude: -30,
  placeId: "jardin",
};
const camp = normalizeSuggestedPlace({
  id: "osm:node/21",
  name: "Camping des Hauts Prés",
  type: "campsite",
  latitude: 45.4,
  longitude: -30,
  description: "Terrain en lisière de forêt, dégagé vers le sud.",
  access: "customers",
  fee: "yes",
  skyQuality: { bortle: 2, sqm: 21.9, estimate: true },
});
const bare = normalizeSuggestedPlace({
  id: "osm:node/22",
  name: "Aire du Rocher",
  type: "picnic",
  latitude: 45.3,
  longitude: -30,
});
const results = (places) =>
  render(SuggestedResults, {
    locale: "fr",
    outcome: {
      page: { places, truncated: false, fetchedAt: "2026-10-01T12:00:00Z" },
      failure: null,
    },
    reference,
    referenceSky: { bortle: 7, sqm: 18.4 },
    sort: "darkest",
    mine: [],
    onAdd() {},
    onOpen() {},
  });

test("the gap colour is a continuous gradient and the ± 0,2 band is « ≈ 0 »", () => {
  // The seuil of "Ciel comparable" (placesComparableMag): 0,2 is comparable,
  // 0,3 is not.
  assert.equal(compareSky(20.6, 20.4).kind, "comparable");
  assert.equal(compareSky(20.7, 20.4).kind, "darker");
  assert.equal(compareSky(20.4, 20.7).kind, "brighter");
  const darker = (delta) => skyDeltaTone({ kind: "darker", delta });
  const brighter = (delta) => skyDeltaTone({ kind: "brighter", delta });
  // The steps: grey, light green, success, excellent; amber, soft red; the ends
  // hold beyond 3,5 and 2.
  assert.equal(skyDeltaTone({ kind: "comparable", delta: 0.1 }), "#9ca5a3");
  assert.equal(darker(1), "#b7d39f");
  assert.equal(darker(2), "#77bd91");
  assert.equal(darker(3.5), "#9cf2b8");
  assert.equal(darker(4), "#9cf2b8");
  assert.equal(brighter(1), "#e1b868");
  assert.equal(brighter(2), "#ef7065");
  assert.equal(brighter(3), "#ef7065");
  // Between the steps, a mix — the values at −3,0 and +0,5.
  assert.equal(darker(3), "#90e0ab");
  assert.equal(brighter(0.5), "#bfaf86");
  // Never the same colour twice along the way.
  const along = [0.3, 0.6, 1, 1.5, 2, 2.5, 3, 3.5].map(darker);
  assert.equal(new Set(along).size, along.length);
});

test("each of the five types is a badge in its own token, the name written", () => {
  const tones = new Set();
  for (const kind of ["private", "campsite", "viewpoint", "park", "picnic"]) {
    const markup = render(PlaceKindBadge, { locale: "fr", kind });
    assert.match(markup, new RegExp(`data-kind="${kind}"`));
    assert.ok(markup.includes(`--tone:${placeKindTones[kind]}`), kind);
    assert.ok(textOf(markup).length > 0);
    tones.add(placeKindTones[kind]);
  }
  assert.equal(tones.size, 5);
});

test("the card shows the source's description (as written), access and fee, « Itinéraire » secondary and « Ajouter » primary", () => {
  const markup = results([camp, bare]);
  const text = textOf(markup);
  assert.match(
    text,
    /Camping des Hauts Prés Camping 44 km · ≈ 1 h 10 Bortle 2 · 21,90 mag\/arcsec² · estimation Terrain en lisière de forêt, dégagé vers le sud\. Réservé aux clients Payant −3,5 Itinéraire Ajouter/,
  );
  assert.match(markup, /class="btn-secondary places-route"/);
  assert.match(markup, /<button type="button" class="btn-primary"/);
  assert.doesNotMatch(markup, /btn-tertiary/);
  // A source that says nothing leaves the card at its three lines, with no
  // badge for a sky that is not estimated.
  const rocher = markup.slice(markup.indexOf("Aire du Rocher"));
  assert.doesNotMatch(
    rocher,
    /places-description|places-source-facts|places-delta/,
  );
});

test("the explanation names the gap, the place, the reference, both skies on the scale and the colour", () => {
  const comparison = compareSky(21.9, 18.4);
  const markup = render(SkyDeltaDialogBody, {
    locale: "fr",
    comparison,
    place: { name: "Camping des Hauts Prés", sqm: 21.9 },
    reference,
    referenceSky: { bortle: 7, sqm: 18.4 },
  });
  const text = textOf(markup);
  assert.match(
    text,
    /^−3,5 Camping des Hauts Prés Par rapport à Jardin de la maison/,
  );
  assert.match(text, /18,4 mag\/arcsec², estimation\)/);
  assert.match(text, /Jardin de la maison · 18,4 mag\/arcsec²/);
  assert.match(text, /Camping des Hauts Prés · 21,9 mag\/arcsec²/);
  assert.match(
    text,
    /La couleur du badge suit l’écart : vert pour un ciel plus sombre, ambre pour un ciel plus clair\. Le signe et le nombre disent la même chose\.$/,
  );
  assert.equal((markup.match(/places-scale-marker/g) || []).length, 2);
  assert.match(markup, /places-scale-marker is-reference/);
});

test("the page of a suggestion carries the description at the head of « À savoir » and a « Tarif » row under « Accès »; the source says « Non renseigné » otherwise", () => {
  const detail = (place) =>
    render(PlaceDetailView, {
      locale: "fr",
      mode: "suggested",
      place,
      mine: null,
      reference,
      referenceSky: { bortle: 7, sqm: 18.4 },
      sky: place.sky,
      onBack() {},
      onAdd() {},
    });
  const text = textOf(detail(camp));
  assert.match(
    text,
    /À savoir Terrain en lisière de forêt, dégagé vers le sud\. Type Camping Site internet Non renseigné Horaires Non renseigné Accès Réservé aux clients Tarif Payant/,
  );
  // The badge of the sky card, with the gap in words.
  assert.match(text, /3,5 magnitudes plus sombre que Jardin de la maison −3,5/);
  const empty = textOf(detail(bare));
  assert.match(empty, /Accès Non renseigné Tarif Non renseigné/);
  assert.doesNotMatch(empty, /places-description/);
  // "Itinéraire" secondary, "Ajouter à mes lieux" primary (the same pair as
  // the card).
  const markup = detail(camp);
  assert.match(markup, /class="btn-secondary places-route"/);
  assert.match(markup, /btn-primary/);
});

test("the gap badge keeps a 44 px target around its 24 px frame, the type badge its 24 px", () => {
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.places-delta-button \{[^}]*min-height: 2\.75rem;/);
  assert.match(css, /\.places-kind-badge \{[^}]*min-height: 1\.5rem;/);
});
