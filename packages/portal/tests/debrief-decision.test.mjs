import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDebriefDecisionBody,
  debriefTimeZone,
  defaultSessionWindow,
  formatSessionInstant,
  formatVersionDate,
  fromDateTimeLocalInputValue,
  targetAdjustmentsFromChecklist,
  toDateTimeLocalInputValue,
} from "../dist/components/sessions/debrief-decision.js";

// Pure-function coverage for the debriefing screen's own form logic:
// building the exact debrief.schema.json request body from the form
// state, the target checklist -> sessionAdjustments.targets mapping, and the
// UTC datetime-local round trip the session preview's editable fields use.

test("toDateTimeLocalInputValue truncates an ISO instant to minutes", () => {
  assert.equal(
    toDateTimeLocalInputValue("2026-09-16T01:50:00.000Z"),
    "2026-09-16T01:50",
  );
  assert.equal(toDateTimeLocalInputValue(null), "");
  assert.equal(toDateTimeLocalInputValue("not-a-date"), "");
});

test("fromDateTimeLocalInputValue is the exact inverse", () => {
  assert.equal(
    fromDateTimeLocalInputValue("2026-09-16T01:50"),
    "2026-09-16T01:50:00.000Z",
  );
  assert.equal(fromDateTimeLocalInputValue(""), null);
  assert.equal(fromDateTimeLocalInputValue("2026-09-16"), null);
});

test("defaultSessionWindow prefills from the derived night, editable from the start", () => {
  assert.deepEqual(
    defaultSessionWindow({
      nightStartAt: "2026-09-16T00:46:37.000Z",
      nightEndAt: "2026-09-16T08:52:44.000Z",
    }),
    { startedAt: "2026-09-16T00:46", finishedAt: "2026-09-16T08:52" },
  );
});

test("defaultSessionWindow is blank when the night could not be derived", () => {
  assert.deepEqual(
    defaultSessionWindow({ nightStartAt: null, nightEndAt: null }),
    {
      startedAt: "",
      finishedAt: "",
    },
  );
});

test("targetAdjustmentsFromChecklist: checked with no note is done", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      { targetId: "m31", checked: true, note: "", reason: "" },
    ]),
    [{ targetId: "m31", state: "done" }],
  );
});

test("targetAdjustmentsFromChecklist: checked with a note is modified", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      {
        targetId: "ngc7000",
        checked: true,
        note: "Guiding lost after the flip, kept 40 minutes.",
        reason: "",
      },
    ]),
    [
      {
        targetId: "ngc7000",
        state: "modified",
        note: "Guiding lost after the flip, kept 40 minutes.",
      },
    ],
  );
});

test("targetAdjustmentsFromChecklist: unchecked with a reason is skipped", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      { targetId: "m45", checked: false, note: "", reason: "weather" },
    ]),
    [{ targetId: "m45", state: "skipped", reason: "weather" }],
  );
});

test("targetAdjustmentsFromChecklist: unchecked with no reason is still skipped", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      { targetId: "m45", checked: false, note: "", reason: "" },
    ]),
    [{ targetId: "m45", state: "skipped" }],
  );
});

test("targetAdjustmentsFromChecklist: an unrecognized reason is dropped, not sent invalid", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      {
        targetId: "m45",
        checked: false,
        note: "",
        reason: "not-a-real-reason",
      },
    ]),
    [{ targetId: "m45", state: "skipped" }],
  );
});

test("targetAdjustmentsFromChecklist: a skipped note is clamped to 300 characters", () => {
  const [adjustment] = targetAdjustmentsFromChecklist([
    { targetId: "m45", checked: false, note: "x".repeat(400), reason: "other" },
  ]);
  assert.equal(adjustment.note.length, 300);
});

test("targetAdjustmentsFromChecklist: a modified note is clamped to 500 characters", () => {
  const [adjustment] = targetAdjustmentsFromChecklist([
    { targetId: "m31", checked: true, note: "x".repeat(600), reason: "" },
  ]);
  assert.equal(adjustment.note.length, 500);
});

test("targetAdjustmentsFromChecklist: a row with no targetId is dropped", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([{ targetId: "", checked: true }]),
    [],
  );
});

test("buildDebriefDecisionBody: executed carries no sessionAdjustments", () => {
  assert.deepEqual(
    buildDebriefDecisionBody({
      outcome: "executed",
      sessionStartedAt: "2026-09-16T01:50:00.000Z",
      sessionFinishedAt: "2026-09-16T06:20:00.000Z",
    }),
    {
      outcome: "executed",
      session: {
        startedAt: "2026-09-16T01:50:00.000Z",
        finishedAt: "2026-09-16T06:20:00.000Z",
      },
    },
  );
});

test("buildDebriefDecisionBody: partial carries sessionAdjustments built from the checklist", () => {
  const body = buildDebriefDecisionBody({
    outcome: "partial",
    sessionStartedAt: "2026-09-16T01:50:00.000Z",
    sessionFinishedAt: "2026-09-16T06:20:00.000Z",
    targetRows: [
      { targetId: "m31", checked: true, note: "", reason: "" },
      { targetId: "m45", checked: false, note: "", reason: "weather" },
    ],
    note: "Clouds rolled in around 2 a.m.",
  });
  assert.deepEqual(body, {
    outcome: "partial",
    session: {
      startedAt: "2026-09-16T01:50:00.000Z",
      finishedAt: "2026-09-16T06:20:00.000Z",
    },
    sessionAdjustments: {
      targets: [
        { targetId: "m31", state: "done" },
        { targetId: "m45", state: "skipped", reason: "weather" },
      ],
    },
    note: "Clouds rolled in around 2 a.m.",
  });
});

test("buildDebriefDecisionBody: the events added and the reports moved at the debriefing go in the request, in the rework's forms", async () => {
  const rework = await import("../dist/components/sessions/session-rework.js");
  const draft = {
    targets: [],
    added: [
      {
        id: "draft-1",
        kind: "pause",
        at: Date.parse("2026-09-16T03:00:00.000Z"),
        until: Date.parse("2026-09-16T03:20:00.000Z"),
        targetKey: "m31",
        text: "Rosée sur le tube",
        cause: "dew",
      },
      {
        id: "draft-2",
        kind: "sky",
        at: Date.parse("2026-09-16T04:00:00.000Z"),
        until: null,
        targetKey: null,
        text: null,
        sky: "hazy",
      },
      {
        id: "draft-3",
        kind: "incident",
        at: Date.parse("2026-09-16T04:10:00.000Z"),
        until: null,
        targetKey: "m45",
        text: "Câble débranché",
      },
    ],
    // A report already recorded moves to the whole night; an added one
    // follows the move it was given (no `eventMoves` entry for it).
    moves: { "01JEVENT": null, "draft-2": "m31" },
    removals: [],
  };
  const body = buildDebriefDecisionBody({
    outcome: "partial",
    sessionStartedAt: "2026-09-16T01:50:00.000Z",
    sessionFinishedAt: "2026-09-16T06:20:00.000Z",
    targetRows: [{ targetId: "m31", checked: true }],
    addedEvents: rework.addedEventsBody(draft),
    eventMoves: rework.eventMovesBody(draft),
  });
  assert.deepEqual(body.addedEvents, [
    {
      type: "pause",
      at: "2026-09-16T03:00:00.000Z",
      until: "2026-09-16T03:20:00.000Z",
      targetId: "m31",
      payload: { cause: "dew", reason: "Rosée sur le tube" },
    },
    {
      type: "condition",
      at: "2026-09-16T04:00:00.000Z",
      targetId: "m31",
      payload: { sky: "hazy" },
    },
    {
      type: "equipment_issue",
      at: "2026-09-16T04:10:00.000Z",
      targetId: "m45",
      payload: { description: "Câble débranché" },
    },
  ]);
  assert.deepEqual(body.eventMoves, [{ eventId: "01JEVENT", targetId: null }]);
  // Nothing added, nothing moved: the request is the one of before.
  assert.equal(
    "addedEvents" in
      buildDebriefDecisionBody({
        outcome: "partial",
        addedEvents: [],
        eventMoves: [],
      }),
    false,
  );
  // A night not carried out holds no event.
  assert.deepEqual(
    buildDebriefDecisionBody({
      outcome: "abandoned",
      addedEvents: rework.addedEventsBody(draft),
    }),
    { outcome: "abandoned" },
  );
});

test("buildDebriefDecisionBody: abandoned carries no session, sessionAdjustments or note", () => {
  assert.deepEqual(
    buildDebriefDecisionBody({
      outcome: "abandoned",
      sessionStartedAt: "2026-09-16T01:50:00.000Z",
      sessionFinishedAt: "2026-09-16T06:20:00.000Z",
      targetRows: [{ targetId: "m31", checked: false, reason: "weather" }],
      note: "The clouds already won.",
    }),
    { outcome: "abandoned" },
  );
});

test("buildDebriefDecisionBody: baseVersion and setAsideVersionId only appear when chosen", () => {
  assert.deepEqual(
    buildDebriefDecisionBody({ outcome: "executed" }).baseVersion,
    undefined,
  );
  assert.deepEqual(
    buildDebriefDecisionBody({
      outcome: "executed",
      baseVersion: "current",
      setAsideVersionId: "11111111-1111-4111-8111-111111111111",
    }),
    { outcome: "executed", baseVersion: "current" },
  );
  assert.deepEqual(
    buildDebriefDecisionBody({
      outcome: "executed",
      baseVersion: "set_aside",
      setAsideVersionId: "11111111-1111-4111-8111-111111111111",
    }),
    {
      outcome: "executed",
      baseVersion: "set_aside",
      setAsideVersionId: "11111111-1111-4111-8111-111111111111",
    },
  );
});

test("buildDebriefDecisionBody: an empty session window is omitted rather than sent blank", () => {
  assert.deepEqual(buildDebriefDecisionBody({ outcome: "executed" }), {
    outcome: "executed",
  });
});

test("formatVersionDate formats in UTC regardless of the host timezone", () => {
  const formatted = formatVersionDate("2026-09-15T18:42:00.000Z", "en");
  assert.equal(typeof formatted, "string");
  assert.ok(formatted.length > 0);
  assert.equal(formatVersionDate("not-a-date", "en"), "");
});

test("session hours are shown and edited in the plan's own local time", () => {
  // 21:30 in Tokyo is 12:30 UTC; the field shows the wall clock of the place.
  assert.equal(
    toDateTimeLocalInputValue("2026-09-16T12:30:00.000Z", "Asia/Tokyo"),
    "2026-09-16T21:30",
  );
  assert.equal(
    fromDateTimeLocalInputValue("2026-09-16T21:30", "Asia/Tokyo"),
    "2026-09-16T12:30:00.000Z",
  );
  // A night that crosses midnight locally lands on the next local day.
  assert.deepEqual(
    defaultSessionWindow({
      nightStartAt: "2026-09-16T10:14:37.000Z",
      nightEndAt: "2026-09-16T18:56:02.000Z",
      timeZone: "Asia/Tokyo",
    }),
    { startedAt: "2026-09-16T19:14", finishedAt: "2026-09-17T03:56" },
  );
});

test("the local-time round trip survives a daylight-saving change", () => {
  // Europe/Paris leaves summer time on 2026-10-25 at 03:00 (UTC+2 -> UTC+1).
  for (const instant of [
    "2026-10-24T22:15:00.000Z",
    "2026-10-25T03:45:00.000Z",
    "2026-03-29T00:30:00.000Z",
    "2026-03-29T04:05:00.000Z",
  ]) {
    const wall = toDateTimeLocalInputValue(instant, "Europe/Paris");
    assert.equal(fromDateTimeLocalInputValue(wall, "Europe/Paris"), instant);
  }
  assert.equal(
    toDateTimeLocalInputValue("2026-10-24T22:15:00.000Z", "Europe/Paris"),
    "2026-10-25T00:15",
  );
});

test("an absent or unusable zone reads as UTC, and says so", () => {
  assert.equal(debriefTimeZone(undefined), "UTC");
  assert.equal(debriefTimeZone("Not/AZone"), "UTC");
  assert.equal(debriefTimeZone("Asia/Tokyo"), "Asia/Tokyo");
  assert.equal(
    toDateTimeLocalInputValue("2026-09-16T01:50:00.000Z", "Not/AZone"),
    "2026-09-16T01:50",
  );
  assert.match(
    formatSessionInstant("2026-09-16T12:30:00.000Z", "en", null),
    /12:30.*UTC$/,
  );
  const local = formatSessionInstant(
    "2026-09-16T12:30:00.000Z",
    "en",
    "Asia/Tokyo",
  );
  assert.match(local, /21:30/);
  assert.doesNotMatch(local, /UTC/);
  assert.equal(formatSessionInstant("nope", "en", "Asia/Tokyo"), "");
});

test("targetAdjustmentsFromChecklist: a partial row and declared acquired minutes", () => {
  assert.deepEqual(
    targetAdjustmentsFromChecklist([
      { targetId: "ic1396", checked: true, partial: true, acquiredMinutes: 85 },
      { targetId: "ngc7000", checked: true, acquiredMinutes: 120 },
      { targetId: "m31", checked: true, acquiredMinutes: -3, note: "Dew." },
      { targetId: "m45", checked: false, acquiredMinutes: 30 },
    ]),
    [
      { targetId: "ic1396", state: "partial", acquiredMinutes: 85 },
      { targetId: "ngc7000", state: "done", acquiredMinutes: 120 },
      { targetId: "m31", state: "modified", note: "Dew." },
      { targetId: "m45", state: "skipped" },
    ],
  );
});
