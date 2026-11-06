// "Mes lieux" on the web — the cards
// of the suggested places' article (type of the place itself, "Bortle N · valeur
// · source", the pills), "Doublon possible" and its one line + ⓘ, the visitor's
// one line, two columns at 1 280 px. Synthetic places; no network.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "portal/locales.js";
import { message } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

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

const render = (props) =>
  renderToStaticMarkup(createElement(MyPlacesList, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const col = {
  id: "col",
  name: "Col des Étoiles",
  latitude: "45",
  longitude: "-30",
  kind: "viewpoint",
  horizonStatus: "verified",
  horizonMask: surveyedHorizon,
};
const lac = {
  id: "lac",
  name: "Camping du Lac Noir",
  latitude: "45.4",
  longitude: "-30.4",
  kind: "campsite",
  horizonStatus: "unverified",
};
const jardin = {
  id: "jardin",
  name: "Jardin de la maison",
  latitude: "45.1",
  longitude: "-30.1",
  horizonStatus: "verified",
  horizonMask: surveyedHorizon,
};
const skies = {
  col: { bortle: 3, sqm: 21.5 },
  lac: { bortle: 3, sqm: 21.4 },
  jardin: { bortle: 6, sqm: 19 },
};
const base = {
  locale: "fr",
  places: [col, lac, jardin],
  defaultId: "col",
  position: null,
  skies,
  onOpen() {},
  onNewPlace() {},
};

test("a card says the place's own type and distance, then its sky and horizon, in the suggested places' article", () => {
  const markup = render(base);
  const text = textOf(markup);
  assert.match(
    text,
    /Col des Étoiles Point de vue Bortle 3 · 21,5 mag\/arcsec²/,
  );
  assert.match(text, /Camping du Lac Noir Camping \d+ km Bortle 3/);
  // A place without a type is private; the default has no distance.
  assert.match(text, /Jardin de la maison Privé \d+ km Bortle 6/);
  assert.match(
    textOf(markup.split('data-place-id="col"')[1].split("</li>")[0]),
    /^.*Lieu par défaut/,
  );
  assert.ok(
    !/Col des Étoiles Point de vue \d+ km/.test(text),
    "the default place has no distance",
  );
  assert.equal((markup.match(/Horizon relevé/g) || []).length, 2);
  assert.equal((markup.match(/Horizon à relever/g) || []).length, 1);
});

test("the type is the place's kind, chosen or filled by the link, never an invented one", () => {
  const linked = {
    ...jardin,
    id: "lien",
    kind: undefined,
    knownPlace: {
      source: "osm",
      id: "node/12",
      type: "park",
      linkedAt: "2026-09-20T18:00:00.000Z",
    },
  };
  const text = textOf(
    render({ ...base, places: [linked], skies: { lien: skies.jardin } }),
  );
  assert.match(text, /Parc/);
});

test("two places that look the same carry « Doublon possible » and one line, then ⓘ", () => {
  const twin = {
    ...col,
    id: "col-2",
    latitude: "45.00036",
    horizonStatus: "unverified",
  };
  const markup = render({
    ...base,
    places: [col, twin, lac],
    skies: { ...skies, "col-2": skies.col },
  });
  assert.equal((markup.match(/Doublon possible/g) || []).length >= 2, true);
  const flagged = markup.match(/places-tag[^>]*>Doublon possible/g) || [];
  assert.equal(flagged.length, 2, "a pill on each of the two cards");
  assert.match(
    textOf(markup),
    /Deux lieux semblent identiques : « Col des Étoiles » et « Col des Étoiles », à 40 m l’un de l’autre\./,
  );
  assert.match(markup, /class="info-line places-duplicate-line"/);
  assert.match(markup, /data-testid="places-duplicate-info"|aria-label/);
});

test("without duplicates there is no line and no pill", () => {
  const markup = render(base);
  assert.ok(!markup.includes("Doublon possible"));
  assert.ok(!markup.includes("places-duplicate-line"));
});

test("a visitor reads « Vos lieux restent dans ce navigateur… » once, before the count; a signed-in person does not", () => {
  const visitor = render({ ...base, visitor: true });
  assert.match(
    textOf(visitor),
    /Vos lieux restent dans ce navigateur\. Connectez-vous pour les retrouver sur tous vos appareils\./,
  );
  assert.equal((visitor.match(/places-visitor-line/g) || []).length, 1);
  assert.ok(
    visitor.indexOf("places-visitor-line") < visitor.indexOf("3 lieux"),
  );
  assert.ok(!render(base).includes("places-visitor-line"));
});

test("« Ajouter un lieu » stays the one primary of the list", () => {
  const markup = render(base);
  assert.equal((markup.match(/btn-primary/g) || []).length, 1);
  assert.match(markup, /btn-primary[^>]*>.*Ajouter un lieu/s);
});

test("the lists are on two columns from 62 rem: « Mes lieux » and « Lieux suggérés »", async () => {
  const css = await readFile(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const rule = css.slice(css.indexOf("@media (min-width: 62rem)"));
  assert.match(
    rule,
    /@media \(min-width: 62rem\)[\s\S]*?\.places-mine \.places-list,\s*\.places-page \.places-suggestions \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
  );
});

test("the visitor line and the duplicate line are written in the ten languages", () => {
  for (const locale of shippedLocales()) {
    for (const key of [
      "placesVisitorLine",
      "placesVisitorInfo",
      "placesDuplicate",
      "placesDuplicateLine",
      "placesDuplicateInfo",
    ]) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale} ${key}`);
    }
    assert.match(
      message(locale, "placesDuplicateLine"),
      /\{first\}.*\{second\}.*\{distance\}/s,
      locale,
    );
  }
});
