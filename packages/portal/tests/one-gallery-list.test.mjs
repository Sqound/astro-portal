// The list of the private gallery should be as well presented as the list of the public gallery: the
// list of the private gallery is drawn by the public gallery's components —
// the filter bar with its search, its date sort and its map toggle, the
// counter line, the card, the grid (`components/gallery/GalleryList.js`) —
// fed with the private view in the public shape
// (`private-gallery/public-shape.js`). The same captures drawn by both routes
// give the same cards but for the addresses and the words that are each
// gallery's own (« captures » for « captures publiques », a capture without a
// target named by its file); the owner's own tags, the gate and the visitor's
// copy stay the private gallery's.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { shippedLocales } from "astro-contracts/locales";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { GalleryCaptureCard } =
  await import("portal/components/gallery/GalleryList.js");
const { PrivateGalleryView } =
  await import("portal/components/gallery/PrivateGallery.js");
const { capturesMatching } =
  await import("portal/components/gallery/PrivateGalleryGrid.js");
const { privateItemAsPublic } =
  await import("portal/private-gallery/public-shape.js");
const { messages } = await import("portal/i18n.js");

const TOKEN = "A".repeat(32);
const m31 = {
  id: "m31",
  designation: "M31",
  name: "Galaxie d’Andromède",
  aliases: ["NGC 224"],
  type: "Galaxie",
  constellation: "Andromède",
  ra: 10.6847,
  dec: 41.2688,
};
const m42 = {
  id: "m42",
  designation: "M42",
  name: "Nébuleuse d’Orion",
  aliases: [],
  type: "Nébuleuse en émission",
  constellation: "Orion",
  ra: 83.82,
  dec: -5.39,
};

// What the public gallery says of three captures (`publicGalleryItem`).
const publicCard = (id, targets, extra) => ({
  id,
  targets,
  tag: null,
  tags: [],
  telescope: "Askar 50P",
  exposure: null,
  nightMonth: "2026-10",
  signature: "Camille",
  media: {
    image: `/api/v1/gallery/${id}/media`,
    thumbnail: `/api/v1/gallery/${id}/media?variant=thumbnail`,
  },
  ...extra,
});
const PUBLIC = [
  publicCard("c-m31", [m31], { tag: "Galaxie", tags: ["Galaxie", "Messier"] }),
  publicCard("c-m42", [m42], {
    tag: "Nébuleuse",
    tags: ["Nébuleuse", "Messier"],
  }),
  publicCard("c-wide", [], { tag: "Grand champ", tags: ["Grand champ"] }),
];
// The same captures as the private gallery's service says them.
const item = (id, targets, extra) => ({
  id,
  targets,
  fileName: `${id}.jpg`,
  night: "2026-10-05",
  nightMonth: "2026-10",
  telescope: "Askar 50P",
  addedAt: "2026-10-06T09:41:00.000Z",
  thumbnail: true,
  tags: [],
  ownTags: [],
  ...extra,
});
const ITEMS = [
  item("c-m31", [m31], { tags: ["Galaxie"] }),
  item("c-m42", [m42], { tags: ["Nébuleuse"] }),
  item("c-wide", [], { tags: ["Grand champ"], fileName: "IMG_0042.jpg" }),
];
const VIEW = {
  portalName: "Ciel du Lac Noir",
  publicName: "Camille",
  captures: ITEMS,
  tags: ["Galaxie", "Nébuleuse", "Grand champ"],
  ownTags: [],
};

const draw = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props));
const plain = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const cards = (markup) =>
  [...markup.matchAll(/<article class="card">.*?<\/article>/g)].map(
    (match) => match[0],
  );
// A card without its addresses: the two galleries' files and pages.
const withoutAddresses = (markup) =>
  markup
    .replace(/(src|href)="[^"]*"/g, '$1="ADDRESS"')
    .replace("IMG_0042.jpg", "Sans cible");

const publicCards = PUBLIC.map((capture) =>
  draw(GalleryCaptureCard, {
    capture,
    locale: "fr",
    noTarget: "Sans cible",
    href: `/fr/gallery/${capture.id}`,
  }),
);
const privateList = draw(PrivateGalleryView, {
  locale: "fr",
  token: TOKEN,
  view: VIEW,
});

test("the same captures through both routes give the same cards, but for the addresses and the file's name", () => {
  const drawn = cards(privateList);
  assert.equal(drawn.length, 3);
  drawn.forEach((card, index) =>
    assert.equal(
      withoutAddresses(card),
      withoutAddresses(publicCards[index]),
      `card ${index + 1}`,
    ),
  );
  // What the card says: the kicker, the title, the alias, the month, the
  // signature and the tags, as the public gallery's.
  const words = plain(drawn[0]);
  for (const sentence of [
    "Galaxie · Askar 50P",
    "M31 — Galaxie d’Andromède",
    "M31 · NGC 224",
    "Octobre 2026",
    "Camille",
    "Galaxie Messier",
  ])
    assert.ok(words.includes(sentence), `« ${sentence} »`);
});

test("the private list's files and pages go through the gallery's gate, never a public address", () => {
  assert.ok(!privateList.includes("/api/v1/gallery/"));
  assert.match(
    privateList,
    new RegExp(`href="/fr/p/${TOKEN}/c-m31"`),
    "a card leads to the gallery's page of the capture",
  );
  assert.match(
    privateList,
    new RegExp(
      `src="/api/v1/portals/${TOKEN}/media/c-m31\\?variant=thumbnail"`,
    ),
  );
  const adapted = privateItemAsPublic({
    token: TOKEN,
    item: ITEMS[0],
    publicName: "Camille",
  });
  assert.equal(
    adapted.media.thumbnail,
    `/api/v1/portals/${TOKEN}/media/c-m31?variant=thumbnail`,
  );
  assert.equal(adapted.tag, "Galaxie");
  assert.deepEqual(adapted.tags, ["Galaxie", "Messier"]);
  assert.equal(adapted.signature, "Camille");
  // No thumbnail yet: no file, the card draws its placeholder.
  const bare = privateItemAsPublic({
    token: TOKEN,
    item: { ...ITEMS[0], thumbnail: false },
  });
  assert.equal(bare.media.thumbnail, null);
  assert.equal(bare.signature, null);
  assert.ok(
    draw(GalleryCaptureCard, {
      capture: bare,
      locale: "fr",
      noTarget: "x",
      href: "/x",
    }).includes("card-image-placeholder"),
  );
});

test("the tools and the counter line are the public gallery's, the counter without « publiques »", () => {
  for (const marker of [
    '<div class="filters">',
    'class="search-control',
    'class="date-sort"',
    'class="gallery-mode-toggle"',
    'class="gallery-filter-summary"',
    '<section class="gallery"',
  ])
    assert.ok(privateList.includes(marker), marker);
  assert.ok(plain(privateList).includes("3 / 3 captures"));
  assert.ok(!plain(privateList).includes("publiques"));
  // The gate's header stays: the gallery's name and its owner.
  assert.match(privateList, /<h1>Ciel du Lac Noir<\/h1>/);
  assert.ok(plain(privateList).includes("par Camille"));
});

test("what is the private gallery's own: the owner's tags on the cards and in the bar", () => {
  const own = draw(PrivateGalleryView, {
    locale: "fr",
    token: TOKEN,
    view: {
      ...VIEW,
      captures: [
        { ...ITEMS[0], ownTags: ["Lunette", "Messier"] },
        ...ITEMS.slice(1),
      ],
      ownTags: ["Lunette", "Messier"],
    },
  });
  const [first] = cards(own);
  assert.ok(first.includes("<span>Lunette</span>"));
  // An own tag that reads as a generic word is drawn once.
  assert.equal((first.match(/<span>Messier<\/span>/g) || []).length, 1);
  assert.ok(own.includes(">Lunette</button>"));
});

test("the search keeps the captures whose title, names, alias, file or tags hold the words, accents and case aside", () => {
  const owned = [{ ...ITEMS[0], ownTags: ["Lunette"] }, ...ITEMS.slice(1)];
  const ids = (query, locale = "fr") =>
    capturesMatching(owned, query, locale).map((entry) => entry.id);
  assert.deepEqual(ids(""), ["c-m31", "c-m42", "c-wide"]);
  assert.deepEqual(ids("andromede"), ["c-m31"]);
  assert.deepEqual(ids("NGC 224"), ["c-m31"]);
  assert.deepEqual(ids("orion"), ["c-m42"]);
  assert.deepEqual(ids("img_0042"), ["c-wide"]);
  assert.deepEqual(ids("nebuleuse"), ["c-m42"]);
  assert.deepEqual(ids("galaxy", "en"), ["c-m31"]);
  assert.deepEqual(ids("lunette"), ["c-m31"]);
  assert.deepEqual(ids("zzz"), []);
});

test("the empty private gallery is the empty state, without an action", () => {
  const empty = draw(PrivateGalleryView, {
    locale: "fr",
    token: TOKEN,
    view: { ...VIEW, captures: [], tags: [], ownTags: [] },
  });
  assert.ok(empty.includes("data-empty-state"));
  assert.ok(plain(empty).includes("Aucune capture dans cette galerie"));
  assert.ok(!empty.includes("empty-state-action"));
  assert.ok(!empty.includes('class="filters"'));
});

test("the counter has a word of its own in the ten languages", () => {
  for (const locale of shippedLocales()) {
    const noun = messages[locale].galleryCaptures;
    assert.ok(noun && noun !== messages[locale].publicCaptures, locale);
    const html = draw(PrivateGalleryView, {
      locale,
      token: TOKEN,
      view: VIEW,
    });
    assert.ok(plain(html).includes(`3 / 3 ${noun}`), locale);
    assert.equal(cards(html).length, 3, locale);
  }
});

test("one set of components: neither gallery draws a card, a bar or a counter of its own", () => {
  const read = (path) =>
    readFileSync(
      new URL(`../src/components/gallery/${path}`, import.meta.url),
      "utf8",
    );
  for (const file of ["GalleryPage.js", "PrivateGalleryGrid.js"]) {
    const source = read(file);
    assert.match(source, /from "\.\/GalleryList\.js"/, file);
    for (const own of ['className="filters"', "<output", "PublicCaptureCard"])
      assert.ok(!source.includes(own), `${file} draws ${own}`);
  }
  // (The operator's file gallery, `source=files`, keeps its own target card.)
  assert.ok(!read("PrivateGalleryGrid.js").includes('className="card"'));
  // Nor a private address in the public gallery's code.
  assert.ok(!/\/p\/|galleryMediaPath|portals\//.test(read("GalleryPage.js")));
  assert.ok(!/\/p\/|galleryMediaPath|portals\//.test(read("GalleryList.js")));
});
