import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { knowledgeSections } from "portal/knowledge-sections.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// On the web: the knowledge text of a target that has a published page is shown
// cut at its intertitles, with its sources and the note on their licences; a
// target with a short generated text is shown as before.

await registerJsx();
const { KnowledgeText } =
  await import("planner/components/TargetKnowledgeDetails.js");
const { KnowledgeStory } =
  await import("portal/components/detail/KnowledgeStory.js");

const knowledge = {
  id: "openngc-ngc0224",
  story: "Ouverture. Premier corps. Observer.",
  storyParagraphs: ["Ouverture.", "Premier corps.", "Observer."],
  storySections: [
    { heading: null, paragraphs: ["Ouverture."] },
    {
      heading: "D’une tache floue à un autre univers",
      paragraphs: ["Premier corps."],
    },
    { heading: "À l’œil nu et à l’oculaire", paragraphs: ["Observer."] },
  ],
  researchSources: [
    {
      label: "NASA Science — consulté le 16 octobre 2026",
      url: "https://science.nasa.gov/m31/",
    },
  ],
  researchNote: "Données Wikidata sous licence CC0.",
};

test("the sections are read defensively", () => {
  assert.deepEqual(knowledgeSections({}), []);
  assert.deepEqual(knowledgeSections({ storySections: "no" }), []);
  assert.deepEqual(
    knowledgeSections({
      storySections: [
        { heading: " ", paragraphs: ["Kept."] },
        { heading: "Empty", paragraphs: [] },
        { heading: "Odd", paragraphs: [3, "Text"] },
        null,
      ],
    }),
    [
      { heading: null, paragraphs: ["Kept."] },
      { heading: "Odd", paragraphs: ["Text"] },
    ],
  );
});

test("the popover shows each intertitle above its paragraphs, the opening without one", () => {
  const html = renderToStaticMarkup(
    createElement(KnowledgeText, {
      idPrefix: "m31",
      sections: knowledgeSections(knowledge),
      paragraphs: knowledge.storyParagraphs,
    }),
  );
  assert.equal((html.match(/<section /g) || []).length, 3);
  assert.deepEqual(
    [...html.matchAll(/<h4>(.*?)<\/h4>/g)].map((match) => match[1]),
    ["D’une tache floue à un autre univers", "À l’œil nu et à l’oculaire"],
  );
  assert.ok(html.indexOf("Ouverture.") < html.indexOf("<h4>"));
});

test("the popover keeps the paragraphs of a short generated text", () => {
  const html = renderToStaticMarkup(
    createElement(KnowledgeText, {
      idPrefix: "m31",
      sections: knowledgeSections({ storyParagraphs: ["A.", "B."] }),
      paragraphs: ["A.", "B."],
    }),
  );
  assert.equal(html, "<p>A.</p><p>B.</p>");
});

test("a capture's detail page shows the sections, the sources and their note", () => {
  const html = renderToStaticMarkup(
    createElement(KnowledgeStory, {
      knowledge,
      paragraphs: knowledge.storyParagraphs,
      locale: "fr",
    }),
  );
  assert.match(html, /<h4>À l’œil nu et à l’oculaire<\/h4>/);
  assert.match(html, /href="https:\/\/science\.nasa\.gov\/m31\/"/);
  assert.match(html, /NASA Science — consulté le 16 octobre 2026/);
  assert.match(
    html,
    /detail-target-research-note">Données Wikidata sous licence CC0\./,
  );
  const plain = renderToStaticMarkup(
    createElement(KnowledgeStory, {
      knowledge: { storyParagraphs: ["A."] },
      paragraphs: ["A."],
      locale: "fr",
    }),
  );
  assert.equal(plain, "<p>A.</p>");
});
