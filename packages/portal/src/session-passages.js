/**
 * The passages of a night: the stretches of time each target was really
 * observed, read from the session's journal. A target may be observed in
 * several passages — coming back to a target already observed adds a
 * passage, it never replaces the first — and the time spent on it is the sum
 * of its passages, pauses deducted.
 *
 * Pure and JSON-in/JSON-out: the summary of a night (`debrief-summary.js`)
 * reads its observed spans from here, and the public fixture
 * `session-passages.json` pins the results.
 *
 * Input:
 *
 * - `events` — the journal, as GET /v1/sessions/{id}/events returns it
 *   (`{ eventId, type, recordedAt, timing?, payload }`), in any order; it is
 *   read in session order (`recordedAt`, then `eventId`).
 * - `windowEnd` — the instant the session ended (ISO), or null while it is
 *   still running: a passage still open at the end closes there.
 * - `captures` (optional) — the captures taken during the
 *   night, `{ captureId, targetId?, targetLabel?, planItemId?, at }` (the
 *   souvenir image of the aiming screen): each is listed on the passage of
 *   its target that contains its instant.
 *
 * Rules:
 *
 * - each `target_started` opens a passage; it ends at that target's own
 *   `target_finished` or `target_skipped`, at the next `target_started` of
 *   another target, or at `windowEnd`; with no `windowEnd` it stays open
 *   (`end: null`);
 * - a `target_started` of the target already running continues its passage;
 *   a finish or a skip of a target that is not running closes nothing;
 * - two events name the same target when they carry the same `planItemId`,
 *   or, when one of them carries none, the same `targetId` (else
 *   `targetLabel`);
 * - the debriefing's own events (`timing: planned | reconstructed`) are
 *   ignored for a target the field journal already started;
 * - the pauses (`pause` → `resume`, an open one running to `windowEnd`)
 *   inside a closed passage are deducted from it (`pausedMs`, `countedMs`);
 * - `auto` is true when the passage's start or finish was written by the
 *   device's clock in automatic mode, and `autoConfirmed` when an
 *   `auto_time_confirmed` naming the same target comes after the last of
 *   them in session order;
 * - `captureIds` is present only when at least one capture falls in the
 *   passage: same target (the rule above), `start <= at <= end` (an open
 *   passage has no end), in the order of `at`, then of `captureId`;
 * - a `note` carrying `appStopped` `{ from, to }`
 *   names a stretch the application did not run (`to` after `from`, else
 *   ignored; overlapping stretches count once). The passage is never cut by
 *   it: `holeMs` is the time the passage spends inside such stretches,
 *   pauses deducted — automatic time, since nobody watched it — and
 *   `holeConfirmed` is true when an `auto_time_confirmed` naming the same
 *   target comes after the last of those notes in session order. Both are
 *   present only when `holeMs` is above zero (a stretch covered by a pause,
 *   « J’étais en pause », counts nothing).
 */

/**
 * @typedef {{
 *   targetId: string | null,
 *   targetLabel: string | null,
 *   planItemId: string | null,
 *   start: string,
 *   end: string | null,
 *   endedBy: "finished" | "skipped" | "switched" | "window_end" | null,
 *   pausedMs: number | null,
 *   countedMs: number | null,
 *   auto: boolean,
 *   autoConfirmed: boolean,
 *   advance: "auto" | "manual" | null,
 *   timing: "planned" | "reconstructed" | null,
 *   startEventId: string,
 *   endEventId: string | null,
 *   captureIds?: string[],
 *   holeMs?: number,
 *   holeConfirmed?: boolean,
 * }} SessionPassage
 */

const TARGET_EVENT_TYPES = new Set([
  "target_started",
  "target_finished",
  "target_skipped",
]);

function instantOf(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isoOf(ms) {
  return new Date(ms).toISOString();
}

function text(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function journalOf(events) {
  return (Array.isArray(events) ? events : [])
    .map((event) => {
      const payload =
        event?.payload && typeof event.payload === "object"
          ? event.payload
          : {};
      return {
        eventId: String(event?.eventId ?? ""),
        type: event?.type,
        timing:
          event?.timing === "planned" || event?.timing === "reconstructed"
            ? event.timing
            : null,
        payload,
        at: instantOf(event?.recordedAt),
        planItemId: text(payload.planItemId),
        targetId: text(payload.targetId),
        targetLabel: text(payload.targetLabel),
      };
    })
    .filter((event) => event.at !== null)
    .sort(
      (left, right) =>
        left.at - right.at ||
        (left.eventId < right.eventId
          ? -1
          : left.eventId > right.eventId
            ? 1
            : 0),
    );
}

function nameOf(event) {
  return event.targetId ?? event.targetLabel;
}

/** Whether two events name the same target (see the rules above). */
function sameTarget(left, right) {
  if (left.planItemId && right.planItemId)
    return left.planItemId === right.planItemId;
  const name = nameOf(left);
  return name !== null && name === nameOf(right);
}

function pauseIntervalsOf(journal, windowEnd) {
  const intervals = [];
  let open = null;
  for (const event of journal) {
    if (event.type === "pause" && open === null) open = event.at;
    else if (event.type === "resume" && open !== null) {
      intervals.push([open, event.at]);
      open = null;
    }
  }
  if (open !== null) intervals.push([open, windowEnd ?? Infinity]);
  return intervals.filter(([start, end]) => end > start);
}

function pausedInside(pauses, start, end) {
  let paused = 0;
  for (const [pauseStart, pauseEnd] of pauses) {
    const from = Math.max(start, pauseStart);
    const to = Math.min(end, pauseEnd);
    if (to > from) paused += to - from;
  }
  return paused;
}

/** Whether `left` comes after `right` in session order. */
function after(left, right) {
  return (
    left.at > right.at || (left.at === right.at && left.eventId > right.eventId)
  );
}

/**
 * The stretches the application did not run (`note` with `appStopped`), in
 * the order of their start, overlapping ones merged; each keeps the latest
 * of its notes in session order (`note`).
 */
function holesOf(journal) {
  const holes = journal
    .filter(
      (event) =>
        event.type === "note" &&
        event.payload.appStopped &&
        typeof event.payload.appStopped === "object",
    )
    .map((event) => ({
      from: instantOf(event.payload.appStopped.from),
      to: instantOf(event.payload.appStopped.to),
      note: event,
    }))
    .filter((hole) => hole.from !== null && hole.to !== null)
    .filter((hole) => hole.to > hole.from)
    .sort((left, right) => left.from - right.from);
  const merged = [];
  for (const hole of holes) {
    const last = merged[merged.length - 1];
    if (last && hole.from <= last.to) {
      last.to = Math.max(last.to, hole.to);
      if (after(hole.note, last.note)) last.note = hole.note;
    } else merged.push({ ...hole });
  }
  return merged;
}

function capturesOf(captures) {
  return (Array.isArray(captures) ? captures : [])
    .map((capture) => ({
      captureId: text(capture?.captureId),
      planItemId: text(capture?.planItemId),
      targetId: text(capture?.targetId),
      targetLabel: text(capture?.targetLabel),
      at: instantOf(capture?.at),
    }))
    .filter((capture) => capture.captureId !== null && capture.at !== null)
    .sort(
      (left, right) =>
        left.at - right.at ||
        (left.captureId < right.captureId
          ? -1
          : left.captureId > right.captureId
            ? 1
            : 0),
    );
}

/**
 * sessionPassages({ events, windowEnd, captures }) -> SessionPassage[], in
 * the order the passages started.
 *
 * @param {{ events?: unknown[], windowEnd?: string | null, captures?: unknown[] }} input
 * @returns {SessionPassage[]}
 */
export function sessionPassages({
  events = [],
  windowEnd = null,
  captures = [],
} = {}) {
  const all = journalOf(events);
  const end = instantOf(windowEnd);

  // The debriefing's events stand only for a target the field never started.
  const fieldStarts = all.filter(
    (event) => event.type === "target_started" && event.timing === null,
  );
  const journal = all.filter(
    (event) =>
      !TARGET_EVENT_TYPES.has(event.type) ||
      event.timing === null ||
      !fieldStarts.some((start) => sameTarget(start, event)),
  );

  const passages = [];
  let open = null;
  const close = (at, endedBy, endEvent) => {
    passages.push({ ...open, end: at, endedBy, endEvent });
    open = null;
  };
  for (const event of journal) {
    if (event.type === "target_started") {
      if (open && sameTarget(open.startEvent, event)) continue;
      if (open) close(event.at, "switched", null);
      open = { startEvent: event, start: event.at };
    } else if (
      open &&
      (event.type === "target_finished" || event.type === "target_skipped") &&
      sameTarget(open.startEvent, event)
    )
      close(
        event.at,
        event.type === "target_finished" ? "finished" : "skipped",
        event,
      );
  }
  if (open) {
    if (end === null) passages.push({ ...open, end: null, endedBy: null });
    else close(Math.max(open.start, end), "window_end", null);
  }

  const pauses = pauseIntervalsOf(journal, end);
  const confirmations = journal.filter(
    (event) => event.type === "auto_time_confirmed",
  );
  const taken = capturesOf(captures);
  const holes = holesOf(journal);
  return passages.map((passage) => {
    const startEvent = passage.startEvent;
    const autoEvents = [startEvent, passage.endEvent].filter(
      (event) => event && event.payload.auto === true,
    );
    const lastAuto = autoEvents[autoEvents.length - 1] ?? null;
    const autoConfirmed =
      lastAuto !== null &&
      confirmations.some(
        (confirmation) =>
          sameTarget(startEvent, confirmation) &&
          (confirmation.at > lastAuto.at ||
            (confirmation.at === lastAuto.at &&
              confirmation.eventId > lastAuto.eventId)),
      );
    const paused =
      passage.end === null
        ? null
        : pausedInside(pauses, passage.start, passage.end);
    const advance = startEvent.payload.advance;
    const captureIds = taken
      .filter(
        (capture) =>
          sameTarget(startEvent, capture) &&
          capture.at >= passage.start &&
          (passage.end === null || capture.at <= passage.end),
      )
      .map((capture) => capture.captureId);
    let holeMs = 0;
    let lastHole = null;
    for (const hole of holes) {
      const from = Math.max(passage.start, hole.from);
      const to = Math.min(passage.end ?? Infinity, hole.to);
      if (to <= from) continue;
      const inside = to - from - pausedInside(pauses, from, to);
      if (inside <= 0) continue;
      holeMs += inside;
      if (lastHole === null || after(hole.note, lastHole)) lastHole = hole.note;
    }
    const holeConfirmed =
      lastHole !== null &&
      confirmations.some(
        (confirmation) =>
          sameTarget(startEvent, confirmation) && after(confirmation, lastHole),
      );
    return {
      targetId: startEvent.targetId,
      targetLabel: startEvent.targetLabel,
      planItemId: startEvent.planItemId,
      start: isoOf(passage.start),
      end: passage.end === null ? null : isoOf(passage.end),
      endedBy: passage.endedBy,
      pausedMs: paused,
      countedMs: paused === null ? null : passage.end - passage.start - paused,
      auto: lastAuto !== null,
      autoConfirmed,
      advance: advance === "auto" || advance === "manual" ? advance : null,
      timing: startEvent.timing,
      startEventId: startEvent.eventId,
      endEventId: passage.endEvent?.eventId ?? null,
      ...(captureIds.length > 0 ? { captureIds } : {}),
      ...(holeMs > 0 ? { holeMs, holeConfirmed } : {}),
    };
  });
}
