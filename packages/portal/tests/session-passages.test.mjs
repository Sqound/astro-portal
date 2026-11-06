import assert from "node:assert/strict";
import test from "node:test";

import { debriefSummary } from "../dist/debrief-summary.js";
import { sessionPassages } from "../dist/session-passages.js";

// The passages of a night. A target may be observed in several passages;
// the time on it is their sum, pauses deducted.

const at = (hm) => `2026-10-10T${hm.length === 5 ? `${hm}:00` : hm}.000Z`;
let counter = 0;
const ulid = () => `01J9PASSAGETEST${String((counter += 1)).padStart(11, "0")}`;
const event = (type, hm, payload = {}, timing) => ({
  eventId: ulid(),
  type,
  recordedAt: at(hm),
  ...(timing ? { timing } : {}),
  payload,
});
const target = (id) => ({ targetId: id, planItemId: id });
const started = (id, hm, extra = {}, timing) =>
  event("target_started", hm, { ...target(id), ...extra }, timing);
const finished = (id, hm, extra = {}, timing) =>
  event("target_finished", hm, { ...target(id), ...extra }, timing);
const skipped = (id, hm) =>
  event("target_skipped", hm, { ...target(id), reason: "weather" });
const MINUTE = 60000;
const brief = (passages) =>
  passages.map((passage) => [
    passage.targetId ?? passage.targetLabel,
    passage.start.slice(11, 19),
    passage.end?.slice(11, 19) ?? null,
    passage.endedBy,
  ]);

test("one start and its finish make one passage", () => {
  const passages = sessionPassages({
    events: [started("m31", "20:00"), finished("m31", "21:00")],
    windowEnd: at("23:00"),
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:00:00", "21:00:00", "finished"],
  ]);
  assert.equal(passages[0].countedMs, 60 * MINUTE);
  assert.equal(passages[0].pausedMs, 0);
});

test("a target started again after it finished adds a second passage", () => {
  const passages = sessionPassages({
    events: [
      started("m31", "20:00"),
      finished("m31", "20:30"),
      started("m33", "20:30"),
      finished("m33", "21:00"),
      started("m31", "21:00"),
      finished("m31", "21:20"),
    ],
    windowEnd: at("23:00"),
  });
  const m31 = passages.filter((passage) => passage.targetId === "m31");
  assert.equal(m31.length, 2);
  assert.equal(
    m31.reduce((sum, passage) => sum + passage.countedMs, 0),
    50 * MINUTE,
  );
});

test("a start of another target closes the one running at that instant", () => {
  const passages = sessionPassages({
    events: [started("m31", "20:00"), started("m33", "20:45")],
    windowEnd: at("21:30"),
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:00:00", "20:45:00", "switched"],
    ["m33", "20:45:00", "21:30:00", "window_end"],
  ]);
});

test("a skip closes its own passage, never another target's", () => {
  const passages = sessionPassages({
    events: [started("m31", "20:00"), skipped("m45", "20:10")],
    windowEnd: at("21:00"),
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:00:00", "21:00:00", "window_end"],
  ]);
  const own = sessionPassages({
    events: [started("m31", "20:00"), skipped("m31", "20:10")],
  });
  assert.deepEqual(brief(own), [["m31", "20:00:00", "20:10:00", "skipped"]]);
});

test("the pauses inside a passage are deducted, an open one up to the end", () => {
  const passages = sessionPassages({
    events: [
      started("m31", "20:00"),
      event("pause", "20:10"),
      event("resume", "20:20"),
      event("pause", "20:50"),
    ],
    windowEnd: at("21:00"),
  });
  assert.equal(passages[0].pausedMs, 20 * MINUTE);
  assert.equal(passages[0].countedMs, 40 * MINUTE);
});

test("without a window end the running passage stays open", () => {
  const passages = sessionPassages({
    events: [started("m31", "20:00"), event("pause", "20:10")],
  });
  assert.deepEqual(brief(passages), [["m31", "20:00:00", null, null]]);
  assert.equal(passages[0].pausedMs, null);
  assert.equal(passages[0].countedMs, null);
});

test("automatic time is flagged, then confirmed by a later confirmation only", () => {
  const passages = sessionPassages({
    events: [
      started("m31", "20:00", { auto: true, advance: "auto" }),
      finished("m31", "21:00", { auto: true }),
      event("auto_time_confirmed", "21:05", target("m31")),
      started("m31", "21:10", { advance: "manual" }),
      finished("m31", "21:30", { auto: true }),
      started("m33", "21:30", { advance: "manual" }),
      finished("m33", "22:00"),
    ],
    windowEnd: at("23:00"),
  });
  assert.deepEqual(
    passages.map((passage) => [
      passage.targetId,
      passage.auto,
      passage.autoConfirmed,
      passage.advance,
    ]),
    [
      ["m31", true, true, "auto"],
      ["m31", true, false, "manual"],
      ["m33", false, false, "manual"],
    ],
  );
});

test("the debriefing's events stand only for a target the field never started", () => {
  const passages = sessionPassages({
    events: [
      started("m31", "20:00", {}, "planned"),
      finished("m31", "21:00", {}, "planned"),
      started("m31", "20:15"),
      finished("m31", "20:50"),
      started("m33", "21:00", {}, "reconstructed"),
      finished("m33", "21:40", {}, "reconstructed"),
    ],
    windowEnd: at("23:00"),
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:15:00", "20:50:00", "finished"],
    ["m33", "21:00:00", "21:40:00", "finished"],
  ]);
  assert.equal(passages[1].timing, "reconstructed");
});

test("a second start of the target running continues its passage", () => {
  const passages = sessionPassages({
    events: [
      started("m31", "20:00"),
      started("m31", "20:30"),
      finished("m33", "20:40"),
      finished("m31", "21:00"),
    ],
    windowEnd: at("23:00"),
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:00:00", "21:00:00", "finished"],
  ]);
});

test("two plan items of one object are two targets; a free label is a target", () => {
  const passages = sessionPassages({
    events: [
      event("target_started", "20:00", { targetId: "m31", planItemId: "a" }),
      event("target_started", "20:30", { targetId: "m31", planItemId: "b" }),
      event("target_started", "21:00", { targetLabel: "Comète du soir" }),
      event("target_finished", "21:20", { targetLabel: "Comète du soir" }),
    ],
    windowEnd: at("23:00"),
  });
  assert.deepEqual(
    passages.map((passage) => [
      passage.planItemId,
      passage.targetLabel,
      passage.endedBy,
    ]),
    [
      ["a", null, "switched"],
      ["b", null, "switched"],
      [null, "Comète du soir", "finished"],
    ],
  );
});

test("the journal is read in session order, by instant then event id", () => {
  const first = started("m31", "20:00");
  const last = finished("m31", "20:20:30");
  const passages = sessionPassages({
    events: [last, { ...event("note", "20:10"), recordedAt: "?" }, first],
  });
  assert.deepEqual(brief(passages), [
    ["m31", "20:00:00", "20:20:30", "finished"],
  ]);
  assert.equal(passages[0].countedMs, 20 * MINUTE + 30000);
  assert.equal(passages[0].startEventId, first.eventId);
  assert.equal(passages[0].endEventId, last.eventId);
});

test("the summary of a night counts a resumed target's two passages", () => {
  const summary = debriefSummary({
    nightStartAt: at("20:00"),
    window: { start: at("20:00"), end: at("22:00") },
    planItems: [
      { id: "m31", targetId: "m31", startMinute: 0, endMinute: 60 },
      { id: "m33", targetId: "m33", startMinute: 60, endMinute: 120 },
    ],
    events: [
      started("m31", "20:00"),
      started("m33", "20:40"),
      started("m31", "21:00"),
      finished("m31", "21:20"),
      started("m33", "21:20"),
      finished("m33", "22:00"),
    ],
  });
  const m31 = summary.perTarget.find((entry) => entry.targetId === "m31");
  const m33 = summary.perTarget.find((entry) => entry.targetId === "m33");
  // M31: 20:00–20:40 and 21:00–21:20 = 60 min; M33: 20:40–21:00 and
  // 21:20–22:00 = 60 min. Before the passages, M31's second start was lost
  // inside its first and M33 ran on to the end.
  assert.equal(m31.acquiredMinutes, 60);
  assert.equal(m33.acquiredMinutes, 60);
});

// The souvenir images of the aiming screen are captures of the session;
// each is listed on the passage of its target it falls in.

test("a capture is carried by the passage of its target that contains it", () => {
  const passages = sessionPassages({
    events: [
      started("saturne", "20:40"),
      started("m57", "21:10"),
      started("saturne", "21:40"),
      finished("saturne", "22:30"),
    ],
    windowEnd: at("23:00"),
    captures: [
      { captureId: "late", ...target("saturne"), at: at("22:10") },
      { captureId: "first", ...target("saturne"), at: at("20:50") },
      { captureId: "first-plain", ...target("saturne"), at: at("20:50") },
      { captureId: "m57", targetId: "m57", at: at("21:20") },
      { captureId: "other-target", targetId: "m31", at: at("21:25") },
      { captureId: "after-the-end", ...target("saturne"), at: at("22:45") },
      { captureId: "no-time", ...target("saturne") },
    ],
  });
  assert.deepEqual(
    passages.map((passage) => passage.captureIds),
    [["first", "first-plain"], ["m57"], ["late"]],
  );
});

test("captureIds is absent when no capture falls in a passage", () => {
  const passages = sessionPassages({
    events: [started("m31", "20:00"), finished("m31", "21:00")],
    windowEnd: at("23:00"),
    captures: [{ captureId: "elsewhere", targetId: "m33", at: at("20:30") }],
  });
  assert.equal("captureIds" in passages[0], false);
  const without = sessionPassages({
    events: [started("m31", "20:00")],
    windowEnd: null,
  });
  assert.equal("captureIds" in without[0], false);
});

// The stretch the application did not run is one note carrying `appStopped`;
// the passage running through it keeps its time, counted as automatic time
// not confirmed yet.

const appStopped = (from, to, hm) =>
  event("note", hm, { appStopped: { from: at(from), to: at(to) } });

test("a hole keeps the passage whole and counts its minutes as automatic time to confirm", () => {
  const passages = sessionPassages({
    events: [
      started("ngc7000", "22:19"),
      appStopped("23:12", "23:40", "23:40"),
      finished("ngc7000", "23:59"),
    ],
    windowEnd: at("23:59"),
  });
  assert.deepEqual(brief(passages), [
    ["ngc7000", "22:19:00", "23:59:00", "finished"],
  ]);
  assert.equal(passages[0].countedMs, 100 * MINUTE);
  assert.equal(passages[0].auto, false);
  assert.equal(passages[0].holeMs, 28 * MINUTE);
  assert.equal(passages[0].holeConfirmed, false);
});

test("a pause over the hole leaves nothing to confirm; a later confirmation confirms it", () => {
  const base = [
    started("ngc7000", "22:19"),
    appStopped("23:12", "23:40", "23:40"),
    finished("ngc7000", "23:59"),
  ];
  const paused = sessionPassages({
    events: [...base, event("pause", "23:12"), event("resume", "23:40")],
    windowEnd: at("23:59"),
  });
  assert.equal(paused[0].countedMs, 72 * MINUTE);
  assert.equal("holeMs" in paused[0], false);
  const confirmed = sessionPassages({
    events: [
      ...base,
      event("auto_time_confirmed", "23:59:30", target("ngc7000")),
    ],
    windowEnd: at("23:59"),
  });
  assert.equal(confirmed[0].holeMs, 28 * MINUTE);
  assert.equal(confirmed[0].holeConfirmed, true);
});

test("the summary of a night keeps one passage and counts 28 min to confirm", () => {
  const summary = debriefSummary({
    nightStartAt: at("20:00"),
    window: { start: at("20:00"), end: at("23:59") },
    planItems: [
      { id: "ngc7000", targetId: "ngc7000", startMinute: 139, endMinute: 259 },
    ],
    events: [
      started("ngc7000", "22:19"),
      appStopped("23:12", "23:40", "23:40"),
      finished("ngc7000", "23:59"),
    ],
  });
  const entry = summary.perTarget[0];
  assert.equal(entry.passages.length, 1);
  assert.equal(entry.acquiredMinutes, 100);
  assert.equal(entry.autoUnconfirmedMinutes, 28);
  assert.equal(summary.autoUnconfirmedMinutes, 28);
  // The strip is unchanged: the passage itself was started by a gesture.
  assert.equal(entry.passages[0].confirmed, true);
});
