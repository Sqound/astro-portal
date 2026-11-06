import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { planFrise } from "planner/plan-frise.js";
import { planFriseLayout } from "planner/plan-frise-layout.js";
import {
  planFriseSpanLine,
  planFriseSpanSentence,
} from "planner/plan-frise-words.js";
import {
  friseWithSpan,
  readSlotAgainstSpan,
  slotsBeyondSpan,
} from "planner/night-span.js";
import { message } from "portal/i18n.js";
import { clock } from "planner/wind-section.js";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";
import { boardPlan } from "./helpers/plan-frise-cases.mjs";

// The frise of a plan over the night the plan chose, on the web — a grey hatch
// outside the two gold lines (their hours at the foot of the full frise), the
// targets beyond greyed with a dashed edge, the sentence closing with the
// night, the line of the card of "Cette nuit".

await registerJsx();
const { PlanFrise } = await import("planner/components/PlanFrise.js");

// The worked-example night is 18:54 → 04:38 (UTC); M31 19:49 → 21:49, NGC 7000
// 22:19 → 00:19, M33 00:19 → 02:49, M45 02:49 → 03:49. A night chosen from
// 22:00 to 02:00: M31 and M45 lie outside it, M33 has two thirds inside it.
const span = {
  start: "2026-10-14T22:00:00.000Z",
  end: "2026-10-15T02:00:00.000Z",
};
const base = planFrise(boardPlan());
const chosen = friseWithSpan(base, span);
const at = (locale) => (value) => clock(value, locale, "UTC");
const render = (frise, variant, locale = "fr") =>
  renderToStaticMarkup(
    createElement(PlanFrise, {
      frise,
      locale,
      clock: at(locale),
      variant,
    }),
  );
const count = (markup, pattern) => (markup.match(pattern) ?? []).length;

test("a slot against the span: inside, on a line, outside; greyed below the half", () => {
  const range = { start: 1000 * 60000, end: 1100 * 60000 };
  const read = (start, end) =>
    readSlotAgainstSpan({
      start: start * 60000,
      end: end * 60000,
      span: range,
    });
  assert.equal(read(1010, 1090).fit, "inside");
  assert.equal(read(900, 990).fit, "outside");
  assert.equal(read(900, 990).greyed, true);
  assert.equal(read(1090, 1190).fit, "straddling");
  assert.equal(read(1090, 1190).greyed, true);
  assert.equal(read(1050, 1150).greyed, false, "exactly half is not grey");
  assert.equal(read(1000, 1200).greyed, false);
  assert.equal(
    slotsBeyondSpan(
      [
        { start: 900 * 60000, end: 990 * 60000 },
        { start: 1010 * 60000, end: 1090 * 60000 },
        { start: 1090 * 60000, end: 1190 * 60000 },
      ],
      range,
    ),
    2,
  );
});

test("the frise reads each block against the span and counts the targets beyond", () => {
  assert.deepEqual(
    chosen.blocks.map((block) => block.fit),
    ["outside", "inside", "straddling", "outside"],
  );
  assert.deepEqual(
    chosen.blocks.map((block) => block.greyed),
    [true, false, false, true],
  );
  assert.equal(chosen.span.beyond, 2);
  assert.ok(chosen.span.x0 < chosen.span.x1);
  // No span, no trace.
  assert.equal(friseWithSpan(base, null), base);
  assert.equal("span" in base, false);
});

test("the full frise takes 12 px more under the plot for the hours of the lines", () => {
  assert.equal(planFriseLayout(base, { variant: "full" }).height, 146);
  const layout = planFriseLayout(chosen, { variant: "full" });
  assert.equal(layout.height, 158);
  assert.ok(
    layout.span.x0 > layout.plot.left && layout.span.x1 < layout.plot.right,
  );
  assert.equal(planFriseLayout(chosen, { variant: "reduced" }).height, 60);
});

test("the web frise hatches outside the night, greys the blocks beyond, writes the hours at the foot", () => {
  const markup = render(chosen, "full");
  assert.equal(count(markup, /class="plan-frise-hatch"/g), 2);
  assert.equal(count(markup, /<pattern /g), 1);
  assert.equal(count(markup, /class="plan-frise-span-line"/g), 2);
  assert.equal(count(markup, /class="plan-frise-span-hour"/g), 2);
  assert.match(markup, /class="plan-frise-span-hour"[^>]*>22:00</);
  assert.match(markup, /class="plan-frise-span-hour"[^>]*>02:00</);
  // The two entirely outside are grey and dashed; the one on a line is gold
  // inside and grey outside; the one inside is as before.
  assert.equal(count(markup, /data-fit="outside"/g), 2);
  assert.equal(count(markup, /data-fit="straddling"/g), 1);
  assert.equal(count(markup, /class="plan-frise-block-edge is-greyed"/g), 3);
  // The names of the two blocks beyond are grey.
  assert.equal(count(markup, /class="plan-frise-name is-greyed"/g), 2);
  // The thin lines of the dark night give way to the span's own.
  assert.equal(count(markup, /plan-frise-night-lines/g), 0);
  assert.match(markup, /width="330" height="158"/);
  // The sentence closes with the night.
  assert.ok(markup.includes("Nuit choisie de 22:00 à 02:00."));
});

test("the reduced web frise hatches too, with no hour; the whole night leaves no trace", () => {
  const reduced = render(chosen, "reduced");
  assert.equal(count(reduced, /class="plan-frise-hatch"/g), 2);
  assert.equal(count(reduced, /plan-frise-span-hour/g), 0);
  const plain = render(base, "full");
  assert.equal(count(plain, /plan-frise-hatch|plan-frise-span|is-greyed/g), 0);
  assert.equal(count(plain, /plan-frise-night-lines/g), 1);
  assert.match(plain, /width="330" height="146"/);
});

test("never the weather on the web frise", () => {
  const markup = render(chosen, "full");
  assert.doesNotMatch(markup, /weather|cloud|rain|Nuages|Pluie/i);
});

test("the words: the line of the card, the closing sentence, ten languages", () => {
  const clockFr = at("fr");
  // The French typography writes no-break spaces; this comparison writes plain ones.
  const plain = (value) => value.replaceAll("\u00a0", " ");
  assert.equal(
    plain(planFriseSpanLine(chosen, { locale: "fr", clock: clockFr })),
    "Nuit choisie : 22:00 → 02:00 · 2 cibles au-delà",
  );
  const one = {
    ...chosen,
    span: { ...chosen.span, beyond: 1 },
  };
  assert.equal(
    plain(planFriseSpanLine(one, { locale: "fr", clock: clockFr })),
    "Nuit choisie : 22:00 → 02:00 · 1 cible au-delà",
  );
  assert.equal(
    plain(
      planFriseSpanLine(
        { ...chosen, span: { ...chosen.span, beyond: 0 } },
        { locale: "fr", clock: clockFr },
      ),
    ),
    "Nuit choisie : 22:00 → 02:00",
  );
  // The whole night: nothing to say.
  assert.equal(planFriseSpanLine(base, { locale: "fr", clock: clockFr }), "");
  assert.equal(
    planFriseSpanSentence(base, { locale: "fr", clock: clockFr }),
    "",
  );
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
      "planFriseSpanLine",
      "planFriseSpanBeyondOne",
      "planFriseSpanBeyondOther",
      "planFriseSpanOutside",
      "planFriseSpanAria",
      "plannerNightSpanEdit",
      "plannerNightSpanValidate",
    ]) {
      const value = message(locale, key);
      assert.ok(value && value !== key, `${locale}: ${key} is written`);
    }
  }
});

test("the planner's schedule rows: a hatch of diagonals, hours at the foot of the lines, the blocks beyond grey and dashed", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(
    new URL("../src/components/PlannerPage.js", import.meta.url),
    "utf8",
  );
  assert.match(page, /readSlotAgainstSpan\(\{/);
  assert.match(page, /planner-schedule-span-hour is-start/);
  assert.match(page, /planner-schedule-block-beyond/);
  assert.match(page, /\$\{reading\?\.greyed \? " is-greyed" : ""\}/);
  const css = readFileSync(
    new URL("../../portal-app/styles/portal.css", import.meta.url),
    "utf8",
  );
  const out = css.slice(css.indexOf(".planner-schedule-span-out {"));
  // Diagonals over a veil, never a tint alone; the beyond blocks dashed.
  assert.match(out.slice(0, 260), /repeating-linear-gradient/);
  assert.match(css, /\.planner-schedule-block\.is-beyond \{[^}]*dashed/);
});

// "2 cibles planifiées"
// then "3 cibles au-delà" for a plan of four targets, two of them planets.
// A planet has no coordinates to freeze, so its plan item keeps only its id
// (`planner-planet-neptune`): it had no name, the card did not count it and
// the frise drew it as a block with no name. One list now: the card's count
// and the frise's "au-delà" come from the same targets.
test("the card and the frise count the same targets, planets included", async () => {
  const { tonightPlanCard } = await import("planner/tonight-overview.js");
  const { planFriseInput, planFriseOf } =
    await import("planner/plan-frise-input.js");
  const deepSky = (id, ra, dec) => ({
    id,
    target: {
      id,
      designation: id.toUpperCase(),
      objects: [id.toUpperCase()],
      coordinate: { ra, dec },
    },
  });
  const plan = {
    id: "plan-1",
    name: "Plan 1",
    date: "2026-10-09",
    location: {
      latitude: 8.07,
      longitude: -12.29,
      timeZone: "Africa/Abidjan",
    },
    nightSpan: {
      mode: "custom",
      start: "2026-10-09T22:00:00.000Z",
      end: "2026-10-10T00:10:00.000Z",
    },
    items: [
      { id: "planner-planet-neptune", startMinute: 60, endMinute: 100 },
      { id: "planner-planet-saturne", startMinute: 100, endMinute: 150 },
      { ...deepSky("m74", 24.17, 15.78), startMinute: 270, endMinute: 330 },
      { ...deepSky("m77", 40.67, -0.01), startMinute: 330, endMinute: 400 },
    ],
  };
  const card = tonightPlanCard(plan);
  assert.equal(card.targetCount, 4);
  assert.deepEqual(card.targets, ["Neptune", "Saturne", "M74", "M77"]);
  const frise = planFriseOf(planFriseInput(plan, {}));
  assert.deepEqual(
    frise.blocks.map((block) => block.label),
    ["Neptune", "Saturne", "M74", "M77"],
  );
  assert.ok(frise.span.beyond <= card.targetCount);
  assert.equal(frise.span.beyond, 4);
  // An item with neither a name nor a known id still counts once, if placed.
  const nameless = { ...plan, items: [{ startMinute: 60, endMinute: 100 }] };
  assert.equal(tonightPlanCard(nameless).targetCount, 1);
  assert.equal(
    planFriseOf(planFriseInput(nameless, {})).span.beyond <=
      tonightPlanCard(nameless).targetCount,
    true,
  );
});

test("« au-delà » counts targets, not blocks: a target with a block inside the night is not beyond", () => {
  // M33 twice (two slots, one inside the chosen night, one outside), M31 and
  // M45 outside: three targets, two beyond.
  const frise = friseWithSpan(
    {
      ...base,
      blocks: [
        ...base.blocks,
        {
          ...base.blocks[2],
          key: "m33-bis",
          start: base.blocks[0].start,
          end: base.blocks[0].end,
        },
      ],
    },
    span,
  );
  const named = base.blocks.map((block) => block.label);
  assert.deepEqual(named, ["M31", "NGC 7000", "M33", "M45"]);
  assert.equal(frise.blocks.length, 5);
  // M31 (outside), NGC 7000 (inside), M33 (inside + outside), M45 (outside).
  assert.equal(frise.span.beyond, 2);
});
