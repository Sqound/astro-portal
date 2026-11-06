// PORTAL-VIEWER-TOOLBAR-01: the bar above the capture in the viewer (public
// gallery's page and private gallery's) — four groups (close | display |
// annotations | out), a `title`, an `aria-label` and a tooltip (`aria-describedby`)
// on every button, the
// annotations' name that follows their state, Stellarium's own icon — and its
// words in the ten languages. The tooltip's timing and the phone's layout are
// measured in a browser: `tests/web-look-viewer-toolbar.test.mjs`.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { SkyAnnotationsButton } =
  await import("portal/components/plate-solving/SkyAnnotationControls.js");
const { ViewerTip } = await import("portal/components/detail/ViewerTip.js");
const { messages, message } = await import("portal/i18n.js");

const capture = (changes = {}) => ({
  id: "c1",
  media: { image: "/api/v1/gallery/c1/media", thumbnail: "/t" },
  image: { width: 4096, height: 2738 },
  nightMonth: "2026-10",
  signature: "Camille",
  targets: [
    {
      id: "ngc7000",
      designation: "NGC 7000",
      aliases: [],
      type: "Nébuleuse",
      constellation: "Cygne",
      ra: 20.98,
      dec: 44.5,
    },
  ],
  equipment: [],
  skyQuality: { bortle: 4 },
  mainImage: { id: "main", title: null, description: null, arrivalRank: 1 },
  variants: [],
  skySolution: {
    raDeg: 313,
    decDeg: 44.5,
    pixelScaleArcsec: 1.9,
    rotationDeg: 0,
    fieldWidthDeg: 3.3,
    fieldHeightDeg: 2.2,
    parity: "normal",
    width: 4096,
    height: 2738,
    annotations: "/api/v1/gallery/c1/annotations",
  },
  ...changes,
});
const page = (one, locale = "fr", extra = {}) =>
  renderToStaticMarkup(
    createElement(PublicCapturePage, {
      capture: one,
      noTarget: "Capture sans cible",
      locale,
      ...extra,
    }),
  );
const barOf = (markup) =>
  /<div class="viewer-bar">[\s\S]*?<\/div>(?=<div class="asset-nav|<div class="image-frame")/.exec(
    markup,
  )?.[0] ?? null;
const groupsOf = (bar) =>
  [
    ...bar.matchAll(/<div class="viewer-group" data-viewer-group="(\w+)">/g),
  ].map((match) => match[1]);
const buttonsOf = (bar) => [
  ...bar.matchAll(
    /<(a|button)\b[^>]*class="(close|plate-solve[^"]*|stellarium-link|image-fullscreen|image-zoom[^"]*|image-download)"[^>]*>/g,
  ),
];

test("the bar has four groups in order — close | display | annotations | out — and the annotations group holds the button (and the selector once shown)", () => {
  const bar = barOf(page(capture()));
  assert.ok(bar, "the bar is drawn");
  // The zoom button needs a browser's measure of the image: the display group
  // holds « image seule » alone here.
  assert.deepEqual(groupsOf(bar), ["close", "display", "annotations", "out"]);
  const order = [
    ...bar.matchAll(
      /class="(close|image-zoom|image-fullscreen|plate-solve|stellarium-link|image-download)\b/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(order, [
    "close",
    "image-fullscreen",
    "plate-solve",
    "stellarium-link",
    "image-download",
  ]);
  // Each button sits in its group.
  const group = (name) =>
    new RegExp(
      `<div class="viewer-group" data-viewer-group="${name}">([\\s\\S]*?)</div>(?=<div class="viewer-group"|$)`,
    ).exec(bar)[1];
  assert.match(group("close"), /class="close"/);
  assert.match(group("display"), /class="image-fullscreen"/);
  assert.match(group("annotations"), /class="plate-solve/);
  assert.match(group("out"), /class="stellarium-link"/);
  assert.match(group("out"), /class="image-download"/);
  // No button outside a group.
  assert.doesNotMatch(bar, /<div class="viewer-bar"><(a|button)/);
});

test("a group with no button is not drawn: no solution, no annotations group; no image, no display, no download", () => {
  const without = barOf(page(capture({ skySolution: null })));
  assert.deepEqual(groupsOf(without), ["close", "display", "out"]);
  const noImage = barOf(
    page(capture({ skySolution: null, media: {}, targets: [] })),
  );
  assert.deepEqual(groupsOf(noImage), ["close"]);
});

test("every button has a title, an aria-label and a tooltip it points to; the tooltip says the same", () => {
  const bar = barOf(page(capture()));
  const buttons = buttonsOf(bar);
  assert.equal(buttons.length, 5);
  for (const [tag] of buttons) {
    const label = /aria-label="([^"]+)"/.exec(tag)?.[1];
    const title = /title="([^"]+)"/.exec(tag)?.[1];
    const describedBy = /aria-describedby="([^"]+)"/.exec(tag)?.[1];
    assert.ok(label, `aria-label in ${tag}`);
    assert.ok(title, `title in ${tag}`);
    assert.ok(describedBy, `aria-describedby in ${tag}`);
    const tip = new RegExp(
      `<span role="tooltip" id="${describedBy}" class="capture-tooltip viewer-tooltip">(.*?)</span></span>`,
    ).exec(bar);
    assert.ok(tip, `the tooltip ${describedBy} follows its button`);
    assert.ok(
      tip[1].startsWith(label.replace(/&#x27;/g, "'")) ||
        tip[1].startsWith(label),
      `${label} in the tooltip`,
    );
    assert.ok(title.startsWith(label), `${title} says ${label}`);
  }
  // Stellarium's tooltip adds the grey line « Nouvel onglet ».
  assert.match(
    bar,
    /Ouvrir dans Stellarium Web<span class="viewer-tooltip-hint">Nouvel onglet<\/span>/,
  );
});

test("no label under the icons: an icon alone, named by its aria-label (CAPTURE-VIEWER-TOOLBAR-02)", () => {
  const bar = barOf(page(capture()));
  assert.doesNotMatch(bar, /viewer-label/);
  for (const [tag] of buttonsOf(bar)) assert.match(tag, /aria-label="[^"]+"/);
});

test("Stellarium leaves the viewfinder of the annotations: the arrow « opens outside »", () => {
  const bar = barOf(page(capture()));
  const stellarium = /class="stellarium-link"[\s\S]*?<\/svg>/.exec(bar)[0];
  assert.match(stellarium, /M14 4h6v6M20 4l-9 9/);
  assert.doesNotMatch(stellarium, /<circle/);
  assert.match(bar, /class="plate-solve [^"]*"[\s\S]*?<circle/);
});

test("the annotations' name follows their state: « Afficher » then « Masquer les annotations du ciel »; no label", () => {
  const draw = (state) =>
    renderToStaticMarkup(
      createElement(SkyAnnotationsButton, {
        plate: { state, toggle() {} },
        locale: "fr",
      }),
    );
  const off = draw("idle");
  assert.match(off, /aria-label="Afficher les annotations du ciel"/);
  assert.match(off, /title="Afficher les annotations du ciel"/);
  const on = draw("ready");
  assert.match(on, /aria-label="Masquer les annotations du ciel"/);
  assert.match(on, /title="Masquer les annotations du ciel"/);
  assert.match(on, /class="plate-solve is-active"/);
});

test("the tooltip component: the button's props point to it, the title goes away while it shows (never both)", () => {
  const markup = renderToStaticMarkup(
    createElement(ViewerTip, {
      label: "Télécharger",
      children: (tip) => createElement("button", tip, "x"),
    }),
  );
  assert.match(
    markup,
    /<button aria-describedby="([^"]+)" title="Télécharger">x<\/button><span role="tooltip" id="\1"/,
  );
});

test("the bar's words exist in the ten languages, each its own, and the page shows them", () => {
  const keys = ["hideSkyAnnotations", "openInNewTab"];
  assert.equal(shippedLocales().length, 10);
  const english = messages.en;
  for (const locale of shippedLocales()) {
    for (const key of keys) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}.${key}`);
      assert.equal(text, text.trim(), `${locale}.${key} untrimmed`);
      if (locale !== "en")
        assert.notEqual(text, english[key], `${locale}.${key} translated`);
    }
    const bar = barOf(page(capture(), locale));
    assert.ok(bar, locale);
    assert.ok(bar.includes(message(locale, "openInNewTab")), locale);
  }
});
