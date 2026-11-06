import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "portal/i18n.js";
import { planTargetSheetWords } from "planner/plan-target-words.js";
import { targetPhotoViewerWords } from "planner/target-photo-viewer-words.js";
import { spokenTextChoice } from "portal/spoken-text.js";
import { clock } from "planner/wind-section.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// BRIGHT-STARS-DESCRIPTION-SHOW-01: the short text of a bright star (Véga) and
// of a constellation (the Lyre) — `description` of `GET /v1/targets/{id}`,
// which the service also serves as `story`, `storyParagraphs` and
// `storySections` — is the description of the planning dialog and of the
// panel of the full-screen photo, and the text the voice reads, like the
// published page of any other target. The answers are the service's own
// (`fixtures/bright-stars-description.json`).

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = (props) => h("div", { className: "web-dialog-stand-in " + (props.className || "") }, h("header", null, h("h2", null, props.title)), h("div", { className: "web-dialog-body " + (props.bodyClassName || "") }, props.children), props.footer ? h("footer", null, props.footer) : null);',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { PlanTargetDialog } =
  await import("planner/components/PlanTargetDialog.js");
const { TargetPhotoViewer } =
  await import("planner/components/TargetPhotoViewer.js");

const served = JSON.parse(
  readFileSync(
    new URL("./fixtures/bright-stars-description.json", import.meta.url),
    "utf8",
  ),
);
const escaped = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
const at = (value) => clock(value, "fr", "UTC");
const itemOf = (target) => ({
  index: 0,
  key: "item-0",
  id: target.id,
  label: target.designation,
  designation: target.designation,
  name: null,
  target,
  start: "2026-10-14T19:49:00.000Z",
  end: "2026-10-14T21:49:00.000Z",
  minutes: 120,
});

for (const [key, locale] of [
  ["star-hip-91262.fr", "fr"],
  ["constellation-lyr.fr", "fr"],
  ["star-hip-91262.en", "en"],
  ["constellation-lyr.en", "en"],
]) {
  const knowledge = served[key];
  const { constellationInfo: ignored, ...sheet } = knowledge;
  const text = escaped(knowledge.description);
  // The planner's own shape: the card of the catalogue and its sky target.
  const target = {
    ...sheet,
    objects: [sheet.designation],
    skyTarget: { type: sheet.type, constellation: sheet.constellation },
  };

  test(`${key}: the planning dialog's description is the short text, nothing folded`, () => {
    const html = renderToStaticMarkup(
      createElement(PlanTargetDialog, {
        item: itemOf(target),
        night: null,
        locale,
        at,
        onClose: () => {},
      }),
    );
    assert.ok(html.includes(text));
    assert.ok(!html.includes(message(locale, "tonightSeeMore")));
    assert.ok(!html.includes("<h4>"), "the opening has no intertitle");
    assert.ok(!html.includes("detail-target-research-sources"));
    assert.ok(!html.includes("ciel profond") && !html.includes("deep-sky"));
  });

  test(`${key}: the panel of the photo shows it`, () => {
    const html = renderToStaticMarkup(
      createElement(TargetPhotoViewer, {
        target,
        url: "https://images.example.test/x.jpg",
        locale,
        onClose: () => {},
      }),
    );
    assert.ok(html.includes(text));
    assert.ok(!html.includes(message(locale, "tonightSeeMore")));
  });

  test(`${key}: the voice reads that text`, () => {
    assert.deepEqual(spokenTextChoice(sheet), {
      source: "written",
      paragraphs: [knowledge.description],
    });
    assert.equal(
      planTargetSheetWords({ item: itemOf(target), locale, at }).description
        .paragraphs[0],
      knowledge.description,
    );
    assert.deepEqual(targetPhotoViewerWords({ target, locale }).paragraphs, [
      knowledge.description,
    ]);
  });
}
