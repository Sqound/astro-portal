import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { registerAccountExtension } =
  await import("portal/account/extensions.js");
const { JournalStatistics } =
  await import("portal/components/sessions/JournalStatistics.js");

// The lock of the journal's statistics is the hosted service's, registered at
// `journal.statisticsLock`: without it a held profile gets neither the card
// nor a link to offers.

const statistics = {
  held: true,
  overview: {
    year: 2026,
    months: [3600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    nights: { executed: 1, partial: 0, noPlan: 0, abandoned: 0, lost: [] },
    bestNight: null,
    targets: [],
    instruments: [],
  },
  targets: {},
  instruments: {},
};
const filters = { statsTarget: null, statsInstrument: null };
const draw = () =>
  renderToStaticMarkup(
    createElement(JournalStatistics, { locale: "fr", statistics, filters }),
  );

test("without a registered lock, a held profile sees no lock card and no link to offers", () => {
  const html = draw();
  assert.match(html, /data-held="true"/);
  assert.doesNotMatch(html, /journal-stat-lock/);
  assert.doesNotMatch(html, /manage\/subscription/);
});
