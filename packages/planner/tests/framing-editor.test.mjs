import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { localeKeyGaps, message } from "portal/i18n.js";
import {
  framingEditorConfirmLabelKey,
  framingEditorMapInputs,
  mapDisplayedTargets,
  mapMarkerPresentation,
  mapMoveSeconds,
} from "../src/framing-editor.js";

// Web side. The fullscreen
// framing editor of the web planner (`PlannerPage.js`'s `FramingEditorDialog`)
// draws no catalogue marker of its own accord; a target found through the
// magnifier is drawn under its own name whatever the markers' display is set
// to, and can be taken off again; and the confirm button says what it does.

const framing = {
  id: "framing-1",
  designation: "Cadrage",
  title: "Cadrage M31",
  coordinate: { ra: 10.68, dec: 41.27 },
};
const andromeda = {
  id: "m31",
  designation: "M31",
  name: "Galaxie d’Andromède",
  coordinate: { ra: 10.68, dec: 41.27 },
};
const orion = {
  id: "m42",
  designation: "M42",
  coordinate: { ra: 83.8, dec: -5.4 },
};

test("a new framing's map draws no target at all", () => {
  const inputs = framingEditorMapInputs({});
  assert.deepEqual(inputs.cards, []);
  assert.deepEqual(inputs.savedFramingTargets, []);
  assert.equal(inputs.highlightedTarget, null);
  assert.deepEqual(mapDisplayedTargets(inputs), []);
});

test("the editor never hands the map planner cards, the catalogue included", () => {
  // The catalogue reaches the map as `framingTargets` -- the pool a framing is
  // *named* from -- never as something to draw.
  for (const inputs of [
    framingEditorMapInputs({}),
    framingEditorMapInputs({ editingTarget: framing }),
    framingEditorMapInputs({ highlightedTarget: andromeda }),
  ]) {
    assert.deepEqual(inputs.cards, []);
    assert.equal("framingTargets" in inputs, false);
  }
});

test("editing a framing draws that framing and nothing else", () => {
  const displayed = mapDisplayedTargets(
    framingEditorMapInputs({ editingTarget: framing }),
  );
  assert.deepEqual(
    displayed.map((target) => target.id),
    ["framing-1"],
  );
});

test("the catalogue cannot be smuggled in through the display rule either", () => {
  const displayed = mapDisplayedTargets({
    ...framingEditorMapInputs({}),
    framingTargets: [andromeda, orion],
    catalogue: [andromeda, orion],
  });
  assert.deepEqual(displayed, []);
});

test("a target found by the search is drawn, and only that one", () => {
  const displayed = mapDisplayedTargets(
    framingEditorMapInputs({ highlightedTarget: andromeda }),
  );
  assert.deepEqual(
    displayed.map((target) => target.id),
    ["m31"],
  );
});

test("taking the highlight off puts the map back as it was", () => {
  const withHighlight = framingEditorMapInputs({
    editingTarget: framing,
    highlightedTarget: andromeda,
  });
  assert.deepEqual(
    mapDisplayedTargets(withHighlight).map((target) => target.id),
    ["framing-1", "m31"],
  );
  const cleared = framingEditorMapInputs({
    editingTarget: framing,
    highlightedTarget: null,
  });
  assert.deepEqual(
    mapDisplayedTargets(cleared).map((target) => target.id),
    ["framing-1"],
  );
});

test("a target is drawn once, and one with no position is not drawn", () => {
  const twice = mapDisplayedTargets({
    cards: [{ target: andromeda }],
    savedFramingTargets: [],
    highlightedTarget: andromeda,
  });
  assert.equal(twice.length, 1);
  const lost = mapDisplayedTargets({
    highlightedTarget: { id: "x", designation: "X" },
  });
  assert.deepEqual(lost, []);
});

test("the planner's own map still draws the plan's targets", () => {
  const displayed = mapDisplayedTargets({
    cards: [{ target: andromeda }, { target: orion }],
    savedFramingTargets: [framing],
  });
  assert.deepEqual(
    displayed.map((target) => target.id),
    ["m31", "m42", "framing-1"],
  );
});

test("the highlighted target shows even when the markers are hidden", () => {
  const hidden = mapMarkerPresentation({
    targetId: "m31",
    highlightedId: "m31",
    markersVisible: false,
    labelsVisible: false,
  });
  assert.equal(hidden.hidden, false);
  assert.equal(hidden.labelVisible, true);
  assert.equal(hidden.reticle, true);
  assert.equal(hidden.highlighted, true);
});

test("the other targets keep following the display setting", () => {
  const other = mapMarkerPresentation({
    targetId: "m42",
    highlightedId: "m31",
    markersVisible: false,
    labelsVisible: false,
  });
  assert.equal(other.hidden, true);
  assert.equal(other.labelVisible, false);
  assert.equal(other.reticle, false);
  assert.equal(other.highlighted, false);
  const labelled = mapMarkerPresentation({
    targetId: "m42",
    highlightedId: "m31",
    markersVisible: true,
    labelsVisible: true,
  });
  assert.equal(labelled.hidden, false);
  assert.equal(labelled.labelVisible, true);
});

test("the selected target keeps its reticle, and can still be clicked", () => {
  const selected = mapMarkerPresentation({
    targetId: "m42",
    selectedId: "m42",
    markersVisible: true,
    labelsVisible: true,
  });
  assert.equal(selected.reticle, true);
  assert.equal(selected.interactive, true);
});

test("the highlight is a mark on the map, not a target to click", () => {
  const highlighted = mapMarkerPresentation({
    targetId: "m31",
    highlightedId: "m31",
  });
  assert.equal(highlighted.interactive, false);
});

test("nothing is highlighted by default", () => {
  const plain = mapMarkerPresentation({ targetId: "m31" });
  assert.equal(plain.highlighted, false);
  assert.equal(plain.hidden, false);
  assert.equal(plain.labelVisible, true);
});

test("a visitor who prefers less motion is taken to the target without crossing the sky", () => {
  assert.equal(mapMoveSeconds(), 0.3);
  assert.equal(mapMoveSeconds({ reducedMotion: false }), 0.3);
  // A duration of 0 is a jump: the engine goes straight to the target and its
  // field (checked in a browser, 120° to 5.1° with no frame in between).
  assert.equal(mapMoveSeconds({ reducedMotion: true }), 0);
});

test("the confirm button says what it does, for a new and for an existing framing", () => {
  assert.equal(
    framingEditorConfirmLabelKey("create"),
    "plannerFramingConfirmCreate",
  );
  assert.equal(
    framingEditorConfirmLabelKey("edit"),
    "plannerFramingConfirmEdit",
  );
  const expected = {
    fr: ["Créer ce cadrage", "Modifier ce cadrage"],
    en: ["Create this framing", "Edit this framing"],
    ja: ["この構図を作成", "この構図を編集"],
  };
  for (const [locale, [create, edit]] of Object.entries(expected)) {
    assert.equal(
      message(locale, framingEditorConfirmLabelKey("create")),
      create,
      `${locale} create`,
    );
    assert.equal(
      message(locale, framingEditorConfirmLabelKey("edit")),
      edit,
      `${locale} edit`,
    );
  }
});

test("the two confirm labels differ in every language", () => {
  for (const locale of ["en", "fr", "ja"])
    assert.notEqual(
      message(locale, "plannerFramingConfirmCreate"),
      message(locale, "plannerFramingConfirmEdit"),
    );
});

test("the editor's button is the visible label, not the old one", async () => {
  const source = await readFile(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /framingEditorConfirmLabelKey\(mode\)/);
  assert.doesNotMatch(source, /plannerFramingConfirmAria/);
});

const searchKeys = [
  "plannerFramingSearchTitle",
  "plannerFramingSearchLabel",
  "plannerFramingSearchPlaceholder",
  "plannerFramingSearchClear",
  "plannerFramingSearchClose",
  "plannerFramingSearchResults",
  "plannerFramingSearchHint",
  "plannerFramingSearchLoading",
  "plannerFramingSearchEmpty",
  "plannerFramingSearchError",
  "plannerFramingSearchMore",
  "plannerFramingSearchMagnitude",
  "plannerFramingHighlightGroup",
  "plannerFramingHighlightRemove",
  "plannerFramingConfirmCreate",
  "plannerFramingConfirmEdit",
];

test("every text the search adds exists in en, fr and ja", () => {
  for (const locale of ["en", "fr", "ja"])
    for (const key of searchKeys) {
      const text = message(locale, key);
      assert.ok(text && text !== key, `${locale}.${key} is missing`);
    }
  // The whole table stays in step, which is the portable locale contract.
  const gaps = localeKeyGaps();
  for (const [locale, { missing, extra }] of Object.entries(gaps)) {
    assert.deepEqual(missing, [], `${locale} misses keys`);
    assert.deepEqual(extra, [], `${locale} has extra keys`);
  }
});

test("the texts speak to the visitor as « vous », never « tu »", () => {
  const informal = /\b(tu|te|toi|ton|ta|tes)\b/i;
  for (const key of searchKeys)
    assert.doesNotMatch(message("fr", key), informal, key);
  // The messages that carry a value keep its placeholder in every language.
  for (const locale of ["en", "fr", "ja"]) {
    assert.match(message(locale, "plannerFramingSearchMagnitude"), /\{value\}/);
    assert.match(message(locale, "plannerFramingSearchMore"), /\{shown\}/);
    assert.match(message(locale, "plannerFramingSearchMore"), /\{total\}/);
    assert.match(message(locale, "plannerFramingHighlightRemove"), /\{name\}/);
  }
});
