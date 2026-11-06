import assert from "node:assert/strict";
import test from "node:test";

import {
  DEBRIEF_LOSS_CAUSES,
  debriefSummary,
  effectivePauseCause,
} from "../dist/debrief-summary.js";

// The summary of a night. The reference night: 20:40 → 02:20, NGC
// 7000 (2 h 30), IC 1396 (2 h 00), M45 (1 h 10).

const at = (hm, day = 10) =>
  `2026-10-${hm < "12" ? day + 1 : day}T${hm}:00.000Z`;
let counter = 0;
const ulid = () =>
  `01J8Z3K9QZ6N3S6R3E6G8H${String((counter += 1)).padStart(4, "0")}`;
const event = (type, hm, payload = {}, timing) => ({
  eventId: ulid(),
  type,
  recordedAt: at(hm),
  ...(timing ? { timing } : {}),
  payload,
});
const started = (id, hm, timing) =>
  event("target_started", hm, { targetId: id, planItemId: id }, timing);
const finished = (id, hm, timing) =>
  event("target_finished", hm, { targetId: id, planItemId: id }, timing);

const night = {
  nightStartAt: at("20:40"),
  window: { start: at("20:40"), end: at("02:20") },
};
const items = [
  { id: "ngc7000", targetId: "ngc7000", startMinute: 0, endMinute: 150 },
  { id: "ic1396", targetId: "ic1396", startMinute: 150, endMinute: 270 },
  { id: "m45", targetId: "m45", startMinute: 270, endMinute: 340 },
];

function referenceJournal() {
  const pause = event("pause", "23:50");
  return [
    started("ngc7000", "20:40"),
    event("pause", "21:15", { cause: "meridian_flip" }),
    event("resume", "21:25"),
    finished("ngc7000", "23:10"),
    started("ic1396", "23:10"),
    pause,
    event("note", "23:51", {
      pauseCause: { pauseEventId: pause.eventId, cause: "wind" },
    }),
    event("resume", "00:25"),
    finished("ic1396", "01:10"),
    event("condition", "01:10", { sky: "overcast" }),
    event("target_skipped", "01:10", {
      targetId: "m45",
      planItemId: "m45",
      reason: "weather",
    }),
  ];
}

const referenceAdjustments = [
  { targetId: "ngc7000", state: "done" },
  { targetId: "ic1396", state: "partial" },
  { targetId: "m45", state: "skipped", reason: "weather" },
];

const referenceNight = (overrides = {}) =>
  debriefSummary({
    ...night,
    planItems: items,
    events: referenceJournal(),
    adjustments: referenceAdjustments,
    outcome: "partial",
    guidingLosses: [{ start: at("22:05"), end: at("22:25") }],
    ...overrides,
  });

test("the reference night: 5 h 40 planned, 3 h 25 acquired, 2 h 15 lost", () => {
  const summary = referenceNight();
  assert.equal(summary.plannedMinutes, 340);
  assert.equal(summary.acquiredMinutes, 205);
  assert.equal(summary.lostMinutes, 135);
  assert.equal(
    summary.plannedMinutes - summary.acquiredMinutes,
    summary.lostMinutes,
  );
});

test("lost time by cause, largest first, each with its span and target", () => {
  const { lostByCause } = referenceNight();
  assert.deepEqual(
    lostByCause.map(({ cause, minutes }) => [cause, minutes]),
    [
      ["clouds", 70],
      ["wind", 35],
      ["guiding", 20],
      ["meridian_flip", 10],
    ],
  );
  assert.deepEqual(lostByCause[2].spans, [
    {
      start: at("22:05"),
      end: at("22:25"),
      targetId: "ngc7000",
      kind: "rejected",
    },
  ]);
  assert.deepEqual(lostByCause[0].spans[0].kind, "abandon");
  assert.deepEqual(lostByCause[1].spans[0].kind, "pause");
});

// Every entry also carries `passages` and `autoUnconfirmedMinutes`; the other
// fields are compared as they always were.
const baseFields = ({ passages, autoUnconfirmedMinutes, ...rest }) => rest;

test("per target: done, partial, abandoned with the debriefing's reason", () => {
  assert.deepEqual(referenceNight().perTarget.map(baseFields), [
    {
      targetId: "ngc7000",
      planItemId: "ngc7000",
      outcome: "done",
      plannedMinutes: 150,
      acquiredMinutes: 120,
      slot: { start: at("20:40"), end: at("23:10") },
    },
    {
      targetId: "ic1396",
      planItemId: "ic1396",
      outcome: "partial",
      plannedMinutes: 120,
      acquiredMinutes: 85,
      slot: { start: at("23:10"), end: at("01:10") },
    },
    {
      targetId: "m45",
      planItemId: "m45",
      outcome: "abandoned",
      plannedMinutes: 70,
      acquiredMinutes: 0,
      slot: { start: at("01:10"), end: at("02:20") },
      skipReason: "weather",
    },
  ]);
});

test("without guiding losses the summary says so and has no guiding line", () => {
  const summary = referenceNight({ guidingLosses: null });
  assert.equal(summary.guidingIncluded, false);
  assert.ok(!summary.lostByCause.some((entry) => entry.cause === "guiding"));
  assert.equal(summary.perTarget[0].acquiredMinutes, 140);
  assert.equal(referenceNight({ guidingLosses: [] }).guidingIncluded, true);
});

test("no score, no rating, no overall mark anywhere in the result", () => {
  const text = JSON.stringify(referenceNight());
  assert.doesNotMatch(text, /score|rating|grade|mark/i);
  assert.deepEqual(Object.keys(referenceNight()).sort(), [
    "acquiredMinutes",
    "autoUnconfirmedMinutes",
    "guidingIncluded",
    "lostByCause",
    "lostMinutes",
    "perTarget",
    "plannedMinutes",
    "segments",
  ]);
});

test("a declared acquired time wins, capped at what was planned", () => {
  const summary = referenceNight({
    adjustments: [
      { targetId: "ngc7000", state: "done", acquiredMinutes: 135 },
      { targetId: "ic1396", state: "partial", acquiredMinutes: 999 },
      { targetId: "m45", state: "skipped", reason: "weather" },
    ],
  });
  assert.deepEqual(
    summary.perTarget.map((target) => target.acquiredMinutes),
    [135, 120, 0],
  );
  // 15 lost on NGC 7000: the flip first, then guiding for the rest.
  const ngc = summary.lostByCause.flatMap((entry) =>
    entry.spans
      .filter((span) => span.targetId === "ngc7000")
      .map((span) => [entry.cause, span.start, span.end]),
  );
  assert.deepEqual(ngc, [
    ["meridian_flip", at("21:15"), at("21:25")],
    ["guiding", at("22:05"), at("22:10")],
  ]);
});

test("a weather skip is clouds unless the latest condition before it says wind or dew", () => {
  const skip = (conditions) =>
    debriefSummary({
      ...night,
      planItems: [items[2]],
      events: [
        ...conditions,
        event("target_skipped", "01:10", {
          targetId: "m45",
          planItemId: "m45",
          reason: "weather",
        }),
      ],
    }).lostByCause.map((entry) => entry.cause);
  assert.deepEqual(skip([]), ["clouds"]);
  assert.deepEqual(skip([event("condition", "00:30", { cause: "wind" })]), [
    "wind",
  ]);
  assert.deepEqual(
    skip([
      event("condition", "00:30", { cause: "wind" }),
      event("condition", "01:00", { cause: "dew" }),
    ]),
    ["dew"],
  );
  // A condition after the skip says nothing about it.
  assert.deepEqual(skip([event("condition", "01:30", { cause: "wind" })]), [
    "clouds",
  ]);
});

test("a pause without a cause is unexplained, with its span", () => {
  const summary = debriefSummary({
    ...night,
    planItems: [items[0]],
    events: [
      started("ngc7000", "20:40"),
      event("pause", "21:00"),
      event("resume", "21:30"),
      finished("ngc7000", "23:10"),
    ],
  });
  assert.deepEqual(summary.lostByCause, [
    {
      cause: "unexplained",
      minutes: 30,
      spans: [
        {
          start: at("21:00"),
          end: at("21:30"),
          targetId: "ngc7000",
          kind: "pause",
        },
      ],
    },
  ]);
});

test("the latest correction wins over the pause's own cause", () => {
  const pause = event("pause", "21:00", { cause: "clouds" });
  const events = [
    pause,
    event("note", "21:05", {
      pauseCause: { pauseEventId: pause.eventId, cause: "wind" },
    }),
    event("note", "21:06", {
      pauseCause: { pauseEventId: pause.eventId, cause: "equipment" },
    }),
  ];
  assert.equal(effectivePauseCause(pause, events), "equipment");
  assert.equal(effectivePauseCause(pause, [pause]), "clouds");
  assert.equal(effectivePauseCause(event("pause", "22:00"), events), null);
});

test("a guiding loss inside a pause is not counted twice", () => {
  const summary = debriefSummary({
    ...night,
    planItems: [items[0]],
    events: [
      started("ngc7000", "20:40"),
      event("pause", "21:00", { cause: "meridian_flip" }),
      event("resume", "21:20"),
      finished("ngc7000", "23:10"),
    ],
    guidingLosses: [{ start: at("21:10"), end: at("21:40") }],
  });
  assert.equal(summary.perTarget[0].acquiredMinutes, 110);
  assert.deepEqual(
    summary.lostByCause.map(({ cause, minutes }) => [cause, minutes]),
    // Equal minutes: the closed list's order breaks the tie.
    [
      ["guiding", 20],
      ["meridian_flip", 20],
    ],
  );
});

test("field events win over the debriefing's planned ones; the late start is unexplained", () => {
  const summary = debriefSummary({
    ...night,
    planItems: [items[0]],
    events: [
      started("ngc7000", "20:40", "planned"),
      finished("ngc7000", "23:10", "planned"),
      started("ngc7000", "21:05"),
      finished("ngc7000", "23:10"),
    ],
    adjustments: [{ targetId: "ngc7000", state: "done" }],
  });
  assert.equal(summary.perTarget[0].acquiredMinutes, 125);
  assert.deepEqual(summary.lostByCause, [
    { cause: "unexplained", minutes: 25, spans: [] },
  ]);
});

test("planned time is the part of each slot inside the session's window", () => {
  const summary = debriefSummary({
    nightStartAt: at("20:40"),
    window: { start: at("21:00"), end: at("22:00") },
    planItems: items,
    events: [],
  });
  assert.deepEqual(
    summary.perTarget.map((target) => target.plannedMinutes),
    [60, 0, 0],
  );
  assert.equal(summary.plannedMinutes, 60);
  // The slot is the clipped stretch the planned minutes count; a slot wholly
  // outside the window has none.
  assert.deepEqual(summary.perTarget[0].slot, {
    start: at("21:00"),
    end: at("22:00"),
  });
  assert.equal("slot" in summary.perTarget[1], false);
});

test("a target the field added counts as acquired with no planned time", () => {
  const summary = debriefSummary({
    ...night,
    planItems: [items[0]],
    events: [
      started("ngc7000", "20:40"),
      finished("ngc7000", "23:10"),
      event("target_started", "23:10", { targetLabel: "Comète du soir" }),
      event("target_finished", "23:55", { targetLabel: "Comète du soir" }),
    ],
  });
  // The base fields of the entry; `passages` comes beside them.
  const { passages, autoUnconfirmedMinutes, ...baseEntry } =
    summary.perTarget[1];
  assert.equal(passages.length, 1);
  assert.equal(autoUnconfirmedMinutes, 0);
  assert.deepEqual(baseEntry, {
    targetId: "Comète du soir",
    planItemId: null,
    outcome: "done",
    plannedMinutes: 0,
    acquiredMinutes: 45,
  });
  assert.equal("slot" in summary.perTarget[1], false);
  assert.equal(summary.lostMinutes, 0);
});

test("the causes list is closed and ends with unexplained", () => {
  assert.deepEqual(DEBRIEF_LOSS_CAUSES, [
    "clouds",
    "wind",
    "dew",
    "guiding",
    "meridian_flip",
    "equipment",
    // « Fatigue », the eighth pause cause, its own line, never « Autre ».
    "fatigue",
    "time",
    "visibility",
    "other",
    "unexplained",
  ]);
  const summary = debriefSummary({ ...night, planItems: items, events: [] });
  for (const entry of summary.lostByCause)
    assert.ok(DEBRIEF_LOSS_CAUSES.includes(entry.cause));
});

// --- Passages, automatic time, the visual night ---

const day = (hm) => `2026-10-11T${hm}:00.000Z`;
const passagesNight = {
  nightStartAt: day("19:00"),
  window: { start: day("19:00"), end: day("23:30") },
};
const passagesItems = [
  { id: "m31", targetId: "m31", startMinute: 0, endMinute: 90 },
  { id: "m33", targetId: "m33", startMinute: 90, endMinute: 180 },
];
const passagesEvent = (type, hm, payload = {}) => ({
  eventId: ulid(),
  type,
  recordedAt: day(hm),
  payload,
});
const passagesStart = (id, hm, extra = {}) =>
  passagesEvent("target_started", hm, {
    targetId: id,
    planItemId: id,
    ...extra,
  });
const passagesFinish = (id, hm, extra = {}) =>
  passagesEvent("target_finished", hm, {
    targetId: id,
    planItemId: id,
    ...extra,
  });
const passagesSummary = (events, rest = {}) =>
  debriefSummary({
    ...passagesNight,
    planItems: passagesItems,
    events,
    ...rest,
  });
const shape = (entry) =>
  entry.passages.map((p) => [
    p.start.slice(11, 16),
    p.end.slice(11, 16),
    p.minutes,
  ]);

test("a target observed twice lists both passages and sums them", () => {
  const summary = passagesSummary([
    passagesStart("m31", "19:00"),
    passagesFinish("m31", "19:40"),
    passagesStart("m33", "19:40"),
    passagesFinish("m33", "20:30"),
    passagesStart("m31", "20:30"),
    passagesFinish("m31", "20:50"),
  ]);
  const m31 = summary.perTarget[0];
  assert.deepEqual(shape(m31), [
    ["19:00", "19:40", 40],
    ["20:30", "20:50", 20],
  ]);
  assert.equal(m31.acquiredMinutes, 60);
  assert.equal(summary.perTarget[1].passages.length, 1);
});

test("a pause inside a passage is listed with its cause and deducted", () => {
  const summary = passagesSummary([
    passagesStart("m31", "19:00"),
    passagesEvent("pause", "19:30", { cause: "wind" }),
    passagesEvent("resume", "19:45"),
    passagesFinish("m31", "20:30"),
  ]);
  const [passage] = summary.perTarget[0].passages;
  assert.equal(passage.minutes, 75);
  assert.deepEqual(
    passage.pauses.map((p) => [
      p.start.slice(11, 16),
      p.end.slice(11, 16),
      p.cause,
    ]),
    [["19:30", "19:45", "wind"]],
  );
  assert.equal(summary.perTarget[0].acquiredMinutes, 75);
});

test("automatic passages are unconfirmed, with their minutes, until confirmed", () => {
  const events = [
    passagesStart("m31", "19:00", { auto: true, advance: "auto" }),
    passagesEvent("pause", "19:50"),
    passagesEvent("resume", "20:00"),
    passagesFinish("m31", "20:30", { auto: true }),
    passagesStart("m33", "20:30"),
    passagesFinish("m33", "21:30"),
  ];
  const before = passagesSummary(events, { kind: "imaging" });
  const [passage] = before.perTarget[0].passages;
  assert.equal(passage.auto, true);
  assert.equal(passage.confirmed, false);
  assert.equal(before.perTarget[0].autoUnconfirmedMinutes, 80);
  assert.equal(before.perTarget[1].autoUnconfirmedMinutes, 0);
  assert.equal(before.autoUnconfirmedMinutes, 80);
  assert.equal(before.perTarget[1].passages[0].confirmed, true);

  const after = passagesSummary(
    [
      ...events,
      passagesEvent("auto_time_confirmed", "21:35", {
        targetId: "m31",
        planItemId: "m31",
      }),
    ],
    { kind: "imaging" },
  );
  assert.equal(after.perTarget[0].passages[0].confirmed, true);
  assert.equal(after.perTarget[0].autoUnconfirmedMinutes, 0);
  assert.equal(after.autoUnconfirmedMinutes, 0);
  // Confirming moves no figure.
  assert.equal(after.acquiredMinutes, before.acquiredMinutes);
  assert.equal(after.lostMinutes, before.lostMinutes);
});

test("a confirmation does not cover a passage the clock wrote after it", () => {
  const summary = passagesSummary([
    passagesStart("m31", "19:00", { auto: true }),
    passagesFinish("m31", "19:40", { auto: true }),
    passagesEvent("auto_time_confirmed", "19:45", { targetId: "m31" }),
    passagesStart("m31", "20:30", { auto: true }),
    passagesFinish("m31", "20:50", { auto: true }),
  ]);
  assert.deepEqual(
    summary.perTarget[0].passages.map((p) => p.confirmed),
    [true, false],
  );
  assert.equal(summary.perTarget[0].autoUnconfirmedMinutes, 20);
});

test("a visual night does not cap a declared time at the plan; an imaging night does", () => {
  const input = {
    events: [
      passagesStart("m31", "19:00", { advance: "manual" }),
      passagesFinish("m31", "20:30"),
    ],
    adjustments: [{ targetId: "m31", state: "done", acquiredMinutes: 120 }],
    outcome: "partial",
  };
  assert.equal(
    passagesSummary(input.events, { ...input, kind: "visual" }).perTarget[0]
      .acquiredMinutes,
    120,
  );
  assert.equal(
    passagesSummary(input.events, { ...input, kind: "imaging" }).perTarget[0]
      .acquiredMinutes,
    90,
  );
  assert.equal(
    passagesSummary(input.events, input).perTarget[0].acquiredMinutes,
    90,
  );
});

test("a visual night lists a target observed off the plan with no planned time", () => {
  const summary = passagesSummary(
    [
      passagesStart("m31", "19:00", { advance: "manual" }),
      passagesEvent("target_started", "19:50", {
        targetId: "m57",
        advance: "manual",
      }),
      passagesStart("m31", "20:10", { advance: "manual" }),
      passagesEvent("target_started", "20:40", {
        targetId: "m57",
        advance: "manual",
      }),
      passagesEvent("target_finished", "21:00", { targetId: "m57" }),
    ],
    { kind: "visual" },
  );
  const m57 = summary.perTarget.find((entry) => entry.targetId === "m57");
  assert.equal(m57.planItemId, null);
  assert.equal(m57.plannedMinutes, 0);
  assert.equal(m57.acquiredMinutes, 40);
  assert.deepEqual(shape(m57), [
    ["19:50", "20:10", 20],
    ["20:40", "21:00", 20],
  ]);
});

test("the launched schedule is restated as slots on the clock, inside the window, without moving the planned figure", () => {
  const retouched = [
    { id: "m31", targetId: "m31", startMinute: 0, endMinute: 120 },
    { id: "m33", targetId: "m33", startMinute: 120, endMinute: 180 },
  ];
  const events = [
    passagesStart("m31", "19:00"),
    passagesFinish("m31", "21:00"),
  ];
  const without = debriefSummary({
    ...passagesNight,
    planItems: retouched,
    events,
  });
  const launched = debriefSummary({
    ...passagesNight,
    planItems: retouched,
    events,
    launchedSchedule: [
      { planItemId: "m31", targetId: "m31", startMinute: 0, endMinute: 90 },
      { planItemId: "m45", startMinute: 240, endMinute: 300 },
    ],
  });
  assert.equal("launchedSlots" in without, false);
  assert.deepEqual(
    launched.launchedSlots.map((slot) => [
      slot.planItemId,
      slot.targetId,
      slot.start.slice(11, 16),
      slot.end.slice(11, 16),
    ]),
    [
      ["m31", "m31", "19:00", "20:30"],
      ["m45", "m45", "23:00", "23:30"],
    ],
  );
  assert.equal(launched.plannedMinutes, without.plannedMinutes);
  assert.equal(launched.plannedMinutes, 180);
});

test("an imaging night's figures do not move with the new inputs", () => {
  const base = referenceNight();
  const withNew = referenceNight({ kind: "imaging", launchedSchedule: [] });
  const figures = (summary) => [
    summary.plannedMinutes,
    summary.acquiredMinutes,
    summary.lostMinutes,
    summary.lostByCause,
    summary.perTarget.map(
      ({ passages, autoUnconfirmedMinutes, ...rest }) => rest,
    ),
  ];
  assert.deepEqual(figures(withNew), figures(base));
  assert.deepEqual(
    [base.plannedMinutes, base.acquiredMinutes, base.lostMinutes],
    [340, 205, 135],
  );
});

// The stretch the application did not run.

test("a hole in NGC 7000 reads 1 h 42 acquired, 28 min of it to confirm", () => {
  const summary = debriefSummary({
    ...night,
    planItems: items,
    events: [
      started("ngc7000", "20:40"),
      event("note", "21:40", {
        appStopped: { from: at("21:12"), to: at("21:40") },
      }),
      finished("ngc7000", "22:22"),
    ],
  });
  const ngc = summary.perTarget.find((entry) => entry.targetId === "ngc7000");
  assert.equal(ngc.acquiredMinutes, 102);
  assert.equal(ngc.autoUnconfirmedMinutes, 28);
  assert.equal(ngc.passages.length, 1);
});

test("a hole inside time the clock counted is counted once", () => {
  const summary = debriefSummary({
    ...night,
    planItems: items,
    events: [
      event("target_started", "20:40", {
        targetId: "ngc7000",
        planItemId: "ngc7000",
        auto: true,
      }),
      event("note", "21:40", {
        appStopped: { from: at("21:12"), to: at("21:40") },
      }),
      finished("ngc7000", "22:22"),
    ],
  });
  const ngc = summary.perTarget.find((entry) => entry.targetId === "ngc7000");
  assert.equal(ngc.autoUnconfirmedMinutes, 102);
});

// « Fatigue », the eighth pause
// cause, is counted on its own line, never folded into « Autre »; the
// person's precision rides on the pause's correction and reaches its span.
test("a « fatigue » pause is its own cause and its span carries the precision", () => {
  const pause = event("pause", "23:50", { cause: "fatigue" });
  const summary = debriefSummary({
    ...night,
    planItems: items,
    events: [
      started("ngc7000", "20:40"),
      finished("ngc7000", "23:10"),
      started("ic1396", "23:10"),
      pause,
      event("note", "23:50", {
        text: "Une sieste dans la voiture",
        pauseCause: { pauseEventId: pause.eventId, cause: "fatigue" },
      }),
      event("resume", "00:25"),
      finished("ic1396", "01:10"),
    ],
  });
  const causes = summary.lostByCause.map((entry) => entry.cause);
  assert.ok(causes.includes("fatigue"));
  assert.ok(!causes.includes("other"));
  const fatigue = summary.lostByCause.find(
    (entry) => entry.cause === "fatigue",
  );
  assert.equal(fatigue.minutes, 35);
  assert.deepEqual(
    fatigue.spans.map((span) => span.note),
    ["Une sieste dans la voiture"],
  );
  assert.equal(effectivePauseCause(pause, [pause]), "fatigue");
});
