import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { message } from "portal/i18n.js";
import { shippedLocales } from "portal/locales.js";
import {
  skyCatalogueMetaLine,
  skyCultureArtCredit,
  skyPictureKindOf,
  skyPictureUrl,
  skyPictureViewerUrl,
} from "portal/sky-pictures.js";
import { targetImageVariant } from "portal/target-image-variants.js";
import { targetPhotoViewerWords } from "planner/target-photo-viewer-words.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The pictures of the bright stars and of the constellations on the web: the
// app's sky map, pre-rendered and served beside the other target pictures.
// They stand where a target's thumbnail stands (the catalogue's card, the
// tile of « Statistiques de la cible », the plans' and the suggestions'
// thumbnails), the full-screen viewer shows the large one, and « Prévisualiser »
// of a constellation is its bare sky.

const vega = {
  id: "star-hip-91262",
  designation: "Vega",
  title: "Véga",
  type: "Étoile brillante",
  typeKey: "Étoile brillante",
  constellation: "Lyre",
  magnitude: 0.03,
  catalogues: ["BrightStars"],
  photoThumbnailUrl: "/target-library-images/star-hip-91262.jpg",
  photoImageCredit: null,
};
const lyra = {
  id: "constellation-lyr",
  designation: "Lyra",
  title: "Lyre",
  type: "Constellation",
  typeKey: "Constellation",
  constellation: "Lyre",
  constellationKey: "Lyr",
  magnitude: null,
  catalogues: ["Constellations"],
  photoThumbnailUrl: "/target-library-images/constellation-lyr.jpg",
  photoImageCredit: "Stellarium",
  constellationInfo: {
    abbreviation: "Lyr",
    linesRadiusDegrees: 3.9,
    brightStarCount: 1,
    targetCount: 43,
    hasDrawing: true,
  },
};

test("a bright star and a constellation have their sky picture, in every mode, even without the catalogue's address", () => {
  assert.equal(skyPictureKindOf(vega), "star");
  assert.equal(skyPictureKindOf(lyra), "constellation");
  assert.equal(skyPictureKindOf({ id: "openngc-ngc6720" }), null);
  // A plan's target saved before the catalogue gave the address.
  const saved = { id: "star-hip-91262", designation: "Vega" };
  assert.equal(
    targetImageVariant(saved).url,
    "/target-library-images/star-hip-91262.jpg",
  );
  assert.equal(
    targetImageVariant(
      { ...saved, knowledge: { id: saved.id } },
      {
        visualMode: true,
      },
    ).url,
    "/target-library-images/star-hip-91262.jpg",
  );
  // The viewer shows the large picture; an ordinary target keeps its own.
  assert.equal(
    skyPictureViewerUrl(lyra, lyra.photoThumbnailUrl),
    "/target-library-images/constellation-lyr-full.jpg",
  );
  assert.equal(skyPictureViewerUrl({ id: "m42" }, "/m42.jpg"), "/m42.jpg");
  assert.equal(
    skyPictureUrl(lyra, "naked"),
    "/target-library-images/constellation-lyr-naked.jpg",
  );
});

test("the card's subtitle: « Étoile brillante · Lyre · mag. 0,0 », « Constellation · 1 étoile brillante · 43 cibles »", () => {
  assert.equal(
    skyCatalogueMetaLine(vega, "fr"),
    "Étoile brillante · Lyre · mag. 0,0".replace(" ", " "),
  );
  assert.equal(
    skyCatalogueMetaLine(lyra, "fr"),
    "Constellation · 1\u00a0étoile brillante · 43\u00a0cibles",
  );
  assert.equal(
    skyCatalogueMetaLine(
      {
        ...lyra,
        constellationInfo: { brightStarCount: 3, targetCount: 223 },
      },
      "en",
    ),
    "Constellation · 3 bright stars · 223 targets",
  );
  // No count yet (an older answer), no zero: the type alone.
  assert.equal(
    skyCatalogueMetaLine(
      { ...lyra, constellationInfo: { brightStarCount: 0 } },
      "fr",
    ),
    "Constellation",
  );
  assert.equal(
    skyCatalogueMetaLine(
      { ...lyra, constellationInfo: { brightStarCount: 2, targetCount: 5 } },
      "ru",
    ),
    "Constellation · 2 яркие звезды · 5 целей",
  );
  assert.equal(
    skyCatalogueMetaLine({ id: "m42", type: "Nébuleuse" }, "fr"),
    null,
  );
});

test("the drawings' credit, in ten languages, word for word in French", () => {
  assert.equal(
    skyCultureArtCredit("fr"),
    "Dessins des constellations : Johan Meuris (Stellarium), licence Art Libre",
  );
  assert.equal(shippedLocales().length, 10);
  for (const locale of shippedLocales()) {
    for (const key of [
      "skyCultureArtCredit",
      "catalogueConstellationBrightStars",
      "catalogueConstellationTargets",
      "targetPreviewConstellationField",
      "targetPreviewConstellationNakedEye",
      "targetPreviewConstellationLines",
    ]) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}: ${key}`);
    }
    assert.match(message(locale, "skyCultureArtCredit"), /Johan Meuris/);
  }
});

test("the viewer of a constellation credits the drawing last and does not repeat its name as a chip", () => {
  const words = targetPhotoViewerWords({
    target: lyra,
    credit: "Stellarium",
    locale: "fr",
  });
  assert.deepEqual(words.chips, ["Constellation"]);
  assert.deepEqual(words.sources.lines, [skyCultureArtCredit("fr")]);
  const star = targetPhotoViewerWords({ target: vega, locale: "fr" });
  assert.deepEqual(star.chips, ["Étoile brillante", "mag. 0,0", "Lyre"]);
  assert.equal(star.sources, null);
});

await registerJsx();
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children, footer }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children), footer ? h("div", { className: "web-dialog-footer" }, footer) : null);',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

test("« Prévisualiser » of a constellation: its bare sky, « Traits », the field and the naked eye, no equipment", async () => {
  const { TargetPreviewBlock, TargetPreviewConstellation } =
    await import("planner/components/TargetPreviewBlock.js");
  const html = renderToStaticMarkup(
    createElement(TargetPreviewBlock, { locale: "fr", card: { target: lyra } }),
  );
  assert.match(html, /data-preview-mode="constellation"/);
  assert.match(
    html,
    /src="\/target-library-images\/constellation-lyr-naked.jpg"/,
  );
  assert.match(
    html,
    /<button type="button" class="planner-target-preview-lines" data-testid="preview-constellation-lines" aria-pressed="false">Traits<\/button>/,
  );
  assert.match(html, /data-testid="preview-constellation-field">Champ : ≈ 8°</);
  assert.match(
    html,
    /Une constellation se regarde à l’œil nu ou aux jumelles\./,
  );
  for (const gone of [
    "Matériel d’exemple",
    "Choisir mon matériel",
    "Cadre un champ",
    "planner-target-preview-mode",
  ])
    assert.doesNotMatch(html, new RegExp(gone), gone);
  assert.equal(typeof TargetPreviewConstellation, "function");
  // A bright star keeps the ordinary preview.
  const star = renderToStaticMarkup(
    createElement(TargetPreviewBlock, {
      locale: "fr",
      card: { target: { ...vega, coordinate: { ra: 279.23, dec: 38.78 } } },
    }),
  );
  assert.doesNotMatch(star, /data-preview-mode="constellation"/);
});

test("the catalogue's card, the thumbnails and the « Sources » are wired to the sky pictures", () => {
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /skyCatalogueMetaLine\(target, locale\)/);
  assert.match(page, /catalogueVisualMode && !skyPictureKindOf\(target\)/);
  assert.match(page, /data-sky-culture-art-credit/);
  assert.match(page, /creditTitle=\{/);
  const eyepiece = readFileSync(
    new URL("../src/components/EyepieceViewImage.js", import.meta.url),
    "utf8",
  );
  assert.match(eyepiece, /if \(skyPictureKindOf\(target\)\) return null;/);
  const viewer = readFileSync(
    new URL("../src/components/TargetPhotoViewer.js", import.meta.url),
    "utf8",
  );
  assert.match(viewer, /skyPictureViewerUrl\(target, url\)/);
});
