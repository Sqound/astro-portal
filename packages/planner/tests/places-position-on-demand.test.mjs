import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "portal/i18n.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The reference of the distances is the DEFAULT PLACE; the browser's position
// is read only when "Depuis ma position" is pressed, never when the page opens,
// and then stands as the reference until the page is left. Rendered from
// synthetic data; nothing reaches the browser's geolocation.
await registerJsx();
const { createPlacesPositionReader, PlacesFromPositionButton } =
  await import("planner/components/PlacesParts.js");
const { MyPlacesList } = await import("planner/components/PlacesView.js");
const { PlacesSuggestedPane } =
  await import("planner/components/PlacesSuggestedPane.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/\s+/g, " ")
    .trim();

const col = {
  id: "col",
  name: "Col des Mélèzes",
  latitude: "45.3418",
  longitude: "-30",
  horizonStatus: "verified",
};

/** A browser that counts what is asked of it. */
function fakeHost({ permission = "prompt", fix = null } = {}) {
  const calls = { permission: 0, position: 0 };
  return {
    calls,
    permissions: {
      query: async () => {
        calls.permission += 1;
        return { state: permission };
      },
    },
    geolocation: {
      getCurrentPosition(success, failure) {
        calls.position += 1;
        if (fix) success({ coords: fix });
        else failure(new Error("refused"));
      },
    },
  };
}

test("creating the reader — which is all the page does when it opens — asks the browser nothing", () => {
  const host = fakeHost();
  const seen = [];
  const reader = createPlacesPositionReader({
    host,
    onChange: (state) => seen.push(state),
  });
  reader.attach();
  assert.deepEqual(host.calls, { permission: 0, position: 0 });
  assert.deepEqual(seen, []);
});

test("locate() reads the position once and keeps it; the answer is the new reference", async () => {
  const host = fakeHost({ fix: { latitude: 45.1, longitude: -30.2 } });
  const seen = [];
  const reader = createPlacesPositionReader({
    host,
    onChange: (state) => seen.push(state),
  });
  reader.attach();
  await reader.locate();
  assert.equal(host.calls.position, 1);
  assert.deepEqual(seen[0], { position: null, pending: true, failed: false });
  assert.deepEqual(seen.at(-1), {
    position: { latitude: 45.1, longitude: -30.2 },
    pending: false,
    failed: false,
  });
});

test("a refusal, a denied permission and a missing sensor leave no position and say it failed — the default place stays", async () => {
  const refused = fakeHost();
  const seenRefused = [];
  await createPlacesPositionReader({
    host: refused,
    onChange: (state) => seenRefused.push(state),
  }).locate();
  assert.deepEqual(seenRefused.at(-1), {
    position: null,
    pending: false,
    failed: true,
  });

  const denied = fakeHost({ permission: "denied" });
  const seenDenied = [];
  await createPlacesPositionReader({
    host: denied,
    onChange: (state) => seenDenied.push(state),
  }).locate();
  assert.equal(denied.calls.position, 0, "no prompt over a refused permission");
  assert.equal(seenDenied.at(-1).failed, true);

  const seenNone = [];
  await createPlacesPositionReader({
    host: {},
    onChange: (state) => seenNone.push(state),
  }).locate();
  assert.equal(seenNone.at(-1).failed, true);
});

test("once the page is left (detached) no answer is delivered", async () => {
  const host = fakeHost({ fix: { latitude: 45, longitude: -30 } });
  const seen = [];
  const reader = createPlacesPositionReader({
    host,
    onChange: (state) => seen.push(state),
  });
  reader.attach()();
  await reader.locate();
  assert.deepEqual(seen, []);
});

test("« Mes lieux » — before the press the count and the distances say « lieu par défaut » and the button is there, a tertiary; after it, the position", () => {
  const props = {
    locale: "fr",
    places: [col],
    defaultId: "col",
    skies: { col: { bortle: 4, sqm: 20.9 } },
    onOpen() {},
    onNewPlace() {},
    onLocate() {},
  };
  const before = render(MyPlacesList, { ...props, position: null });
  assert.match(
    textOf(before),
    /^1 lieu · distances à vol d’oiseau depuis votre lieu par défaut/,
  );
  assert.match(
    before,
    /<button type="button" class="btn-tertiary" data-testid="places-from-position">Depuis ma position<\/button>/,
  );
  const after = render(MyPlacesList, {
    ...props,
    position: { latitude: 45, longitude: -30 },
  });
  assert.match(
    textOf(after),
    /^1 lieu · distances à vol d’oiseau depuis votre position/,
  );
});

test("the button says it is searching (disabled) and, when the browser refused, says so under it", () => {
  const searching = render(PlacesFromPositionButton, {
    locale: "fr",
    pending: true,
    onLocate() {},
  });
  assert.match(searching, /disabled/);
  assert.match(textOf(searching), /Recherche de votre position…/);
  const failed = render(PlacesFromPositionButton, {
    locale: "fr",
    failed: true,
    onLocate() {},
  });
  assert.match(
    failed,
    /data-testid="places-position-unavailable"[^>]*>Votre position n’a pas pu être lue\./,
  );
  assert.doesNotMatch(
    render(PlacesFromPositionButton, { locale: "fr", onLocate() {} }),
    /places-position-unavailable/,
  );
});

test("« Lieux suggérés » with no place and no position — nothing is read, the sentence and the button stay; with a place the search starts from it", () => {
  const pane = (props) =>
    render(PlacesSuggestedPane, {
      locale: "fr",
      places: [],
      settings: {
        around: null,
        radiusKm: 60,
        sort: "darkest",
        kinds: ["viewpoint", "campsite", "park"],
      },
      onSettings() {},
      client: { search: () => new Promise(() => {}) },
      onOpen() {},
      onLocate() {},
      ...props,
    });
  const none = pane({});
  assert.match(textOf(none), /Ajoutez un lieu ou autorisez votre position/);
  assert.match(none, /data-testid="places-from-position"/);
  assert.doesNotMatch(none, /Recherche des lieux/);
  const withPlace = pane({ places: [col], defaultPlaceId: "col" });
  assert.match(withPlace, /Col des Mélèzes/);
  assert.match(withPlace, /data-testid="places-from-position"/);
});

test("the place picker never reads the position by itself", () => {
  const source = readFileSync(
    new URL("../src/components/PlacePickerSheet.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /usePlacesPosition|getCurrentPosition/);
});

test("the two texts exist in the ten languages", () => {
  for (const [locale, table] of Object.entries(messages)) {
    assert.ok(table.placesFromMyPosition, `${locale}: button`);
    assert.ok(table.placesPositionUnavailable, `${locale}: refusal`);
  }
  assert.equal(messages.fr.placesFromMyPosition, "Depuis ma position");
});
