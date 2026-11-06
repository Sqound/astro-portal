// The private and the public gallery share the same code, the public gallery being
// the reference: the page of a capture of a private gallery is the public
// gallery's page — one component, `PublicCapturePage` — fed with the private
// view in the public shape. The same capture drawn by both is the same page
// but for the addresses: the files go through the gallery's gate, the ✕ leads
// back to the gallery, « Signaler » is sent to the gallery's route; and no
// private address is written by the public code.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { PublicCapturePage } =
  await import("portal/components/detail/PublicCapturePage.js");
const { privateCapturePageProps } =
  await import("portal/components/gallery/PrivateGallery.js");
const { messages } = await import("portal/i18n.js");

const TOKEN = "A".repeat(32);
const ID = "c-m31";
const target = {
  id: "m31",
  designation: "M31",
  name: "Galaxie d’Andromède",
  aliases: ["NGC 224"],
  type: "Galaxie",
  constellation: "Andromède",
  ra: 10.6847,
  dec: 41.2688,
};
const metadata = {
  title: null,
  description: "Première nuit d’automne au col.",
  acquisition: [
    {
      filter: "Dual-band",
      frameCount: 38,
      exposureSeconds: 180,
      gain: 100,
      integrationSeconds: 6840,
    },
  ],
  totalIntegrationSeconds: 6840,
  calibration: "30 darks · 30 flats",
  sensor: { temperatureC: -10, binning: 1 },
  processing: { software: "Siril 1.4.4", steps: "Calibration, empilement" },
  filters: ["Dual-band"],
  moonIllumination: 12,
};
const equipment = [
  { kind: "telescope", name: "Askar 50P" },
  { kind: "camera", name: "ZWO ASI533MC Pro" },
  { kind: "mount", name: "ZWO AM5N" },
];
const image = { width: 2922, height: 1948 };
const variant = {
  id: "crop",
  image: { width: 1800, height: 1200 },
  title: "Recadrée sur le noyau",
  description: "Recadrage serré sur le noyau.",
  arrivalRank: 2,
};
const mainImage = {
  id: "main",
  title: null,
  description: null,
  arrivalRank: 1,
};
const knowledge = {
  story: "La galaxie d’Andromède est la plus proche grande voisine.",
  storyParagraphs: [],
  researchSources: [],
};
const skyQuality = { bortle: 4 };

// The capture as the public gallery says it.
const publicShape = {
  id: ID,
  targets: [target],
  nightMonth: "2026-10",
  signature: "Camille",
  equipment,
  skyQuality,
  image,
  media: {
    image: `/api/v1/gallery/${ID}/media`,
    thumbnail: `/api/v1/gallery/${ID}/media?variant=thumbnail`,
  },
  mainImage,
  variants: [
    {
      ...variant,
      media: {
        image: `/api/v1/gallery/${ID}/media?imageId=crop`,
        thumbnail: `/api/v1/gallery/${ID}/media?variant=thumbnail&imageId=crop`,
      },
    },
  ],
  metadata,
};
// The same capture as the private gallery's service says it.
const privateView = {
  portalName: "Ciel du Lac Noir",
  publicName: "Camille",
  canReport: true,
  capture: {
    id: ID,
    targets: [target],
    night: "2026-10-05",
    nightMonth: "2026-10",
    addedAt: "2026-10-06T09:41:00.000Z",
    fileName: "M31_final.jpg",
    byteSize: 1000,
    equipment,
    skyQuality,
    image,
    thumbnail: true,
    mainImage,
    variants: [{ ...variant, thumbnail: true }],
    metadata,
  },
};

const publicPage = renderToStaticMarkup(
  createElement(PublicCapturePage, {
    capture: publicShape,
    knowledge,
    noTarget: "Sans cible",
    locale: "fr",
    reportable: true,
  }),
);
const privateProps = privateCapturePageProps({
  locale: "fr",
  token: TOKEN,
  view: privateView,
  knowledge,
});
const privatePage = renderToStaticMarkup(
  createElement(PublicCapturePage, privateProps),
);

const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// The page without its addresses: the two galleries' files, the ✕.
const withoutAddresses = (markup) =>
  markup
    .replaceAll(`/api/v1/gallery/${ID}/media`, "MEDIA")
    .replaceAll(`/api/v1/portals/${TOKEN}/media/${ID}`, "MEDIA")
    .replace(/href="\/fr"/, 'href="BACK"')
    .replace(`href="/fr/p/${TOKEN}"`, 'href="BACK"')
    .replace(/(aria-label|title)="Retour à la galerie[^"]*"/g, '$1="BACK"')
    // The tooltips of the viewer's bar: their words, and their ids (which
    // follow the place of the page in the tree of each route).
    .replace(/(viewer-tooltip">)Retour à la galerie[^<]*/, "$1BACK")
    .replace(/_R_[a-z0-9_]+_/gi, "ID");

test("the private gallery's capture is drawn by the public page: the same sections, in the same order, with the same words", () => {
  const words = plain(privatePage);
  for (const heading of [
    "Cible",
    "Acquisition",
    "Équipement",
    "Traitement",
    "À propos de la cible",
    "Liens connexes",
  ])
    assert.ok(words.includes(heading), `« ${heading} » in the private page`);
  for (const sentence of [
    "M31 — Galaxie d’Andromède",
    "Camille",
    "Objet M31 · NGC 224",
    "Type Galaxie",
    "Constellation Andromède",
    "Coordonnées (J2000) 0h 42m 44s · +41° 16′ 08″",
    "Dual-band 38 × 180 s 1 h 54",
    "Télescope Askar 50P",
    "Caméra ZWO ASI533MC Pro",
    "Monture ZWO AM5N",
    "Qualité du ciel Bortle 4",
    "Mois de la nuit Octobre 2026",
    "Logiciels Siril 1.4.4",
    "La galaxie d’Andromède est la plus proche grande voisine.",
    "Octobre 2026 · 2 922 × 1 948 px",
    "Ouvrir dans Stellarium Web",
    "Image principale · Octobre 2026 · 2 922 × 1 948 px",
  ])
    assert.ok(words.includes(sentence), `« ${sentence} » in the private page`);
  // The viewer's buttons and the report links.
  for (const marker of [
    'class="close"',
    'class="image-fullscreen"',
    'class="stellarium-link"',
    'class="details-toggle details-panel-toggle"',
    'class="asset-nav asset-nav-prev"',
    'class="asset-nav asset-nav-next"',
    'class="asset-pagination-dot is-active"',
    "data-signature",
  ])
    assert.ok(privatePage.includes(marker), marker);
  // No service that takes reports gave its link: « Signaler » is not drawn,
  // although the gate says the viewer may report.
  assert.ok(!privatePage.includes("Signaler"));
  assert.ok(!privatePage.includes("data-report"));
  // Nothing of the place or of the file.
  assert.ok(!words.includes("Lieu"));
  assert.ok(!words.includes("M31_final.jpg"));
});

test("the same capture drawn by the private route and by the public one is the same markup, but for the addresses", () => {
  assert.equal(withoutAddresses(privatePage), withoutAddresses(publicPage));
  assert.notEqual(privatePage, publicPage);
});

test("the private page's addresses go through the gallery's gate and lead back to the gallery; the public page's through the public routes", () => {
  assert.ok(privatePage.includes(`src="/api/v1/portals/${TOKEN}/media/${ID}"`));
  assert.ok(
    privatePage.includes(
      `class="image-fullscreen" href="/api/v1/portals/${TOKEN}/media/${ID}"`,
    ),
  );
  assert.ok(privatePage.includes(`class="close" href="/fr/p/${TOKEN}"`));
  for (const attribute of ["aria-label", "title"])
    assert.ok(
      privatePage.includes(
        `${attribute}="Retour à la galerie — Ciel du Lac Noir"`,
      ),
      attribute,
    );
  assert.ok(
    privatePage.includes(
      'viewer-tooltip">Retour à la galerie — Ciel du Lac Noir<',
    ),
  );
  assert.ok(!privatePage.includes("/api/v1/gallery/"));
  // A server that takes reports gives the address; the core names none.
  assert.equal(privateProps.reportPath, undefined);
  assert.ok(publicPage.includes(`src="/api/v1/gallery/${ID}/media"`));
  assert.ok(publicPage.includes('class="close" href="/fr"'));
  assert.ok(!publicPage.includes("/api/v1/portals/"));
  // A variant is a file of the gate too.
  const variantProps = privateProps.capture.variants[0];
  assert.equal(
    variantProps.media.image,
    `/api/v1/portals/${TOKEN}/media/${ID}?imageId=crop`,
  );
});

test("no private address is written by the public page's code; the zoom is in the shared component and has a name in the ten languages", () => {
  for (const path of [
    "src/components/detail/PublicCapturePage.js",
    "src/components/detail/ImageZoom.js",
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /["'`]\/p\/|\/p\/\$\{|\/api\/v1\/portals\//);
  }
  assert.ok(publicPage.includes("data-public-capture"));
  assert.equal(Object.keys(messages).length, 10);
  for (const [locale, catalogue] of Object.entries(messages))
    for (const key of ["zoomActualSize", "zoomFit"]) {
      assert.equal(typeof catalogue[key], "string", `${locale} ${key}`);
      assert.ok(catalogue[key].length > 3, `${locale} ${key}`);
      if (locale !== "en")
        assert.notEqual(catalogue[key], messages.en[key], `${locale} ${key}`);
    }
});

test("a private capture whose thumbnail is not made yet draws the placeholder, with no zoom, no « image seule »", () => {
  const props = privateCapturePageProps({
    locale: "en",
    token: TOKEN,
    view: {
      ...privateView,
      capture: { ...privateView.capture, thumbnail: false, variants: [] },
    },
  });
  const markup = renderToStaticMarkup(createElement(PublicCapturePage, props));
  assert.match(markup, /class="image-placeholder"/);
  assert.doesNotMatch(markup, /<img |image-fullscreen/);
  assert.match(markup, /aria-label="Back to gallery — Ciel du Lac Noir"/);
});
