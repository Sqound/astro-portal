import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "portal/i18n.js";
import { registerPlannerExtension } from "portal/planner/extensions.js";
import { horizonMaskHasProfile } from "portal/planner/horizon-mask.js";
import { planNightWindow } from "planner/planner.js";
import { tonightOverview } from "planner/tonight-overview.js";
import { tonightWords } from "planner/tonight-words.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The name and date of the place of "Cette nuit", and the place part of its
// sticky bar, open the place's details in a dialog: the map read only (a click
// on it opens the editor), the drawn horizon or the grey badge "Horizon à
// relever", and "Éditer ce lieu". Synthetic place and values; nothing leaves
// the test.

await registerJsx();
// `WebDialog` draws through a portal (nothing on the server): a stand-in lays
// its title, body and footer out in place. The map and the editor's other
// parts (Leaflet, a stylesheet) are stand-ins too: what is asserted is what
// the details hand them.
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer, onClose }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), onClose ? h("button", { className: "web-dialog-close" }) : null, h("div", { className: "web-dialog-body" }, children), h("footer", null, footer));',
)}`;
const PLACE_DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const PlaceMap = (props) => h("div", { className: "map-stand-in", "data-read-only": String(Boolean(props.readOnly)), "data-lat": props.location.latitude, "data-lon": props.location.longitude, "data-label": props.openLabel, "data-opens": String(typeof props.onOpen === "function"), "data-chooses": String(typeof props.onSelect === "function") });',
)}`;
const HORIZON = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const PlannerHorizonEditor = (props) => h("div", { className: "horizon-stand-in", "data-read-only": String(Boolean(props.readOnly)), "data-points": String((props.mask?.points || []).filter((p) => p.altitude > 0).length) });',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    if (specifier === "../dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    if (specifier === "./PlannerPlaceDialog.js")
      return { url: PLACE_DIALOG, shortCircuit: true };
    if (specifier === "./PlannerHorizonEditor.js")
      return { url: HORIZON, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlannerPlaceDetails, placeDetailsCoordinatesLine } =
  await import("portal/components/planner/PlannerPlaceDetails.js");

const render = (props) =>
  renderToStaticMarkup(
    createElement(PlannerPlaceDetails, {
      locale: "fr",
      onEdit() {},
      onClose() {},
      ...props,
    }),
  );
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " ")
    .replace(/&#x27;/g, "’")
    .replace(/\s+/g, " ")
    .trim();

const flat = Array.from({ length: 36 }, (_, index) => ({
  azimuth: index * 10,
  altitude: 0,
}));
const ridge = flat.map((point, index) => ({
  ...point,
  altitude: index < 12 ? 20 : 0,
}));
const lac = {
  id: "lac-noir",
  name: "Camping du Lac Noir",
  locality: "Val des Étoiles",
  latitude: "45",
  longitude: "-29.60575",
  timeZone: "Etc/GMT+2",
  horizonMask: { enabled: true, points: ridge },
};

test("a drawn horizon: the name, the locality, the coordinates, the map read only, the horizon, « Éditer ce lieu »", () => {
  const markup = render({ place: lac });
  const text = textOf(markup);
  assert.match(markup, /<h2>Camping du Lac Noir<\/h2>/);
  assert.match(text, /Val des Étoiles/);
  // The sea's zone is written with the sign people read.
  assert.match(text, /45\.00000° · -29\.60575° · UTC\u22122 \(Etc\/GMT\+2\)/);
  // The map: read only, a click opens the editor, named for the screen reader.
  assert.match(markup, /class="map-stand-in" data-read-only="true"/);
  assert.match(markup, /data-lat="45" data-lon="-29.60575"/);
  assert.match(markup, /data-opens="true" data-chooses="false"/);
  assert.match(
    markup,
    /data-label="Position du lieu sur la carte\s:\s?modifier le lieu"/,
  );
  // The horizon: the editor's component, read only, under its caption.
  assert.match(text, /L’horizon tel que vous le voyez auprès de la monture\./);
  assert.match(markup, /class="horizon-stand-in" data-read-only="true"/);
  assert.match(markup, /data-points="12"/);
  assert.doesNotMatch(markup, /tonight-place-no-horizon/);
  // The foot: a link, then "Éditer ce lieu", a tertiary, on its right.
  const footer = /<footer>(.*)<\/footer>/s.exec(markup)[1];
  const buttons = [
    ...footer.matchAll(/<button[^>]*class="([^"]+)"[^>]*>(.*?)<\/button>/g),
  ];
  assert.deepEqual(
    buttons.map((match) => [match[1], match[2]]),
    [
      ["btn-link", "Fermer"],
      ["btn-tertiary", "Éditer ce lieu"],
    ],
  );
  assert.doesNotMatch(markup, /btn-primary/);
  // The web has no camera to lay an augmented-reality horizon over.
  assert.doesNotMatch(text, /réalité augmentée/);
});

test("nothing drawn: the grey inert badge « Horizon à relever » takes the horizon's place, the map and the foot stay", () => {
  const markup = render({
    place: { ...lac, horizonMask: { enabled: true, points: flat } },
  });
  assert.match(
    markup,
    /<span class="tonight-place-no-horizon"[^>]*role="status">.*Horizon à relever<\/span>/s,
  );
  assert.doesNotMatch(markup, /horizon-stand-in/);
  assert.doesNotMatch(
    textOf(markup),
    /L’horizon tel que vous le voyez auprès de la monture/,
  );
  assert.match(markup, /map-stand-in/);
  assert.match(textOf(markup), /Éditer ce lieu/);
  // A place with no mask at all is the same state.
  const bare = { ...lac };
  delete bare.horizonMask;
  assert.match(render({ place: bare }), /tonight-place-no-horizon/);
  assert.equal(horizonMaskHasProfile(undefined), false);
  assert.equal(horizonMaskHasProfile({ enabled: true, points: ridge }), true);
});

test("a locality that is the name is not written twice; the zone only when the place has one", () => {
  const markup = render({
    place: {
      ...lac,
      locality: "Camping du Lac Noir",
      timeZone: undefined,
    },
  });
  assert.doesNotMatch(markup, /tonight-place-details-locality/);
  assert.match(textOf(markup), /45\.00000° · -29\.60575°(?! ·)/);
  assert.equal(
    placeDetailsCoordinatesLine({
      latitude: 45,
      longitude: -30,
      timeZone: "UTC",
    }),
    "45.00000° · -30.00000° · UTC",
  );
  assert.equal(placeDetailsCoordinatesLine({ name: "Sans position" }), "");
});

test("the words: the zone and the sticky bar's place part are named « …, … : voir le lieu », in ten languages", () => {
  const place = { ...lac, latitude: 45, longitude: -30, timeZone: "UTC" };
  const date = "2026-10-14";
  const overview = tonightOverview({
    place,
    date,
    night: planNightWindow({ date }, place),
    plans: [],
  });
  const plain = (text) => text.replace(/[\u00a0\u202f]/g, " ");
  const fr = tonightWords(overview, { locale: "fr", timeZone: "UTC" });
  assert.match(
    plain(fr.placeOpen),
    /^Camping du Lac Noir, Mer\. 14 oct\. : voir le lieu$/,
  );
  assert.match(
    plain(fr.sticky.placeOpen),
    /^Camping du Lac Noir, mer\. 14 oct\. : voir le lieu$/,
  );
  for (const locale of [
    "en",
    "fr",
    "ja",
    "zh-Hans",
    "zh-Hant",
    "ru",
    "de",
    "es",
    "it",
    "pt-BR",
  ])
    for (const key of [
      "tonightPlaceOpen",
      "tonightPlaceMapLabel",
      "tonightPlaceNoHorizon",
    ]) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}: ${key}`);
      if (key === "tonightPlaceOpen")
        assert.ok(
          text.includes("{place}") && text.includes("{date}"),
          `${locale}: ${key} keeps its placeholders`,
        );
    }
});

// The foot's secondary "Pollution lumineuse", at the end, with the map's
// glyph, and "Planification avancée" as a subtitle inside it when held back.
const footerButtons = (markup) =>
  [
    ...(/<footer>(.*)<\/footer>/s.exec(markup)?.[1] ?? "").matchAll(
      /<button[^>]*class="([^"]+)"[^>]*>(.*?)<\/button>/g,
    ),
  ].map((match) => [match[1].split(" ")[0], textOf(match[2])]);

test("the foot reads link, tertiary, secondary; the secondary says « Pollution lumineuse » with the glyph, one line", () => {
  const markup = render({
    place: lac,
    lightMap: {
      access: "open",
      label: "Pollution lumineuse",
      subtitle: null,
      icon: createElement("svg", { className: "map-glyph" }),
      onOpen() {},
    },
  });
  assert.deepEqual(footerButtons(markup), [
    ["btn-link", "Fermer"],
    ["btn-tertiary", "Éditer ce lieu"],
    ["btn-secondary", "Pollution lumineuse"],
  ]);
  const secondary = /<button[^>]*btn-secondary[^>]*>.*?<\/button>/s.exec(
    markup,
  )[0];
  assert.match(secondary, /data-light-map-entry="open"/);
  assert.match(secondary, /<svg class="map-glyph"/);
  // With the right: one line of label, no subtitle.
  assert.doesNotMatch(secondary, /<small/);
  // Still one level at most per zone: no primary.
  assert.doesNotMatch(markup, /btn-primary/);
});

test("held back, « Planification avancée » is a subtitle inside the button, never a tag outside; absent, no button", () => {
  const held = render({
    place: lac,
    lightMap: {
      access: "heldBack",
      label: "Pollution lumineuse",
      subtitle: "Planification avancée",
      icon: null,
      onOpen() {},
    },
  });
  const secondary = /<button[^>]*btn-secondary[^>]*>.*?<\/button>/s.exec(
    held,
  )[0];
  assert.match(secondary, /data-light-map-entry="heldBack"/);
  assert.match(
    secondary,
    /<span>Pollution lumineuse<\/span><small[^>]*>Planification avancée<\/small>/,
  );
  assert.doesNotMatch(held, /advanced-chip/);
  assert.equal(footerButtons(held).length, 3);
  // A private server (the open composition): the foot of today.
  const absent = render({ place: lac, lightMap: null });
  assert.deepEqual(footerButtons(absent), [
    ["btn-link", "Fermer"],
    ["btn-tertiary", "Éditer ce lieu"],
  ]);
  assert.doesNotMatch(absent, /light-map/);
});

test("the button is the shell's: nothing without the extension, a held back one only where offers are sold; the words follow the right", async () => {
  const { placeLightMapEntry } =
    await import("planner/places-light-map-access.js");
  const hosted = { signInPath: "/fr/sign-in" };
  const entry = (extra = {}) =>
    placeLightMapEntry({
      locale: "fr",
      place: lac,
      auth: hosted,
      capabilities: null,
      ...extra,
    });
  // Nothing registered (a private server, the open composition): no button.
  assert.equal(entry(), null);
  registerPlannerExtension("planner.places.lightMap", {
    View: () => null,
    copy: () => ({ entry: "Carte" }),
  });
  // A page that is not the hosted service's: no button.
  assert.equal(entry({ auth: { signInPath: null } }), null);
  assert.equal(entry({ auth: { ...hosted, spaceCreation: "closed" } }), null);
  // Held back but nothing sold: no button either (the box would be empty).
  assert.equal(entry(), null);
  registerPlannerExtension("planner.offers", {
    gateCopy: () => ({}),
    href: () => "/fr/offers",
    price: () => "34,99 €",
    copy: (locale, key) =>
      ({
        lightMapTitleShort: "Pollution lumineuse",
        offerAdvancedPlanningName: "Planification avancée",
      })[key] ?? "",
  });
  // A place without a position cannot be centred on.
  assert.equal(entry({ place: { name: "Sans position" } }), null);
  const held = entry();
  assert.equal(held.access, "heldBack");
  assert.equal(held.label, "Pollution lumineuse");
  assert.equal(held.subtitle, "Planification avancée");
  const open = entry({ capabilities: { "planner.mosaic": true } });
  assert.equal(open.access, "open");
  assert.equal(open.subtitle, null);
  assert.deepEqual(open.focus, {
    name: "Camping du Lac Noir",
    latitude: 45,
    longitude: -29.60575,
  });
});
