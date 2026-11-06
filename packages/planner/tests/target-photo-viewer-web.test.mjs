import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";
import { targetPhotoViewerWords } from "planner/target-photo-viewer-words.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// On the web, the full-screen photo of a target in a full-screen `WebDialog` —
// the header (pictogram, designation and name, the cross), the photo, the panel
// (facts, tonight's window, the description, the image credit last) — opened by
// the photo of a thumbnail, closed by the cross and by Escape.

await registerJsx();
// `WebDialog` draws through a portal into `document.body` (nothing on the
// server): a stand-in lays its title and body out in place and records the
// props it was given; the shell itself (its cross and Escape both call
// `onClose`) is tested with the other dialogs.
globalThis.__createElement = createElement;
globalThis.__dialogs = [];
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = (props) => { globalThis.__dialogs.push(props); return h("div", { className: "web-dialog-stand-in " + (props.className || "") }, h("header", null, h("h2", null, props.title), props.onClose ? h("button", { type: "button", className: "web-dialog-close", "aria-label": props.closeLabel }) : null), h("div", { className: "web-dialog-body " + (props.bodyClassName || "") }, props.children), props.footer ? h("footer", null, props.footer) : null); };',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { TargetPhotoViewer } =
  await import("planner/components/TargetPhotoViewer.js");
const { PlanTargetDialog } =
  await import("planner/components/PlanTargetDialog.js");
const { TargetTile } = await import("portal/components/ObjectPictogram.js");

const first =
  "La nébuleuse d’Orion est une pouponnière d’étoiles à 1 350 années-lumière, la plus brillante du ciel d’hiver.";
const second =
  "En photo, le cœur très lumineux autour des quatre étoiles du Trapèze sature vite.";
/** M42 as the viewer shows it, in the planner's shape. */
const m42 = {
  id: "m42",
  designation: "M42",
  title: "M42 — Nébuleuse d’Orion",
  integratedMagnitude: 4,
  apparentSizeArcmin: [40, 30],
  skyTarget: {
    typeKey: "Nébuleuse en émission",
    type: "Nébuleuse en émission",
    constellation: "Orion",
  },
  storyParagraphs: [first, second],
  photoThumbnailUrl: "https://images.example.test/m42.jpg",
  photoImageCredit: "NASA/ESA/Hubble",
};
const inPlan = { start: "01:12", end: "04:38", maxAltitude: 41, inPlan: true };

test("the viewer's words are the specified ones, in order, « Crédit de l’image » last", () => {
  const words = targetPhotoViewerWords({
    target: m42,
    window: inPlan,
    credit: "NASA/ESA/Hubble",
    locale: "fr",
  });
  assert.equal(words.designation, "M42");
  assert.equal(words.name, "Nébuleuse d’Orion");
  assert.equal(words.close, "Fermer la photo");
  assert.equal(words.photo, "Photo de M42, Nébuleuse d’Orion");
  assert.equal(words.panel, "Description de la cible");
  assert.deepEqual(words.chips, [
    "Nébuleuse en émission",
    "mag. 4,0",
    "40 × 30′", // Minutes of arc, as the catalogue writes it
    "Orion",
  ]);
  assert.deepEqual(words.tonight, {
    label: "Ce soir",
    line: "01:12 → 04:38 · hauteur max 41° · dans votre plan",
  });
  assert.deepEqual(words.paragraphs, [first, second]);
  assert.deepEqual(words.sources, {
    title: "Crédit de l’image",
    lines: ["Image : NASA/ESA/Hubble"],
  });
  // Outside the plan: the best window, without "dans votre plan"; a
  // catalogue target (its own type, magnitude and size label) reads alike.
  const best = targetPhotoViewerWords({
    target: {
      designation: "NGC 7000",
      title: "NGC 7000",
      type: "Nébuleuse en émission",
      constellation: "Cygne",
      magnitude: 4,
      apparentSizeLabel: "120′ × 100′",
    },
    window: { start: "23:05", end: "05:20", maxAltitude: 44 },
    locale: "fr",
  });
  assert.equal(best.name, null);
  assert.equal(best.tonight.line, "23:05 → 05:20 · hauteur max 44°");
  assert.deepEqual(best.chips, [
    "Nébuleuse en émission",
    "mag. 4,0",
    "120′ × 100′",
    "Cygne",
  ]);
  assert.equal(best.sources, null, "no credit, no credit block");
  // English and Japanese say the same thing.
  const en = targetPhotoViewerWords({
    target: m42,
    window: inPlan,
    credit: "NASA",
    locale: "en",
  });
  assert.equal(
    en.tonight.line,
    "01:12 → 04:38 · max altitude 41° · in your plan",
  );
  assert.equal(en.sources.lines[0], "Image: NASA");
  assert.equal(en.sources.title, "Image credit");
  const ja = targetPhotoViewerWords({
    target: m42,
    window: inPlan,
    locale: "ja",
  });
  assert.equal(ja.close, "写真を閉じる");
  assert.equal(
    targetPhotoViewerWords({ target: m42, credit: "NASA", locale: "ja" })
      .sources.title,
    "画像クレジット",
  );
  assert.notEqual(
    targetPhotoViewerWords({ target: m42, credit: "NASA", locale: "fr" })
      .sources.title,
    "Sources",
    "the image block is never titled « Sources »",
  );
});

test("the image block has its own title in every shipped language, never « Sources »", () => {
  for (const locale of shippedLocales()) {
    const words = targetPhotoViewerWords({
      target: m42,
      credit: "NASA",
      locale,
    });
    assert.equal(
      words.sources.title,
      message(locale, "targetPhotoViewerCreditTitle"),
    );
    assert.notEqual(
      words.sources.title,
      message(locale, "infoSources"),
      locale,
    );
  }
});

test("the viewer is a full-screen dialog: header, photo, panel; its cross and Escape close it", () => {
  globalThis.__dialogs = [];
  let closed = 0;
  const html = renderToStaticMarkup(
    createElement(TargetPhotoViewer, {
      target: m42,
      url: "https://images.example.test/m42.jpg",
      credit: "NASA/ESA/Hubble",
      window: inPlan,
      locale: "fr",
      onClose: () => (closed += 1),
    }),
  );
  const [dialog] = globalThis.__dialogs;
  assert.equal(dialog.className, "target-photo-viewer");
  assert.equal(dialog.closeLabel, "Fermer la photo");
  // The cross and Escape are the shell's, and both call `onClose`: the
  // viewer hands it its caller's.
  dialog.onClose();
  assert.equal(closed, 1);
  assert.match(html, /aria-label="Fermer la photo"/);
  // The header: the type's pictogram, the designation and the name.
  assert.match(html, /data-object-pictogram="emission-nebula"/);
  assert.match(
    html,
    /M42<span class="target-photo-viewer-name"> · Nébuleuse d’Orion<\/span>/,
  );
  // The photo, named.
  assert.match(
    html,
    /<img src="https:\/\/images.example.test\/m42.jpg" alt="Photo de M42, Nébuleuse d’Orion"/,
  );
  // The panel, in order, the credit last.
  assert.match(
    html,
    /<section class="target-photo-viewer-panel" aria-label="Description de la cible">/,
  );
  const at = (needle) => {
    const index = html.indexOf(needle);
    assert.ok(index >= 0, needle);
    return index;
  };
  const order = [
    "target-photo-viewer-photo",
    "Nébuleuse en émission</li>",
    "mag. 4,0",
    "<b>Ce soir</b> 01:12 → 04:38 · hauteur max 41° · dans votre plan",
    first,
    second,
    "<h3>Crédit de l’image</h3>",
    "Image : NASA/ESA/Hubble",
  ];
  for (let index = 1; index < order.length; index += 1)
    assert.ok(at(order[index - 1]) < at(order[index]), order[index]);
  assert.ok(
    at("Image : NASA/ESA/Hubble") > html.lastIndexOf("<p"),
    "the credit is the last line",
  );
});

test("a thumbnail's photo is a button that opens the viewer; a pictogram opens nothing", () => {
  const opened = [];
  const tile = (target, onOpen) =>
    renderToStaticMarkup(
      createElement(TargetTile, {
        target,
        locale: "fr",
        openLabel: "Voir la photo de M42 en plein écran",
        onOpen,
      }),
    );
  const html = tile(m42, (photo) => opened.push(photo));
  assert.match(
    html,
    /^<button type="button" class="object-pictogram-frame has-image target-photo-open" aria-label="Voir la photo de M42 en plein écran"/,
  );
  assert.match(html, /<img src="https:\/\/images.example.test\/m42.jpg"/);
  // Without `onOpen`, today's tile; without a photo, the pictogram only.
  assert.match(
    tile(m42, undefined),
    /^<span class="object-pictogram-frame has-image">/,
  );
  const bare = { ...m42, photoThumbnailUrl: null };
  assert.doesNotMatch(
    tile(bare, () => {}),
    /<button/,
  );

  // The dialog of a plan target: its photo is that button.
  const markup = renderToStaticMarkup(
    createElement(PlanTargetDialog, {
      item: {
        key: "m42",
        index: 0,
        designation: "M42",
        name: "Nébuleuse d’Orion",
        target: m42,
        start: "2026-10-15T01:12:00Z",
        end: "2026-10-15T04:38:00Z",
        minutes: 206,
      },
      night: null,
      locale: "fr",
      at: (value) => value.slice(11, 16),
      onClose: () => {},
    }),
  );
  assert.match(
    markup,
    /<button type="button" class="object-pictogram-frame plan-target-photo has-image target-photo-open" aria-label="Voir la photo de M42 en plein écran"/,
  );
});
