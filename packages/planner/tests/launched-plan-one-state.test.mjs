// The web "Cette nuit" says ONE state for the plan the phone executes,
// names the second plan of a night apart, and gives the card of every
// plan the same "Ouvrir le plan".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { localizedPlanName } from "../src/quick-plan-messages.js";

await registerJsx();
const { PlanExecutionCard, PlanExecutionTag } =
  await import("planner/components/PlanExecutionCard.js");

const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

const plan = {
  id: "plan-run",
  date: "2026-10-22",
  items: [{ id: "i1", title: "M31", startMinute: 60, endMinute: 150 }],
  launchedSchedule: [
    { planItemId: "i1", targetId: "m31", startMinute: 60, endMinute: 120 },
  ],
};
const card = (state, locale = "fr") =>
  renderToStaticMarkup(
    createElement(PlanExecutionCard, {
      locale,
      plan,
      execution: { state },
    }),
  );

test("a night that runs says « Nuit en cours · En cours sur votre téléphone » and never « En pause »", () => {
  const said = text(card("running"));
  assert.match(said, /Nuit en cours/);
  assert.match(said, /En cours sur votre téléphone/);
  assert.doesNotMatch(said, /En pause/);
  assert.doesNotMatch(card("running"), /data-plan-execution-paused/);
});

test("a night in pause says « En pause » alone -- not « Nuit en cours », not « En cours sur votre téléphone »", () => {
  const markup = card("paused");
  const said = text(markup);
  assert.match(said, /En pause/);
  assert.doesNotMatch(said, /Nuit en cours/);
  assert.doesNotMatch(said, /En cours sur votre téléphone/);
  assert.equal(markup.match(/data-plan-execution-paused/g)?.length, 1);
  const tag = renderToStaticMarkup(
    createElement(PlanExecutionTag, {
      locale: "en",
      execution: { state: "paused" },
    }),
  );
  assert.equal(text(tag), "Paused");
});

test("the second plan of a night keeps its number on the web (« Nuit du 22 octobre (2) »), in the language of the screen", () => {
  assert.equal(
    localizedPlanName("fr", "Nuit du 22 octobre", "2026-10-22"),
    "Nuit du 22 octobre",
  );
  assert.equal(
    localizedPlanName("fr", "Nuit du 22 octobre (2)", "2026-10-22"),
    "Nuit du 22 octobre (2)",
  );
  assert.equal(
    localizedPlanName("fr", "Nuit du 22 octobre (3)", "2026-10-22"),
    "Nuit du 22 octobre (3)",
  );
  // A French default name read on an English screen: translated, numbered.
  assert.equal(
    localizedPlanName("en", "Nuit du 22 octobre (2)", "2026-10-22"),
    "Night of October 22 (2)",
  );
  // A name the person typed that merely ends like a number stays as it is.
  assert.equal(
    localizedPlanName("fr", "Ma nuit au lac (2)", "2026-10-22"),
    "Ma nuit au lac (2)",
  );
  assert.equal(
    localizedPlanName("fr", "Nuit du 3 octobre (2)", "2026-10-22"),
    "Nuit du 3 octobre (2)",
  );
});

test("« Ouvrir le plan » is the same level on the card of the running plan and on the next plan's", () => {
  const source = readFileSync(
    new URL("../src/components/TonightPage.js", import.meta.url),
    "utf8",
  );
  const link = source.slice(
    source.lastIndexOf("<a", source.indexOf("tonight-plan-open")),
    source.indexOf("{words.openPlan}"),
  );
  assert.match(link, /btn-primary/);
  assert.doesNotMatch(link, /execution/);
  assert.doesNotMatch(link, /btn-secondary/);
});
