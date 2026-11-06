import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { objectPictogramKeys } from "astro-core/object-pictograms.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// The ten figures on the 48
// grid, the planner card without an image showing the pictogram of its type
// (never the catalogue letter nor a planet preview), a real image winning, and
// the accessible name. Rendered from synthetic targets.
await registerJsx();
const {
  ImageOrPictogram,
  ObjectPictogram,
  TargetTile,
  objectPictogramFigureKeys,
} = await import("portal/components/ObjectPictogram.js");
const { TargetVisual } = await import("planner/components/TargetVisual.js");

const render = (component, props) =>
  renderToStaticMarkup(createElement(component, props));

const target = (typeKey, extra = {}) => ({
  id: `t-${typeKey}`,
  designation: "M31",
  catalogue: "Messier",
  objects: ["M31"],
  skyTarget: { typeKey, type: typeKey },
  ...extra,
});

test("the ten figures render on the 48 grid, one stroke and a light fill", () => {
  assert.deepEqual(
    [...objectPictogramFigureKeys].sort(),
    [...objectPictogramKeys].sort(),
  );
  for (const key of objectPictogramKeys) {
    const markup = render(ObjectPictogram, { pictogramKey: key, size: 48 });
    assert.match(markup, /viewBox="0 0 48 48"/, key);
    assert.match(markup, new RegExp(`data-object-pictogram="${key}"`), key);
    assert.match(markup, /aria-hidden="true"/, `${key} is decorative alone`);
    assert.match(markup, /="currentColor"/, `${key} is drawn in the colour`);
    if (key !== "open-cluster")
      assert.match(markup, /stroke="currentColor"/, `${key} has its stroke`);
    if (key !== "open-cluster" && key !== "planetary-nebula")
      assert.match(markup, /data-light-fill/, `${key} has a light fill`);
  }
});

test("the type picks the figure; an unknown type and no type give the star", () => {
  const key = (value) =>
    /data-object-pictogram="([^"]+)"/.exec(
      render(ObjectPictogram, { target: value }),
    )[1];
  assert.equal(key(target("Galaxie")), "galaxy");
  assert.equal(
    key(target("Région HII / nébuleuse en émission")),
    "emission-nebula",
  );
  assert.equal(key(target("Planète")), "planet");
  assert.equal(key(target("Quasar")), "star");
  assert.equal(key({}), "star");
  assert.equal(key(null), "star");
});

test("a planner card without an image shows the pictogram, never the letter or a planet preview", () => {
  for (const planet of [
    target("Planète", {
      id: "planner-planet-saturne",
      source: "Saturne",
      tags: ["planet"],
      catalogue: "Planètes",
      objects: ["Saturne"],
    }),
    target("Galaxie"),
    target("Quasar"),
  ]) {
    const markup = render(TargetVisual, { target: planet });
    assert.match(markup, /class="planner-target-visual/);
    assert.match(markup, /class="object-pictogram/);
    assert.doesNotMatch(markup, /planner-planet/);
    assert.doesNotMatch(markup, />(Messier|Planètes|M31|Saturne)</);
    assert.doesNotMatch(markup, /<img/);
  }
  const saturn = render(TargetVisual, {
    target: target("Planète", { tags: ["planet"] }),
  });
  assert.match(saturn, /data-object-pictogram="planet"/);
});

test("a real image always wins over the pictogram", () => {
  const withImage = target("Galaxie", {
    featured: { imageUrl: "https://images.example.test/m31.jpg" },
  });
  const card = render(TargetVisual, { target: withImage });
  assert.match(card, /<img/);
  assert.doesNotMatch(card, /<svg/);
  const tile = render(TargetTile, { target: withImage });
  assert.match(tile, /<img/);
  assert.doesNotMatch(tile, /<svg/);
  assert.match(
    render(TargetTile, { target: target("Galaxie") }),
    /object-pictogram/,
  );
});

test("the name is the type's word where the pictogram stands alone, absent where the row writes the type", () => {
  const galaxy = target("Galaxie");
  const named = (locale) =>
    render(TargetTile, { target: galaxy, named: true, locale });
  assert.match(named("fr"), /role="img" aria-label="Galaxie"/);
  assert.match(named("en"), /role="img" aria-label="Galaxy"/);
  assert.match(named("ja"), /role="img" aria-label="銀河"/);
  assert.doesNotMatch(render(TargetTile, { target: galaxy }), /role="img"/);
  assert.match(render(TargetTile, { target: galaxy }), /aria-hidden="true"/);
  // An unrecognised type keeps its own text; no type, no name.
  assert.match(
    render(TargetTile, { target: target("Quasar"), named: true }),
    /aria-label="Quasar"/,
  );
  assert.doesNotMatch(
    render(TargetTile, { target: {}, named: true }),
    /role="img"/,
  );
  const visual = render(TargetVisual, {
    target: galaxy,
    namedPictogram: true,
    locale: "en",
  });
  assert.match(visual, /aria-label="Galaxy"/);
});

test("a row of the journal shows its image, or the pictogram of the target's type, or the star", () => {
  const withImage = render(ImageOrPictogram, {
    src: "https://images.example.test/m42.jpg",
    target: { typeKey: "Nébuleuse en émission" },
  });
  assert.match(withImage, /<img/);
  assert.doesNotMatch(withImage, /<svg/);
  const typed = render(ImageOrPictogram, {
    target: { typeKey: "Nébuleuse en émission" },
    locale: "en",
  });
  assert.doesNotMatch(typed, /<img/);
  assert.match(typed, /data-object-pictogram="emission-nebula"/);
  assert.match(typed, /aria-label="Emission nebula"/);
  const untyped = render(ImageOrPictogram, { target: { title: "M42" } });
  assert.match(untyped, /data-object-pictogram="star"/);
  assert.doesNotMatch(untyped, /role="img"/);
});

// The preview of a target on the plan
// cards of "Cette nuit" follows the mode of its plan on the web too — the
// visual preview for a visual plan (`TonightPage` passes `visualMode` from the
// plan's equipment), the photograph for a photo plan.
test("a plan card's preview is the visual one for a visual plan and the photograph for a photo plan", () => {
  const withImages = target("Galaxie", {
    knowledge: {
      photoThumbnailUrl: "https://example.test/photo.jpg",
      visualPreviewThumbnailUrl: "https://example.test/visual.jpg",
    },
  });
  const visual = render(TargetTile, { target: withImages, visualMode: true });
  const photo = render(TargetTile, { target: withImages, visualMode: false });
  assert.match(visual, /visual\.jpg/);
  assert.doesNotMatch(visual, /photo\.jpg/);
  assert.match(photo, /photo\.jpg/);
  assert.doesNotMatch(photo, /visual\.jpg/);
});
