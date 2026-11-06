import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  sessionCountedMinutes,
  sessionSpanMinutes,
  sessionTargetsDoneCount,
} from "../dist/session-figures.js";
import { debriefSummary } from "../dist/debrief-summary.js";
import { buildSessionTargets } from "../dist/journal/session-targets.js";
import {
  nightPassages,
  sessionCards,
  sessionFigures,
} from "../dist/components/sessions/session-page-model.js";
import {
  cardLines,
  figureRows,
  nightTitle,
} from "../dist/components/sessions/session-page-view.js";

// The same session gets the same minutes, hours, planned span, targets tile
// and night title from the shared fixtures.

const fixture = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../astro-contracts/fixtures/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

test("the one grid: the fixtures replay on the web", () => {
  for (const [name, run] of [
    ["session-figures", (args) => sessionSpanMinutes(...args)],
    ["session-counted-minutes", (args) => sessionCountedMinutes(...args)],
    ["session-targets-done", (args) => sessionTargetsDoneCount(...args)],
  ]) {
    const { cases } = fixture(name);
    assert.ok(cases.length >= 5, name);
    for (const { id, args, result } of cases)
      assert.deepEqual(run(args), result, `${name}/${id}`);
  }
});

// A night in Tokyo: the plan starts at 21:08:40, 21-minute slots, the session
// ends at 21:27:50 (before the end of the second slot).
const at = (clock) => `2026-10-20T${clock}Z`;
const items = [
  { id: "ngc891", targetId: "ngc891", startMinute: 0, endMinute: 21 },
  { id: "m110", targetId: "m110", startMinute: 21, endMinute: 41 },
  { id: "m13", targetId: "m13", startMinute: 41, endMinute: 60 },
];
let counter = 0;
const event = (type, clock, payload = {}) => ({
  eventId: `01J8Z3K9QZ6N3S6R3E6G8H${String((counter += 1)).padStart(4, "0")}`,
  type,
  recordedAt: at(clock),
  payload,
});
const body = (id) => ({ targetId: id, planItemId: id });
const events = [
  event("target_started", "12:09:50", body("ngc891")),
  event("target_finished", "12:11:10", body("ngc891")),
  event("target_started", "12:11:20", body("m110")),
  event("target_finished", "12:12:09", body("m110")),
];
const session = { id: "s1", plan_id: "p1", started_at: at("12:08:40") };
const plan = {
  id: "p1",
  night_start_at: at("12:08:40"),
  payload_json: JSON.stringify({ items }),
};
const finishedAt = at("12:27:50");

// « Exécuté en partie »: the two targets the night took up are ticked, the
// third is not named, so the service gives it up.
const debrief = {
  outcome: "partial",
  targets: [
    { targetId: "ngc891", state: "done" },
    { targetId: "m110", state: "done" },
  ],
};

function cardsOfAudit() {
  const built = buildSessionTargets({
    session: { ...session, finished_at: finishedAt },
    plan,
    debrief,
    events,
  });
  const summary = debriefSummary({
    nightStartAt: plan.night_start_at,
    window: { start: session.started_at, end: finishedAt },
    planItems: items,
    events,
    adjustments: debrief.targets,
    outcome: debrief.outcome,
  });
  return {
    built,
    cards: sessionCards({
      targets: built.targets,
      debriefSummary: summary,
      passages: nightPassages(events, finishedAt),
    }),
  };
}

test("the planned span is the plan's promise, not cut to the session's window", () => {
  const { built, cards } = cardsOfAudit();
  const first = built.targets.find((target) => target.targetId === "ngc891");
  assert.deepEqual(first.plannedSlot, {
    start: "2026-10-20T12:08:40.000Z",
    end: "2026-10-20T12:29:40.000Z",
  });
  // The summary's own slot stays cut to the window (the frise draws it).
  assert.equal(first.slot.end, "2026-10-20T12:27:00.000Z");
  const lines = cardLines(
    cards.find((card) => card.key === "ngc891"),
    "fr",
    "Asia/Tokyo",
  );
  assert.equal(lines.planned, "Prévu 21:08 → 21:29 · 21 min");
});

test("the hours are cut to their minute and the minutes read like the hours", () => {
  const { cards } = cardsOfAudit();
  const first = cardLines(
    cards.find((card) => card.key === "ngc891"),
    "fr",
    "Asia/Tokyo",
  );
  assert.equal(first.done.span, "Fait 21:09 → 21:11");
  assert.match(first.done.acquired, /^2 min/);
  const second = cardLines(
    cards.find((card) => card.key === "m110"),
    "fr",
    "Asia/Tokyo",
  );
  assert.equal(second.done.span, "Fait 21:11 → 21:12");
  assert.match(second.done.acquired, /^1 min/);
});

test("the tile counts the targets done, the ones given up are not", () => {
  const { cards } = cardsOfAudit();
  const figures = sessionFigures({ cards });
  // Two targets were seen, the third (M13) never was.
  assert.equal(figures.targetsDone, 2);
  assert.equal(cards.length, 3);
  const tile = figureRows(figures, "fr").find((row) => row.key === "targets");
  assert.equal(tile.value, "2");
  assert.match(tile.label, /cibles faites/);
});

test("a night is « du 20 au 21 oct. », whatever the hours of the session", () => {
  assert.equal(nightTitle("2026-10-20", "fr"), "Nuit du 20 au 21 oct.");
  assert.equal(nightTitle("2026-10-31", "en"), "Night of Oct 31 to Nov 1");
});

test("a night inside one month says the month once, where the language writes it", () => {
  // Day first: the month follows the second date.
  assert.equal(nightTitle("2026-10-27", "fr"), "Nuit du 27 au 28 oct.");
  assert.equal(nightTitle("2026-10-27", "de"), "Nacht vom 27. bis 28. Okt.");
  assert.equal(nightTitle("2026-10-27", "ru"), "Ночь с 27 на 28 окт.");
  // Month first: it goes with the first date, and the second is a day.
  assert.equal(nightTitle("2026-10-27", "en"), "Night of Oct 27 to 28");
  assert.equal(nightTitle("2026-10-27", "ja"), "10月27日から28日の夜");
  assert.equal(nightTitle("2026-10-27", "zh-Hans"), "10月27日至28日的夜晚");
  assert.equal(nightTitle("2026-10-27", "zh-Hant"), "10月27日至28日的夜晚");
  // Two months: each date carries its own.
  assert.equal(nightTitle("2026-10-31", "ja"), "10月31日から11月1日の夜");
  assert.equal(nightTitle("2026-10-31", "fr"), "Nuit du 31 oct. au 1 nov.");
  for (const locale of ["es", "it", "pt-BR"])
    assert.doesNotMatch(
      nightTitle("2026-10-27", locale),
      /27.*oct.*28.*oct/i,
      locale,
    );
});
