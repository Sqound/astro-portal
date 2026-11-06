import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { registerHooks } from "node:module";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The head of "Pourquoi cette cible ce soir" shows the target's own photo,
// the pictogram of its type only when the image is missing, never the fixed
// galaxy glyph the sheet used to draw for every target.

await registerJsx();
// `WebDialog` draws through a portal into `document.body` (nothing on the
// server): a stand-in that lays the title and the body out in place lets the
// body be read as markup. The dialog shell itself is tested elsewhere.
globalThis.__createElement = createElement;
const DIALOG = `data:text/javascript,${encodeURIComponent(
  'const h = globalThis.__createElement; export const WebDialog = ({ title, children }) => h("div", { className: "web-dialog-stand-in" }, h("h2", null, title), h("div", { className: "web-dialog-body" }, children));',
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "portal/components/dialog/WebDialog.js")
      return { url: DIALOG, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { TargetScoreExplained } =
  await import("planner/components/TargetScoreExplained.js");

const score = { total: 82, max: 100, verdict: "good", criteria: [] };
const card = (target) => ({
  target: {
    id: "m31",
    designation: "M31",
    title: "M31 — Galaxie d’Andromède",
    skyTarget: { typeKey: "Galaxie", type: "Galaxie" },
    ...target,
  },
});
const render = (target) =>
  renderToStaticMarkup(
    createElement(TargetScoreExplained, {
      score,
      card: card(target),
      date: "2026-10-14",
      locale: "fr",
      placeName: "Camping du Lac Noir",
      timeZone: "UTC",
      onClose: () => {},
    }),
  );
const head = (markup) =>
  markup.match(
    /<div class="planner-target-score-target">(.*?)<\/div><div/s,
  )?.[1] ?? markup;

test("the head shows the photo of the target when it has one", () => {
  const markup = render({
    featured: { imageUrl: "https://images.example.test/m31.jpg" },
  });
  // The photo is the button that opens the full-screen photo.
  assert.match(
    markup,
    /<button type="button" class="object-pictogram-frame planner-target-score-tile has-image target-photo-open" aria-label="Voir la photo de M31 en plein écran"/,
  );
  assert.match(markup, /<img src="https:\/\/images\.example\.test\/m31\.jpg"/);
  assert.doesNotMatch(head(markup), /data-object-pictogram/);
});

test("without an image the head shows the pictogram of the type, not the fixed galaxy glyph", () => {
  const markup = render({});
  assert.match(markup, /planner-target-score-tile/);
  assert.match(markup, /data-object-pictogram="galaxy"/);
  assert.doesNotMatch(markup, /planner-target-score-glyph/);
  const nebula = render({
    skyTarget: {
      typeKey: "Nébuleuse en émission",
      type: "Nébuleuse en émission",
    },
  });
  assert.match(nebula, /data-object-pictogram="emission-nebula"/);
});

// "Statistiques de la
// cible" — order A, "Cette nuit", "Saison", "Caractéristiques", the
// catalogue's version. Server rendering of the real component.
const n = "\u00a0";
const place = {
  id: "col",
  name: "Col des Mélèzes",
  latitude: "45",
  longitude: "-30",
  timeZone: "UTC",
};
const m31 = {
  coordinate: { ra: 10.68, dec: 41.27 },
  apparentSizeArcmin: [178, 70],
  integratedMagnitude: 3.4,
  skyTarget: {
    typeKey: "Galaxie",
    type: "Galaxie",
    constellation: "Andromède",
  },
  distanceLy: 2540000,
  distanceSource: "published",
  knowledge: { story: "Une galaxie." },
};
const factsScore = {
  total: 82,
  max: 100,
  verdict: "good",
  criteria: [
    {
      key: "moon",
      points: 10,
      max: 15,
      available: true,
      facts: {
        illumination: 23,
        separation: 124,
        targetName: "M31",
        state: "sets",
        setAt: "2026-10-14T21:05:00Z",
      },
    },
  ],
};
const night = { place, constraints: { minAltitude: 30 } };
const renderFacts = (target, props = {}) =>
  renderToStaticMarkup(
    createElement(TargetScoreExplained, {
      score: factsScore,
      card: card(target),
      date: "2026-10-14",
      locale: "fr",
      placeName: place.name,
      timeZone: "UTC",
      night,
      onClose: () => {},
      ...props,
    }),
  );
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replaceAll("\u00a0", " ");
const sections = (markup) =>
  [...markup.matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map(([, title]) => title);

test("order A: the head, the note's section, « Cette nuit », « Saison », « Prévisualiser », « Caractéristiques », « Détail de la note », then the link « À propos de la cible »", () => {
  const markup = renderFacts(m31);
  assert.match(markup, /<h2[^>]*>Statistiques de la cible<\/h2>/);
  assert.deepEqual(sections(markup), [
    "Pourquoi cette cible ce soir",
    "Cette nuit",
    "Saison",
    "Prévisualiser",
    "Caractéristiques",
    "Détail de la note",
  ]);
  // The head's line of facts keeps the type only.
  assert.match(head(markup), />Galaxie</);
  assert.doesNotMatch(head(markup), /magnitude|≈/);
  const about = markup.indexOf("À propos de la cible");
  assert.ok(about > markup.indexOf("Détail de la note"));
  assert.match(markup, /class="btn-link planner-target-facts-about"/);
  assert.ok(markup.indexOf("Ces valeurs sont des estimations.") < about);
  // "Pourquoi cette cible ce soir" holds the total and the verdict only, under
  // the grey note that says it depends on the place of the sheet.
  assert.match(
    text(markup),
    /Pourquoi cette cible ce soir Selon le lieu de la fiche 82 \/ 100 Bonne cible pour ce soir/,
  );
});

test("under the curve, « Déplacement de la cible » for the night shown — the map, its legend, the lines of the night without the culmination, the glyph in the corner; another night draws it again", () => {
  const markup = renderFacts(m31);
  const card = markup.indexOf('data-testid="facts-path"');
  assert.ok(
    card > markup.indexOf("planner-target-facts-chart"),
    "under the curve",
  );
  assert.ok(card < markup.indexOf("Saison"), "before « Saison »");
  const body = text(markup.slice(card, markup.indexOf("Saison", card)));
  assert.match(body, /> Déplacement de la cible /);
  assert.match(body, /Meilleure fenêtre · \d\d:\d\d – \d\d:\d\d/);
  assert.match(body, /Trajet visible/);
  // The Moon is down while the target is up on this night (it sets before
  // the dark): no line, no track, no legend entry.
  assert.doesNotMatch(body, /Écart avec la Lune/);
  assert.doesNotMatch(body, /is-moon/);
  // The culmination is written once, above the curve.
  assert.doesNotMatch(body, /Culmine/);
  assert.match(markup, /data-testid="facts-path-enlarge"/);
  assert.match(markup, /data-glyph="target-path"/);
  // The card's window is the curve's.
  const curve = text(markup).match(
    /Meilleure fenêtre (\d\d:\d\d) → (\d\d:\d\d)/,
  );
  assert.ok(body.includes(`${curve[1]} – ${curve[2]}`), body);
  // A month later the map is drawn again for that night.
  const later = renderFacts(m31, { date: "2026-11-14" });
  const laterBody = text(
    later.slice(later.indexOf('data-testid="facts-path"')),
  );
  assert.notEqual(
    laterBody.match(/Meilleure fenêtre · [^A-Z]*/)[0],
    body.match(/Meilleure fenêtre · [^A-Z]*/)[0],
  );
  // A target that never clears the horizon has no card.
  assert.doesNotMatch(
    renderFacts({ ...m31, coordinate: { ra: 10, dec: -70 } }),
    /facts-path"/,
  );
});

test("the Moon over the night on the polar card — two figures « 120°–168° », its track and its place in the legend; the note says the same two figures; the curve and the map give one culmination", () => {
  // The full Moon of 26 October: up all night.
  const markup = renderFacts(m31, { date: "2026-10-26" });
  const card = markup.indexOf('data-testid="facts-path"');
  const body = text(markup.slice(card, markup.indexOf("Saison", card)));
  const line = body.match(/Écart avec la Lune : (\d+°–\d+°)/);
  assert.ok(line, body);
  assert.match(markup.slice(card), /class="is-moon"/);
  assert.match(markup.slice(card), /data-testid="path-moon"/);
  assert.match(body, /Trajet visible Lune/);
  // The note's sentence ("Détail de la note") carries the very figures.
  const note = text(markup.slice(markup.indexOf("Détail de la note")));
  assert.ok(
    note.includes(`à ${line[1]} de M31`) || note.includes(line[1]),
    note,
  );
  // One culmination: above the curve and on the map's own label.
  const above = text(markup).match(/Culmine à (\d+)° à (\d\d:\d\d)/);
  assert.ok(above);
  assert.ok(body.includes(`${above[2]} · ${above[1]}°`), body);
  // The end and the culmination are always written; the full hours along
  // the path are at most two (a stretch of 3 h or more between the
  // horizon, the culmination and the end), whole, each hour once.
  assert.match(markup.slice(card), /class="is-end-label"/);
  const hours = [
    ...markup.slice(card).matchAll(/class="is-tick-label"[^>]*>(\d\d:00)</g),
  ].map((match) => match[1]);
  assert.ok(hours.length <= 2, hours.join(","));
  assert.equal(new Set(hours).size, hours.length);
});

test("« Cette nuit »: the best window, the culmination, the curve and its legend; a target that never clears the threshold gets the sentence instead", () => {
  const body = text(renderFacts(m31));
  assert.match(body, /Meilleure fenêtre \d\d:\d\d → \d\d:\d\d/);
  assert.match(body, /Culmine à \d+° à \d\d:\d\d/);
  assert.match(
    body,
    /Hauteur Hauteur minimale \(30°\) Sous la hauteur minimale \(30°\) Derrière le masque d’horizon/,
  );
  assert.match(body, /Calculé sur cet appareil : hauteur d’au moins 30°\./);
  const markup = renderFacts(m31);
  assert.match(
    markup,
    /<svg class="planner-target-facts-chart"[^>]*role="img" aria-label="Hauteur de M31 entre \d\d:\d\d et \d\d:\d\d\."/,
  );
  for (const mark of ["30°", "60°", "90°"])
    assert.ok(markup.includes(`>${mark}</text>`));
  // Never above 30° at 45° N: the sentence replaces the curve.
  const low = renderFacts({ ...m31, coordinate: { ra: 10, dec: -70 } });
  assert.match(
    text(low),
    /La cible ne dépasse pas la hauteur minimale de 30°\./,
  );
  assert.doesNotMatch(low, /planner-target-facts-chart/);
});

test("« Saison »: an inline loading state while it is worked out, the card without « Nuits à venir », a planet's own sentence", async () => {
  const markup = renderFacts(m31);
  assert.match(markup, /data-testid="facts-season-loading"/);
  assert.doesNotMatch(text(markup), /Nuits à venir/);
  const { factsSeason } = await import("planner/target-facts-model.js");
  const { TargetSeasonBlock } =
    await import("planner/components/TargetFactsBlocks.js");
  const ready = factsSeason({
    card: card(m31),
    context: { place, date: "2026-10-14", constraints: { minAltitude: 30 } },
    locale: "fr",
  });
  assert.equal(ready.status, "ready");
  const season = text(
    renderToStaticMarkup(
      createElement(TargetSeasonBlock, { locale: "fr", season: ready }),
    ),
  );
  assert.match(season.trim(), /^Saison /);
  // The card of a target of the plan or of the catalogue alike has its
  // "étendre" button, given the year it is worked out from.
  assert.equal(ready.yearArgs.from, "2026-10-14");
  assert.match(
    renderToStaticMarkup(
      createElement(TargetSeasonBlock, { locale: "fr", season: ready }),
    ),
    /aria-label="Voir l’année"/,
  );
  assert.match(season, /Calculé sur cet appareil : hauteur d’au moins 30°/);
  assert.doesNotMatch(season, /Nuits à venir/);
  // A planet has its season, worked out like any target's: the loading state,
  // then the card; the Sun and the Moon say why they have none.
  const planet = renderFacts({
    ...m31,
    id: "planner-planet-mars",
    body: "Mars",
    tags: ["planet"],
    skyTarget: { typeKey: "Planète", type: "Planète" },
  });
  assert.match(planet, /data-testid="facts-season-loading"/);
  const planetSeason = factsSeason({
    card: card({ ...m31, id: "planner-planet-vénus", tags: ["planet"] }),
    context: { place, date: "2026-10-14", constraints: { minAltitude: 30 } },
    locale: "fr",
  });
  assert.equal(planetSeason.status, "ready");
  assert.match(
    planetSeason.rules,
    /Lune sans effet sur une planète, Soleil à −6° ou plus bas/,
  );
  assert.equal(planetSeason.yearArgs.target.id, "solar-system-venus");
  const sun = renderFacts({
    ...m31,
    id: "solar-system-sun",
    tags: ["planet"],
    skyTarget: { typeKey: "Planète", type: "Planète" },
  });
  assert.match(
    text(sun),
    /Le Soleil et la Lune n’ont pas de saison : leur place change trop vite sur le fond d’étoiles\./,
  );
  assert.doesNotMatch(sun, /data-testid="facts-season-loading"/);
});

test("« Caractéristiques »: one tile per known datum, « Taille apparente », « ≈ » only for a redshift distance, none for an unknown datum", () => {
  const tiles = (markup) =>
    [
      ...markup.matchAll(
        /<div data-fact="(\w+)"><dt>(.*?)<\/dt><dd>(.*?)<\/dd>(?:<small>(.*?)<\/small>)?/g,
      ),
    ].map(([, key, label, value, note]) => [key, label, value, note ?? null]);
  assert.deepEqual(tiles(renderFacts(m31)), [
    ["constellation", "Constellation", "Andromède", null],
    ["magnitude", "Magnitude", "3,4", null],
    ["size", "Taille apparente", "178 × 70′", null],
    ["distance", "Distance", "2,5 millions d’années-lumière", "valeur publiée"],
  ]);
  const redshift = tiles(
    renderFacts({ ...m31, distanceLy: 240000000, distanceSource: "redshift" }),
  ).at(-1);
  assert.deepEqual(redshift, [
    "distance",
    "Distance",
    `≈${n}240 millions d’années-lumière`,
    "estimation d’après le décalage vers le rouge",
  ]);
  // An unknown datum has no tile; no datum, no block.
  const bare = renderFacts({
    id: "x",
    coordinate: { ra: 10, dec: 41 },
    skyTarget: { type: "Galaxie" },
  });
  assert.deepEqual(tiles(bare), []);
  assert.doesNotMatch(bare, /target-facts-facts/);
  const noDistance = tiles(
    renderFacts({ ...m31, distanceLy: null, distanceSource: null }),
  );
  assert.deepEqual(
    noDistance.map(([key]) => key),
    ["constellation", "magnitude", "size"],
  );
  // A planet: neither constellation nor distance.
  const planet = tiles(
    renderFacts({
      ...m31,
      id: "planner-planet-mars",
      tags: ["planet"],
      skyTarget: { typeKey: "Planète", type: "Planète" },
    }),
  );
  assert.deepEqual(
    planet.map(([key]) => key),
    ["magnitude", "size"],
  );
});

test("the catalogue's version: no note, « Lieu : … Modifier », no place saved says so with one tertiary « Ajouter un lieu »", () => {
  const catalogue = {
    place,
    places: [place, { ...place, id: "lac", name: "Camping du Lac Noir" }],
    darkness: "astronomical",
    onAddPlace: () => {},
  };
  const markup = renderFacts(m31, { score: null, catalogue });
  assert.deepEqual(sections(markup), [
    "Cette nuit",
    "Saison",
    "Prévisualiser",
    "Caractéristiques",
  ]);
  assert.doesNotMatch(markup, /Pourquoi cette cible|Détail de la note/);
  assert.match(
    text(markup),
    /Lieu : Col des Mélèzes Modifier Cette nuit Meilleure fenêtre/,
  );
  assert.match(markup, /<button type="button" class="btn-link"[^>]*>Modifier/);
  const empty = renderFacts(m31, {
    score: null,
    catalogue: { ...catalogue, place: null, places: [] },
  });
  assert.doesNotMatch(empty, /Lieu :|Modifier/);
  assert.match(
    text(empty),
    /Aucun lieu enregistré\. Ajoutez-en un pour voir la courbe de la nuit et la saison de cette cible\./,
  );
  assert.match(
    text(empty),
    /Choisissez un lieu pour voir la saison de cette cible\./,
  );
  // One tertiary for the place; « Prévisualiser » has its own, for the
  // equipment.
  assert.equal(
    empty.match(/btn-tertiary(?! planner-target-preview-change)/g).length,
    1,
  );
  assert.equal(empty.match(/>Ajouter un lieu</g).length, 1);
  // "Caractéristiques" does not depend on the place.
  assert.match(empty, /Taille apparente/);
});

test("nothing on the dialog's path reads a capability", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of [
    "components/TargetScoreExplained.js",
    "components/TargetFactsBlocks.js",
    "components/TargetKnowledgeDetails.js",
    "target-facts-model.js",
    "tonight-document.js",
  ]) {
    const source = await readFile(
      new URL(`../src/${file}`, import.meta.url),
      "utf8",
    );
    // The code, not the comments that say it reads none.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /capabilit|entitlement|advancedPlanning/i, file);
  }
});

// ## The sky of the place in « Prévisualiser » (TARGET-STATS-SKY-PLACE-01)
const refractorConfiguration = {
  mode: "visual",
  telescopeId: "altair-starwave-ascent-70ed",
  eyepieceId: "plossl-25",
  cameraId: "zwo-asi2600mc-pro",
  modifierId: "none",
};
const faintGalaxy = {
  ...m31,
  integratedMagnitude: 12.5,
  apparentSizeArcmin: [3, 2],
};
const typedSky = {
  source: "entered",
  shown: { sqm: 21.3, bortleClass: 4 },
};
const skyPreview = (over = {}) => ({
  configuration: refractorConfiguration,
  skyChoice: typedSky,
  sky: typedSky.shown,
  skyPlaceName: "Col des Mélèzes",
  skyPlaceKey: "col",
  skyLoading: false,
  ...over,
});
const renderVisual = (props = {}, target = m31) =>
  renderFacts(target, { visualMode: true, ...props });
const testid = (markup, id) =>
  text(
    markup.match(
      new RegExp(`data-testid="${id}"[^>]*>(.*?)</(?:div|p|button)>`, "s"),
    )?.[1] ?? "",
  ).trim();

test("the grey note « Selon le lieu de la fiche » sits under the title of the note and of its detail, and nowhere in Photo", () => {
  const markup = renderFacts(m31, {
    preview: skyPreview({ configuration: null }),
  });
  assert.equal(markup.match(/Selon le lieu de la fiche/g).length, 2);
  assert.match(
    markup,
    /<h3 id="target-facts-why">[^<]*<\/h3><p class="planner-target-score-place-note" data-testid="place-note-why">Selon le lieu de la fiche<\/p>/,
  );
  assert.match(
    markup,
    /<h3 id="target-facts-detail">[^<]*<\/h3><p class="planner-target-score-place-note" data-testid="place-note-detail">Selon le lieu de la fiche<\/p>/,
  );
  // Photo (the section opens there for a photo target): no tile, no note.
  const section = markup.slice(
    markup.indexOf('data-testid="facts-preview"'),
    markup.indexOf("Caractéristiques"),
  );
  assert.doesNotMatch(section, /Selon le lieu|preview-sky/);
  // Without a note (the catalogue): no note either.
  const catalogue = renderFacts(m31, {
    score: null,
    catalogue: { place, places: [], darkness: "astronomical" },
    preview: skyPreview(),
  });
  assert.doesNotMatch(catalogue, /Selon le lieu de la fiche/);
});

test("visual: the tile « Ciel du lieu » and the message say the place's sky and where it comes from", () => {
  const markup = renderVisual({ preview: skyPreview() });
  assert.match(
    markup,
    /data-testid="preview-sky-tile"[^>]*aria-haspopup="dialog"/,
  );
  assert.equal(testid(markup, "preview-sky-tile"), "Bortle 4 Ciel du lieu");
  assert.equal(
    testid(markup, "preview-sky-from"),
    "Vue depuis Col des Mélèzes",
  );
  assert.equal(
    testid(markup, "preview-sky-how"),
    "Ciel de Bortle 4 (SQM 21,3) · valeur saisie pour ce lieu",
  );
  assert.doesNotMatch(markup, /preview-sky-revert|preview-sky-choose/);
  // The tile follows the tiles' look: after the equipment's two lines, before the plan's.
  assert.ok(
    markup.indexOf('data-testid="preview-sky"') >
      markup.indexOf('data-testid="preview-equipment"'),
  );
  for (const [source, word] of [
    ["measured", "mesurée"],
    ["model", "estimée"],
  ])
    assert.match(
      testid(
        renderVisual({
          preview: skyPreview({ skyChoice: { ...typedSky, source } }),
        }),
        "preview-sky-how",
      ),
      new RegExp(`valeur ${word} pour ce lieu$`),
    );
});

test("visual without a value for the place: « Ciel inconnu », the dark sky by default, « Choisir un ciel », nothing blocked", () => {
  const markup = renderVisual({
    preview: skyPreview({ skyChoice: null, sky: null }),
  });
  assert.equal(testid(markup, "preview-sky-tile"), "Ciel inconnu Ciel du lieu");
  assert.match(markup, /data-sky="unknown"/);
  assert.match(
    testid(markup, "preview-sky-how"),
    /^Ciel inconnu : la vue est calculée avec un ciel sombre par défaut\.$/,
  );
  assert.equal(testid(markup, "preview-sky-choose"), "Choisir un ciel");
  assert.doesNotMatch(markup, /preview-visibility/);
  // The disc, the equipment and « Changer le matériel » are all there.
  assert.match(markup, /data-testid="preview-equipment"/);
  assert.match(markup, /planner-target-preview-change/);
});

test("visual while the place's values are read: the loading icon in the tile, no value, no message, no disc", () => {
  const markup = renderVisual({ preview: skyPreview({ skyLoading: true }) });
  assert.match(markup, /data-sky-loading="true"/);
  assert.match(
    markup,
    /data-testid="preview-sky-tile"[^>]*aria-busy="true"[^>]*>.*?data-brand-loader/s,
  );
  assert.doesNotMatch(markup, /Bortle 4|preview-sky-message/);
  // The disc waits too: nothing drawn under the loading icon.
  assert.doesNotMatch(markup, /planner-eyepiece-view/);
  assert.match(markup, /data-testid="preview-loading"/);
});

test("visual: only the loading icon and « Vue en préparation… » in the disc until its picture is made, the disc under it never shown raw", () => {
  const markup = renderVisual({ preview: skyPreview() });
  const figure = markup.slice(
    markup.indexOf("planner-target-preview-figure is-visual"),
    markup.indexOf("planner-target-preview-text"),
  );
  assert.match(figure, /data-testid="preview-loading"/);
  assert.match(figure, /data-brand-loader/);
  assert.match(text(figure), /Vue en préparation…/);
  // The overlay is the last thing of the figure, over the canvas.
  assert.ok(
    figure.indexOf("preview-loading") > figure.indexOf("planner-eyepiece-view"),
  );
  assert.match(figure, /style="background:rgb\(\d+, \d+, \d+\)"/);
});

test("photo: the same loading icon in the square until the survey is there", () => {
  const markup = renderFacts(m31, {
    preview: skyPreview({ configuration: null }),
  });
  const figure = markup.slice(
    markup.indexOf("planner-target-preview-figure is-photo"),
    markup.indexOf("planner-target-preview-text"),
  );
  assert.match(figure, /data-preview-photo="waiting"/);
  assert.match(figure, /data-testid="preview-loading"/);
  assert.match(text(figure), /Vue en préparation…/);
});

test("visual: the visibility notice under the disc when the target is hard to see under the sky of the place", () => {
  const markup = renderVisual({ preview: skyPreview() }, faintGalaxy);
  assert.match(
    markup,
    /data-testid="preview-visibility"[^>]*data-visibility="difficult"/,
  );
  assert.match(
    testid(markup, "preview-visibility"),
    /Cible difficilement visible avec ce matériel/,
  );
  assert.match(text(markup), /Magnitude limite 11,8 sous ce ciel\./);
  // It stands in the warning slot, before the equipment.
  assert.ok(
    markup.indexOf("preview-visibility") <
      markup.indexOf('data-testid="preview-equipment"'),
  );
  // A target that shows well: nothing.
  assert.doesNotMatch(
    renderVisual({ preview: skyPreview() }),
    /preview-visibility/,
  );
  // Under a bright sky it is « probablement invisible ».
  const bright = renderVisual(
    {
      preview: skyPreview({
        skyChoice: { source: "measured", shown: { sqm: 18.7, bortleClass: 7 } },
      }),
    },
    faintGalaxy,
  );
  assert.match(bright, /data-visibility="unlikely"/);
  assert.match(text(bright), /Cible probablement invisible avec ce matériel/);
  // Photo: never.
  assert.doesNotMatch(
    renderFacts(faintGalaxy, { preview: skyPreview({ configuration: null }) }),
    /preview-visibility/,
  );
});

test("the catalogue's place picked in the dialog gives its own sky when the page can say it", () => {
  const catalogue = {
    place,
    places: [
      place,
      {
        id: "lac",
        name: "Lac Noir",
        latitude: "46",
        longitude: "-30",
        timeZone: "UTC",
      },
    ],
    darkness: "astronomical",
  };
  const skyForPlace = (picked) => ({
    ...skyPreview({ skyPlaceName: picked.name, skyPlaceKey: picked.id }),
    skyChoice: { source: "measured", shown: { sqm: 21.9, bortleClass: 3 } },
  });
  const markup = renderFacts(m31, {
    score: null,
    visualMode: true,
    catalogue,
    preview: { ...skyPreview(), skyForPlace },
  });
  // Nothing picked yet: the page's own place.
  assert.equal(
    testid(markup, "preview-sky-from"),
    "Vue depuis Col des Mélèzes",
  );
});

test("FRAMING-FROM-PREVIEW-01: « Créer un cadrage » is a secondary above « Choisir mon matériel », on Photo only and with a page to open the editor", () => {
  const onCreateFraming = () => {};
  const photo = renderFacts(m31, {
    preview: skyPreview({
      onCreateFraming,
      configuration: { ...refractorConfiguration, mode: "imaging" },
    }),
  });
  assert.equal(testid(photo, "preview-create-framing"), "Créer un cadrage");
  assert.match(
    photo,
    /class="btn-secondary planner-target-preview-create"[^>]*data-testid="preview-create-framing"/,
  );
  assert.ok(
    photo.indexOf("planner-target-preview-create") <
      photo.indexOf("planner-target-preview-change"),
  );
  // Visual: no button.
  assert.doesNotMatch(
    renderVisual({ preview: skyPreview({ onCreateFraming }) }),
    /preview-create-framing/,
  );
  // A page that mounts no editor and hands none over: no button.
  assert.doesNotMatch(
    renderFacts(m31, {
      preview: skyPreview({
        configuration: { ...refractorConfiguration, mode: "imaging" },
      }),
    }),
    /preview-create-framing/,
  );
});
