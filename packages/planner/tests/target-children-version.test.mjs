import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  childrenParagraphs,
  childrenVersionPreferenceKey,
  childrenVersionSnapshot,
  hasChildrenVersion,
  knowledgeInChildrenVersion,
  knowledgeShown,
  readChildrenVersion,
  resetChildrenVersion,
  subscribeChildrenVersion,
  writeChildrenVersion,
} from "portal/children-version.js";
import { message } from "portal/i18n.js";
import { knowledgeSections } from "portal/knowledge-sections.js";
import { shippedLocales } from "astro-contracts/locales";
import { targetPhotoViewerWords } from "planner/target-photo-viewer-words.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The children's version of a target's page, on the web: the control "Pour les
// enfants" switches the text of a target sheet to the children's paragraphs,
// the sources stay, a target without a children's version keeps its page and
// says so, and the choice is remembered in this browser. The web has no voice.

await registerJsx();
const { KnowledgeText } =
  await import("planner/components/TargetKnowledgeDetails.js");
const { ChildrenVersionControl } =
  await import("planner/components/ChildrenVersionControl.js");

const page = {
  id: "openngc-ngc0224",
  story: "Opening. First body.",
  storyParagraphs: ["Opening.", "First body."],
  storySections: [
    { heading: null, paragraphs: ["Opening."] },
    { heading: "Another universe", paragraphs: ["First body."] },
  ],
  researchSources: [
    { label: "NASA Science", url: "https://science.nasa.gov/" },
  ],
  researchNote: "Wikidata data under CC0.",
};
const kids = [
  "Andromeda is a huge city of stars.",
  "It is a small fuzzy patch.",
];
const withKids = { ...page, childrenSpokenParagraphs: kids };

const memoryStorage = () => {
  const held = new Map();
  return {
    held,
    getItem: (key) => (held.has(key) ? held.get(key) : null),
    setItem: (key, value) => held.set(key, String(value)),
  };
};

test("the children's paragraphs are read defensively", () => {
  assert.deepEqual(childrenParagraphs({}), []);
  assert.deepEqual(childrenParagraphs({ childrenSpokenParagraphs: "no" }), []);
  assert.deepEqual(
    childrenParagraphs({ childrenSpokenParagraphs: [" ", "Kept.", 3, null] }),
    ["Kept."],
  );
  assert.equal(hasChildrenVersion(withKids), true);
  assert.equal(hasChildrenVersion(page), false);
});

test("on, the children's paragraphs replace the page's sections and the sources stay; off, the page", () => {
  const shown = knowledgeShown(withKids, true);
  assert.deepEqual(knowledgeSections(shown), [
    { heading: null, paragraphs: kids },
  ]);
  assert.deepEqual(shown.storyParagraphs, kids);
  assert.deepEqual(shown.researchSources, page.researchSources);
  assert.equal(shown.researchNote, page.researchNote);
  const html = renderToStaticMarkup(
    createElement(KnowledgeText, {
      idPrefix: "m31",
      sections: knowledgeSections(shown),
      paragraphs: shown.storyParagraphs,
    }),
  );
  assert.match(html, /Andromeda is a huge city of stars\./);
  assert.doesNotMatch(html, /<h4>/);
  assert.doesNotMatch(html, /First body\./);
  assert.equal(knowledgeShown(withKids, false), withKids);
  // A target with no children's version keeps its page, switch on.
  assert.equal(knowledgeShown(page, true), page);
  assert.equal(knowledgeInChildrenVersion(page), page);
});

test("the photo's panel: the children's paragraphs in place of the page, its sources and the credit kept", () => {
  const target = { id: "m31", designation: "M31", title: "M31 — Andromeda" };
  const off = targetPhotoViewerWords({
    target,
    knowledge: withKids,
    credit: "NASA",
    locale: "en",
  });
  assert.equal(off.page.storySections.length, 2);
  assert.notDeepEqual(off.paragraphs, kids);
  assert.deepEqual(off.childrenKnowledge, { childrenSpokenParagraphs: kids });
  const on = targetPhotoViewerWords({
    target,
    knowledge: withKids,
    credit: "NASA",
    locale: "en",
    children: true,
  });
  assert.deepEqual(on.paragraphs, kids);
  assert.deepEqual(knowledgeSections(on.page), [
    { heading: null, paragraphs: kids },
  ]);
  assert.deepEqual(on.page.researchSources, page.researchSources);
  assert.ok(on.sources);
  // No children's version: the page, with the switch on.
  const none = targetPhotoViewerWords({
    target,
    knowledge: page,
    credit: "NASA",
    locale: "en",
    children: true,
  });
  assert.equal(none.page.storySections.length, 2);
  assert.equal(none.childrenKnowledge, null);
});

test("the control draws a tertiary button with an icon and a word", () => {
  const html = renderToStaticMarkup(
    createElement(ChildrenVersionControl, {
      knowledge: withKids,
      locale: "fr",
    }),
  );
  assert.match(
    html,
    /<button[^>]*class="btn-tertiary children-version-switch"/,
  );
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, /Pour les enfants/);
  assert.doesNotMatch(html, /children-version-soon/);
});

test("a target without a children's version gets the thin line under the control; nothing while its knowledge is not loaded", () => {
  const html = renderToStaticMarkup(
    createElement(ChildrenVersionControl, { knowledge: page, locale: "fr" }),
  );
  assert.match(html, /Pour les enfants/);
  assert.match(
    html,
    /<p class="children-version-soon">Version pour les enfants bientôt disponible<\/p>/,
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(ChildrenVersionControl, { knowledge: null, locale: "fr" }),
    ),
    "",
  );
});

test("the choice is remembered in this browser, under its own key, and every sheet hears it", () => {
  resetChildrenVersion();
  const storage = memoryStorage();
  assert.equal(readChildrenVersion(storage), false);
  let heard = 0;
  const stop = subscribeChildrenVersion(() => {
    heard += 1;
  });
  writeChildrenVersion(true, storage);
  assert.equal(storage.held.get(childrenVersionPreferenceKey), "true");
  assert.equal(childrenVersionPreferenceKey, "nightSession.readAloudChildren");
  assert.equal(childrenVersionSnapshot(), true);
  assert.equal(readChildrenVersion(storage), true);
  assert.equal(heard, 1);
  stop();
  writeChildrenVersion(false, storage);
  assert.equal(heard, 1);
  assert.equal(readChildrenVersion(storage), false);
  // A storage that refuses leaves the page working, off.
  const refusing = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readChildrenVersion(refusing), false);
  writeChildrenVersion(true, refusing);
  assert.equal(childrenVersionSnapshot(), true);
  resetChildrenVersion();
});

test("the two words exist in every shipped language", () => {
  for (const locale of shippedLocales()) {
    for (const key of ["targetChildrenVersion", "targetChildrenVersionSoon"]) {
      const written = message(locale, key);
      assert.ok(written && written !== key, `${locale} ${key}`);
    }
  }
});
