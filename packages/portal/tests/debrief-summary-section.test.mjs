import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { debriefSummary } from "../dist/debrief-summary.js";
import { newEventId } from "../dist/event-id.js";
import {
  autoConfirmationPayloads,
  buildNightStrip,
  causeKey,
  causeLabel,
  clockOf,
  autoCountedText,
  durationText,
  hourMarks,
  nightOfText,
  outcomeText,
  spanText,
  stripDescription,
  targetCountText,
} from "../dist/components/sessions/night-summary-view.js";
import { messages } from "../dist/i18n.js";
import { cleanJsxModules, loadJsxModule } from "./helpers/load-jsx.mjs";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

// « Bilan de la nuit » on the web. The reference night, 20:40 → 02:20: NGC 7000 (2 h 30), IC 1396
// (2 h 00), M45 (1 h 10).

after(cleanJsxModules);

const NB = " ";
const at = (hm) => `2026-10-${hm < "12" ? 11 : 10}T${hm}:00.000Z`;
let counter = 0;
const event = (type, hm, payload = {}) => ({
  eventId: `01J8Z3K9QZ6N3S6R3E6G8H${String((counter += 1)).padStart(4, "0")}`,
  type,
  recordedAt: at(hm),
  payload,
});
const target = (id) => ({ targetId: id, planItemId: id });

const items = [
  {
    id: "ngc7000",
    targetId: "ngc7000",
    startMinute: 0,
    endMinute: 150,
    target: { title: "NGC 7000" },
  },
  {
    id: "ic1396",
    targetId: "ic1396",
    startMinute: 150,
    endMinute: 270,
    target: { title: "IC 1396" },
  },
  {
    id: "m45",
    targetId: "m45",
    startMinute: 270,
    endMinute: 340,
    target: { title: "M45" },
  },
];
const titles = { ngc7000: "NGC 7000", ic1396: "IC 1396", m45: "M45" };
const titleOf = (id) => titles[id] ?? id;

function journal() {
  const wind = event("pause", "23:50");
  return [
    event("target_started", "20:40", target("ngc7000")),
    event("pause", "21:15", { cause: "meridian_flip" }),
    event("resume", "21:25"),
    event("target_finished", "23:10", target("ngc7000")),
    event("target_started", "23:10", target("ic1396")),
    wind,
    event("note", "23:51", {
      pauseCause: { pauseEventId: wind.eventId, cause: "wind" },
    }),
    event("resume", "00:25"),
    event("target_finished", "01:10", target("ic1396")),
    event("condition", "01:10", { sky: "overcast" }),
    event("target_skipped", "01:10", { ...target("m45"), reason: "weather" }),
  ];
}
const debriefing = [
  { targetId: "ngc7000", state: "done" },
  { targetId: "ic1396", state: "partial" },
  { targetId: "m45", state: "skipped", reason: "weather" },
];
const input = {
  nightStartAt: at("20:40"),
  window: { start: at("20:40"), end: at("02:20") },
  planItems: items,
  events: journal(),
};
const summaryOf = (overrides = {}) =>
  debriefSummary({
    ...input,
    adjustments: debriefing,
    outcome: "partial",
    guidingLosses: [{ start: at("22:05"), end: at("22:25") }],
    ...overrides,
  });

test("durations in the one writing, in the three languages", () => {
  assert.equal(durationText("fr", 340), `5${NB}h${NB}40`);
  assert.equal(durationText("fr", 35), `35${NB}min`);
  assert.equal(durationText("fr", 120), `2${NB}h`);
  assert.equal(durationText("fr", 0), `0${NB}min`);
  assert.equal(durationText("en", 205), `3${NB}h${NB}25${NB}min`);
  assert.equal(durationText("ja", 125), "2時間5分");
  assert.equal(durationText("ja", 0), "0分");
});

test("the loss causes are named as specified", () => {
  assert.equal(causeKey("meridian_flip"), "MeridianFlip");
  assert.equal(causeLabel("fr", "clouds"), "Nuages");
  assert.equal(causeLabel("fr", "meridian_flip"), "Retournement au méridien");
  assert.equal(causeLabel("fr", "time"), "Manque de temps");
  assert.equal(causeLabel("en", "wind"), "Wind");
  assert.equal(causeLabel("ja", "dew"), "夜露");
});

test("the strip in words is the specified sentence", () => {
  const strip = buildNightStrip(summaryOf(), { titleOf });
  assert.equal(
    stripDescription("fr", strip, clockOf("UTC")),
    "Frise de la nuit, de 20:40 à 02:20. " +
      "NGC 7000 de 20:40 à 23:10 : pause de 21:15 à 21:25 pour le " +
      "retournement au méridien, poses rejetées de 22:05 à 22:25 pour le " +
      "guidage. " +
      "IC 1396 de 23:10 à 01:10 : pause de 23:50 à 00:25 pour le vent. " +
      "M45 de 01:10 à 02:20 : abandonnée, nuages.",
  );
});

test("the strip draws each slot with what happened inside it, and never more acquired time than the figures say", () => {
  const strip = buildNightStrip(summaryOf(), { titleOf });
  assert.deepEqual(
    strip.targets.map((entry) => entry.title),
    ["NGC 7000", "IC 1396", "M45"],
  );
  assert.deepEqual(
    strip.targets[0].segments.map((s) => `${s.kind}:${s.cause ?? ""}`),
    [
      "acquired:",
      "pause:meridian_flip",
      "acquired:",
      "rejected:guiding",
      "acquired:",
    ],
  );
  assert.equal(strip.targets[2].segments[0].kind, "abandoned");

  const declared = buildNightStrip(
    summaryOf({
      adjustments: [
        debriefing[0],
        { targetId: "ic1396", state: "partial", acquiredMinutes: 60 },
        debriefing[2],
      ],
    }),
    { titleOf },
  );
  const drawn = declared.targets[1].segments
    .filter((s) => s.kind === "acquired")
    .reduce((sum, s) => sum + s.end - s.start, 0);
  assert.equal(drawn, 60);

  // No planned slot, no strip.
  assert.equal(
    buildNightStrip({
      perTarget: [{ targetId: "x", acquiredMinutes: 10 }],
      lostByCause: [],
    }),
    null,
  );
});

test("where each loss happened, and the outcome of each target", () => {
  const summary = summaryOf();
  const clock = clockOf("UTC");
  const lines = Object.fromEntries(
    summary.lostByCause.map((entry) => [
      entry.cause,
      entry.spans.map((span) =>
        spanText("fr", span, entry.cause, { titleOf, clock }),
      ),
    ]),
  );
  assert.deepEqual(lines, {
    clouds: ["M45 abandonnée à 01:10, ciel couvert"],
    wind: ["Pause de 23:50 à 00:25 · IC 1396"],
    guiding: ["Poses rejetées de 22:05 à 22:25 · NGC 7000"],
    meridian_flip: ["Pause de 21:15 à 21:25 · NGC 7000"],
  });
  assert.equal(outcomeText("fr", "done"), "Faite");
  assert.equal(outcomeText("fr", "partial"), "Partielle");
  assert.equal(outcomeText("fr", "abandoned", "weather"), "Abandonnée · météo");
  assert.equal(outcomeText("fr", "abandoned"), "Abandonnée");
  assert.equal(nightOfText("fr", "2026-10-10"), "Nuit du sam. 10 oct.");
  assert.equal(targetCountText("fr", 3), "3 cibles");
  assert.equal(targetCountText("fr", 1), "1 cible");
});

test("the hour marks are the whole hours of the plan's zone", () => {
  const hours = (marks, zone) => marks.map((mark) => clockOf(zone)(mark));
  const start = Date.parse(at("20:40"));
  const end = Date.parse(at("02:20"));
  assert.deepEqual(hours(hourMarks("UTC", start, end), "UTC"), [
    "21:00",
    "22:00",
    "23:00",
    "00:00",
    "01:00",
    "02:00",
  ]);
  // A zone half an hour off: the marks are still whole local hours.
  assert.deepEqual(
    hours(hourMarks("Asia/Kolkata", start, end), "Asia/Kolkata").slice(0, 2),
    ["03:00", "04:00"],
  );
  // A long night: every second hour.
  assert.deepEqual(
    hours(
      hourMarks(
        "UTC",
        Date.parse("2026-10-10T18:00:00Z"),
        Date.parse("2026-10-11T04:00:00Z"),
      ),
      "UTC",
    ),
    ["19:00", "21:00", "23:00", "01:00", "03:00"],
  );
});

test("every word of the section exists in the three languages", () => {
  const keys = Object.keys(messages.en).filter(
    (key) =>
      key.startsWith("nightSummary") ||
      key === "debriefTargetPartialLabel" ||
      key === "debriefTargetAcquiredLabel" ||
      key === "debriefTargetAcquiredHint",
  );
  assert.ok(keys.length > 60);
  for (const locale of ["fr", "ja"])
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale} lacks ${key}`);
});

const plain = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\n]+/g, " ")
    .trim();

test("the debriefing is the page of the session in its first moment — the question, what the night recorded, the targets, « Créer la session »", async () => {
  // The moment draws the page's frise and cards, which reach « Mon espace ›
  // Captures » modules that import by the package's name.
  await registerJsx();
  const { DebriefScreen } = await loadJsxModule(
    "components/sessions/DebriefScreen.js",
  );
  const { initialMomentRows, momentRowsToDecision, addedMomentRow } =
    await import("../dist/components/sessions/debrief-moment.js");
  const { buildDebriefDecisionBody } =
    await import("../dist/components/sessions/debrief-decision.js");
  const plan = {
    id: "plan-1",
    status: "active",
    payload: {
      name: "Nouvelle Lune au col",
      date: "2026-10-10",
      location: { name: "Col des Mélèzes" },
      items,
    },
  };
  const queueEntry = {
    nightStartAt: at("20:40"),
    nightEndAt: at("02:20"),
    staleDevices: [],
  };
  const withJournal = renderToStaticMarkup(
    createElement(DebriefScreen, {
      locale: "fr",
      planId: "plan-1",
      plan,
      queueEntry,
      summaryInput: input,
      TargetsPicker: () => null,
    }),
  );
  const text = plain(withJournal).replaceAll("\u00a0", " ");
  let from = -1;
  for (const sentence of [
    "Retour au Journal",
    "Session du plan « Nouvelle Lune au col »",
    "Nuit du 10 au 11 oct.",
    "Col des Mélèzes · prévu 20:40 → 02:20 UTC",
    "À débriefer",
    "Que s’est-il passé cette nuit-là ?",
    "Exécuté tel quel La session reprend le plan.",
    "Exécuté en partie Cochez, retirez, ajoutez, corrigez.",
    "Abandonné La nuit et sa raison ; rien n’est compté.",
    "Ce que la nuit a enregistré",
    "Cibles",
    "NGC 7000",
    "Prévu 20:40 → 23:10 · 2 h 30",
    "Faite En partie Non faite",
    "Ajouter une cible",
    "Utilisez Astro Sync sur un ordinateur",
    "Plus tard",
    "Créer la session",
  ]) {
    const found = text.indexOf(sentence, from + 1);
    assert.ok(
      found > from,
      `«${sentence}» is missing or out of order:\n${text}`,
    );
    from = found;
  }
  // « Exécuté en partie » is chosen: the night has a journal.
  assert.match(
    withJournal,
    /name="debrief-outcome" checked="" value="partial"/,
  );
  assert.ok(!withJournal.includes("Bilan de la nuit"));

  // Without a journal: the question, no frise, the plan's hours as the answer.
  const without = renderToStaticMarkup(
    createElement(DebriefScreen, {
      locale: "fr",
      planId: "plan-1",
      plan,
      queueEntry,
    }),
  );
  assert.ok(without.includes("debrief-outcome-option"));
  assert.ok(!plain(without).includes("Ce que la nuit a enregistré"));
  assert.ok(
    !plain(without).includes("Ajouter une cible"),
    "no search, no button",
  );

  // The rows as the journal reads the night, and the request they make.
  const rows = initialMomentRows({
    items,
    summary: debriefSummary(input),
    nightStartAt: at("20:40"),
  });
  const byId = Object.fromEntries(rows.map((row) => [row.itemId, row]));
  assert.equal(byId.ngc7000.result, "partial");
  assert.equal(byId.m45.result, "skipped");
  assert.equal(byId.m45.reason, "weather");
  byId.ngc7000.frames = "40";
  byId.ic1396.result = "done";
  byId.m45.removed = true;
  const added = addedMomentRow({
    targetId: "m31",
    base: Date.parse(at("20:40")),
    start: "01:58",
    end: "03:48",
  });
  added.frames = "42";
  const { targetRows, addedRows } = momentRowsToDecision([...rows, added]);
  const body = buildDebriefDecisionBody({
    outcome: "partial",
    targetRows,
    addedRows,
  });
  const adjustment = (id) =>
    body.sessionAdjustments.targets.find((entry) => entry.targetId === id);
  assert.equal(adjustment("ngc7000").state, "partial");
  assert.equal(adjustment("ngc7000").frameCount, 40);
  assert.ok(adjustment("ngc7000").startedAt < adjustment("ngc7000").finishedAt);
  assert.equal(adjustment("ic1396").state, "done");
  assert.deepEqual(
    [
      adjustment("m45").state,
      adjustment("m45").removed,
      adjustment("m45").reason,
    ],
    ["skipped", true, "weather"],
  );
  assert.equal(body.addedTargets.length, 1);
  assert.equal(body.addedTargets[0].targetId, "m31");
  assert.equal(body.addedTargets[0].frameCount, 42);
  // 01:58 is the morning after the evening of 20:40: the next UTC day.
  assert.equal(body.addedTargets[0].startedAt.slice(0, 10), "2026-10-11");
  // A night not carried out carries its reason, never targets.
  assert.deepEqual(
    buildDebriefDecisionBody({ outcome: "abandoned", reason: "weather" }),
    { outcome: "abandoned", reason: "weather" },
  );
});

// --- Passages and automatic time on the web --------------

const isoAt = (hm) => `2026-10-11T${hm}:00.000Z`;
let eventCounter = 0;
const passagesEvent = (type, hm, payload = {}) => ({
  eventId: `01J9Z3K9QZ6N3S6R3E6G8H${String((eventCounter += 1)).padStart(4, "0")}`,
  type,
  recordedAt: isoAt(hm),
  payload,
});
const passagesNight = {
  nightStartAt: isoAt("19:00"),
  window: { start: isoAt("19:00"), end: isoAt("23:30") },
  planItems: [
    { id: "m31", targetId: "m31", startMinute: 0, endMinute: 90 },
    { id: "m33", targetId: "m33", startMinute: 90, endMinute: 180 },
  ],
};
const passageTitles = { m31: "M31", m33: "M33", m57: "M57" };
const passageTitle = (id) => passageTitles[id] ?? id;
// M31 counted by the clock (90 min, unconfirmed), M33 by hand, M31 resumed.
const passagesSummary = (extra = {}) =>
  debriefSummary({
    ...passagesNight,
    events: [
      passagesEvent("target_started", "19:00", {
        ...target("m31"),
        auto: true,
      }),
      passagesEvent("target_finished", "20:30", {
        ...target("m31"),
        auto: true,
      }),
      passagesEvent("target_started", "20:30", target("m33")),
      passagesEvent("target_started", "21:20", target("m31")),
      passagesEvent("target_finished", "21:40", target("m31")),
    ],
    ...extra,
  });

test("the strip draws one stretch per passage, the automatic one flagged, and says the passages in words", () => {
  const strip = buildNightStrip(passagesSummary(), { titleOf: passageTitle });
  const m31 = strip.targets[0];
  assert.deepEqual(
    m31.segments.map((segment) => [segment.kind, segment.auto === true]),
    [
      ["acquired", true],
      ["acquired", false],
    ],
  );
  assert.equal(strip.hasAuto, true);
  assert.ok(
    strip.targets.every((target) =>
      target.segments.every((segment) => segment.kind !== "pause"),
    ),
    "automatic time is never a pause",
  );
  const words = stripDescription("fr", strip, clockOf("UTC"));
  assert.match(
    words,
    /M31 en 2 passages : de 19:00 à 20:30 \(comptée automatiquement\), de 21:20 à 21:40\./,
  );
});

test("the « Prévu » row is the plan as launched, and a target the plan never had has a stretch and no box", () => {
  const launched = passagesSummary({
    launchedSchedule: [
      { planItemId: "m31", targetId: "m31", startMinute: 0, endMinute: 100 },
    ],
    events: [
      passagesEvent("target_started", "19:00", target("m31")),
      passagesEvent("target_started", "19:50", { targetId: "m57" }),
      passagesEvent("target_finished", "20:20", { targetId: "m57" }),
    ],
    kind: "visual",
  });
  const strip = buildNightStrip(launched, { titleOf: passageTitle });
  const byId = Object.fromEntries(strip.targets.map((t) => [t.targetId, t]));
  assert.equal(byId.m31.end - byId.m31.start, 100);
  // M33 was never launched nor looked at: no box, and on a visual night
  // nothing is lost, so the strip has nothing to draw for it.
  assert.equal(byId.m33, undefined, "no launched slot, no box, no loss");
  assert.equal(byId.m57.start, null);
  assert.equal(byId.m57.segments.length, 1);
  assert.match(
    stripDescription("fr", strip, clockOf("UTC")),
    /M57 : de 19:50 à 20:20\./,
  );
});

test("a strip without passages is drawn as before passages existed, inside the slot", () => {
  const strip = buildNightStrip(summaryOf(), { titleOf });
  const stripped = JSON.parse(JSON.stringify(strip));
  for (const target of stripped.targets) {
    assert.ok(target.start !== null);
    assert.ok(target.segments.every((segment) => !segment.auto));
  }
  assert.equal(stripped.hasAuto, false);
});

test("the confirmations are one payload per target holding unconfirmed time", () => {
  const summary = passagesSummary();
  assert.deepEqual(autoConfirmationPayloads(summary), [
    { targetId: "m31", planItemId: "m31" },
  ]);
  assert.deepEqual(autoConfirmationPayloads(summary, summary.perTarget[1]), []);
  assert.deepEqual(autoConfirmationPayloads(summary, summary.perTarget[0]), [
    { targetId: "m31", planItemId: "m31" },
  ]);
  // A span that no longer ticks is a duration, never « 01:30 ».
  assert.equal(
    autoCountedText("fr", 90),
    `1${NB}h${NB}30 comptée automatiquement, pauses déduites`,
  );
});

test("a browser-written event id is a 26-character ULID in order", () => {
  const first = newEventId(Date.parse("2026-10-11T19:00:00.000Z"));
  const second = newEventId(Date.parse("2026-10-11T19:00:00.001Z"));
  for (const id of [first, second])
    assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.ok(first.slice(0, 10) < second.slice(0, 10));
});

test("the new words exist in the three languages, in the specified French", () => {
  const keys = [
    "nightSummaryTargetPassages",
    "nightSummaryAutoCounted",
    "nightSummaryAutoConfirm",
    "nightSummaryLegendAuto",
    "nightSummaryStripPassages",
    "nightSummaryStripPassageOne",
    "nightSummaryStripPassagePart",
    "nightSummaryStripPassagePartAuto",
  ];
  for (const locale of ["en", "fr", "ja"])
    for (const key of keys)
      assert.ok(messages[locale][key], `${locale} ${key}`);
  assert.equal(
    messages.fr.nightSummaryAutoCounted,
    "{duration} comptée automatiquement, pauses déduites",
  );
  assert.equal(messages.fr.nightSummaryAutoConfirm, "Confirmer");
  assert.equal(messages.fr.nightSummaryTargetPassages, " en {count} passages");
});

// A stopped night resumed with
// « Oui, c'était une pause » and « Fatigue » — the night of the public
// shared fixture. The web shows it like any pause
// (nothing else changes), « Fatigue » in the ten languages.
test("« Fatigue » in the ten languages of the web, its own cause", () => {
  assert.equal(Object.keys(messages).length, 10);
  for (const locale of Object.keys(messages)) {
    for (const key of [
      "nightSummaryCauseFatigue",
      "nightSummaryStripCauseFatigue",
      "nightSummaryForFatigue",
    ])
      assert.ok(messages[locale][key], `${locale} lacks ${key}`);
    assert.notEqual(
      causeLabel(locale, "fatigue"),
      causeLabel(locale, "other"),
      locale,
    );
  }
  assert.equal(causeLabel("de", "fatigue"), "Müdigkeit");
  assert.equal(causeLabel("ja", "fatigue"), "疲れ");
});
