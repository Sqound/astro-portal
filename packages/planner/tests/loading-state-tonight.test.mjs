// The sky tiles of "Cette nuit" while the estimate is asked: the loading star
// stands where the figure will be, and is gone once the figure is there.
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { SkyQualityCards } =
  await import("planner/components/SkyBrightnessParts.js");

const card = (extra) => ({
  label: "Fond de ciel",
  value: "—",
  unit: null,
  detail: "Estimation en cours…",
  about: "À propos",
  name: "Fond de ciel",
  waiting: false,
  ...extra,
});
const draw = (sqm, bortle) =>
  renderToStaticMarkup(
    createElement(SkyQualityCards, {
      locale: "fr",
      sky: null,
      words: { title: "Qualité du ciel", sqm, bortle },
    }),
  );

test("a sky tile that waits shows the star, busy, with its sentence; with its figure it shows no star", () => {
  const waiting = draw(card({ waiting: true }), card({ waiting: true }));
  assert.equal((waiting.match(/data-brand-loader/g) || []).length, 2);
  assert.equal((waiting.match(/aria-busy="true"/g) || []).length, 2);
  assert.match(waiting, /Estimation en cours…/);

  const done = draw(
    card({ value: "21,4", unit: "mag/arcsec²", detail: "estimé" }),
    card({ value: "3", detail: "Ciel rural" }),
  );
  assert.equal((done.match(/data-brand-loader/g) || []).length, 0);
  assert.doesNotMatch(done, /aria-busy/);
  assert.match(done, />21,4</);
});
