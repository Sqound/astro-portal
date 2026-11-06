import assert from "node:assert/strict";
import test from "node:test";

import {
  cardLines,
  figureRows,
} from "../dist/components/sessions/session-page-view.js";
import { messages } from "../dist/i18n.js";

// The page of a VISUAL session spoke the photo's vocabulary -- « 17 min
// acquises », « — poses », « Poses non renseignées » under each target,
// « capture : la couleur de sa cible ». The web page says: observed, no
// poses, « observation ».

const figures = {
  acquiredSeconds: 1020,
  plannedSeconds: 13260,
  frameCount: null,
  targetsDone: 8,
  targetsRemoved: 0,
  fwhmPixels: null,
};

test("a visual night's tiles say « observées » and have no tile of poses", () => {
  const rows = figureRows({ ...figures, frameCount: 0 }, "fr", {
    visual: true,
  });
  assert.deepEqual(
    rows.map((row) => row.key),
    ["acquired", "targets"],
  );
  assert.match(rows[0].label, /^observées sur .* prévues$/);
  assert.ok(!rows.some((row) => /acquise|pose/i.test(row.label)));
});

test("a photo night keeps its tiles", () => {
  const rows = figureRows({ ...figures, frameCount: 40 }, "fr");
  assert.deepEqual(
    rows.map((row) => row.key),
    ["acquired", "frames", "targets"],
  );
  assert.match(rows[0].label, /^acquises sur /);
});

test("a visual target's card has no line of poses, the photo one keeps it", () => {
  const card = {
    key: "m13",
    state: "planned",
    outcome: "done",
    acquiredSeconds: 120,
    passages: [],
    reports: [],
    realStart: Date.parse("2026-10-20T21:09:00Z"),
    realEnd: Date.parse("2026-10-20T21:11:00Z"),
    frameCount: null,
  };
  assert.equal(cardLines(card, "fr", null, { visual: true }).frames, null);
  assert.equal(cardLines(card, "fr").frames, "Poses non renseignées");
});

test("the legend and the tiles are written in the ten languages", () => {
  for (const locale of [
    "fr",
    "en",
    "de",
    "es",
    "it",
    "ja",
    "pt-BR",
    "ru",
    "zh-Hans",
    "zh-Hant",
  ]) {
    for (const key of [
      "sessionPageObservedOfPlanned",
      "sessionPageObservedOnly",
      "sessionPageLegendObservationColour",
    ]) {
      assert.ok(messages[locale]?.[key], `${locale}/${key}`);
    }
    assert.notEqual(
      messages[locale].sessionPageLegendObservationColour,
      messages[locale].sessionPageLegendCaptureColour,
      locale,
    );
  }
});
