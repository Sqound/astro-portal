/**
 * The summary of one night: planned, acquired and lost time, the lost time
 * broken down by cause, and the result per target — durations and causes
 * only, never a score or an overall mark.
 *
 * Pure and JSON-in/JSON-out: the server computes it for GET /v1/sessions/{id}
 * (`api/session-debrief.js`), and the public fixture `debrief-summary.json` pins the results.
 *
 * Input (every field optional except `planItems` and `events`):
 *
 * - `nightStartAt` — the instant the items' `startMinute`/`endMinute` are
 *   counted from; without it, a slot cannot be placed on the clock.
 * - `window` — `{ start, end }`, the session's own start and finish; the
 *   planned time is the part of each slot inside it.
 * - `planItems` — `[{ id, targetId?, startMinute?, endMinute?, durationMinutes? }]`.
 * - `events` — the journal, as GET /v1/sessions/{id}/events returns it
 *   (`{ eventId, type, recordedAt, timing?, payload }`).
 * - `adjustments` — debrief.schema.json's `record.targets` (keyed by plan
 *   item id), or null when the night was not debriefed.
 * - `outcome` — the debriefing's outcome, when there is one.
 * - `guidingLosses` — `[{ start, end }]`, the guide star lost then found
 *   again, from an analysis of the guiding logs; null when the service has
 *   none to show (no analysis, or no `analysis.logs`), and then the summary
 *   says so (`guidingIncluded: false`) and has no guiding line.
 *
 * Rules, in minutes (every instant cut to its minute first: the hour a
 * screen writes and the minutes it counts are on the same grid,
 * `session-figures.js`):
 *
 * - planned = a plan item's slot inside the session's window;
 * - a target's observed span = its passages (`session-passages.js`: each
 *   `target_started` opens one, which ends at the target's own finish or
 *   skip, at the next start of another target, or at the window's end;
 *   field events win over the debriefing's `planned`/`reconstructed` ones),
 *   or its slot when the debriefing says it was observed and the journal has
 *   no start for it;
 * - acquired = the declared `acquiredMinutes` when given, else the observed
 *   span minus the pauses and the guiding losses inside it; never more than
 *   planned, or than the observed span when the field ran it longer;
 * - lost = planned − acquired (never negative) — always 0 on a visual night
 *   (`kind: "visual"`), whose plan is an ideal — allocated in this order:
 *   the part of the slot a given-up target never reached (`abandon`, its
 *   skip reason — `weather` becomes clouds unless the latest condition before
 *   it names wind or dew), the pauses with a cause (`pause`), the guiding
 *   losses (`rejected`, cause `guiding`), the pauses without one (`pause`,
 *   `unexplained`), and the rest, `unexplained`, with no span.
 */

import { sessionPassages } from "./session-passages.js";
import { sessionMinuteOf } from "./session-figures.js";
import { isDeviceEventType } from "./session-events/device-event-types.js";

const MINUTE_MS = 60000;

/** The causes a lost minute can be counted under, in their display order. */
export const DEBRIEF_LOSS_CAUSES = Object.freeze([
  "clouds",
  "wind",
  "dew",
  "guiding",
  "meridian_flip",
  "equipment",
  "fatigue",
  "time",
  "visibility",
  "other",
  "unexplained",
]);

const PAUSE_CAUSES = new Set([
  "clouds",
  "wind",
  "dew",
  "guiding",
  "meridian_flip",
  "equipment",
  "fatigue",
  "other",
]);
const SKY_CAUSES = new Set(["clouds", "wind", "dew"]);
const SKIP_CAUSE = {
  equipment: "equipment",
  time: "time",
  visibility: "visibility",
  other: "other",
};

function minuteOf(value) {
  if (typeof value !== "string") return null;
  // The one grid of a session -- an instant is cut to its minute.
  return sessionMinuteOf(value);
}

function isoOf(minute) {
  return new Date(minute * MINUTE_MS).toISOString();
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `[start, end]` of an item's slot, in minutes from the night's start. */
function slotOf(item) {
  const start = finiteNumber(item?.startMinute);
  if (start === null || start < 0) return null;
  const endMinute = finiteNumber(item?.endMinute);
  if (endMinute !== null && endMinute >= start) return [start, endMinute];
  const duration = finiteNumber(item?.durationMinutes);
  if (duration !== null && duration > 0) return [start, start + duration];
  return [start, start];
}

// --- intervals: sorted, merged lists of [start, end) in whole minutes ---

function normalized(intervals) {
  const sorted = intervals
    .filter(([start, end]) => end > start)
    .map(([start, end]) => [start, end])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const merged = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1])
      last[1] = Math.max(last[1], interval[1]);
    else merged.push(interval);
  }
  return merged;
}

function lengthOf(intervals) {
  return intervals.reduce((sum, [start, end]) => sum + (end - start), 0);
}

function intersect(left, right) {
  const result = [];
  for (const [a0, a1] of left)
    for (const [b0, b1] of right) {
      const start = Math.max(a0, b0);
      const end = Math.min(a1, b1);
      if (end > start) result.push([start, end]);
    }
  return normalized(result);
}

function subtract(from, removed) {
  let result = normalized(from);
  for (const [r0, r1] of normalized(removed)) {
    const next = [];
    for (const [start, end] of result) {
      if (r1 <= start || r0 >= end) next.push([start, end]);
      else {
        if (r0 > start) next.push([start, r0]);
        if (r1 < end) next.push([r1, end]);
      }
    }
    result = next;
  }
  return result;
}

// --- the journal ---

function compareEvents(left, right) {
  return (
    left.minute - right.minute ||
    (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
  );
}

function journalOf(events) {
  return (
    (Array.isArray(events) ? events : [])
      .map((event) => ({
        eventId: String(event?.eventId ?? ""),
        type: event?.type,
        timing: event?.timing ?? null,
        payload:
          event?.payload && typeof event.payload === "object"
            ? event.payload
            : {},
        minute: minuteOf(event?.recordedAt),
        recordedAt: event?.recordedAt,
      }))
      // A device's event (a GoTo, a STOP, a link lost) is no time of the night:
      // it moves no window and ends no passage. Neither is a change of the plan
      // (`plan_edited`).
      .filter(
        (event) =>
          event.minute !== null &&
          !isDeviceEventType(event.type) &&
          event.type !== "plan_edited" &&
          // GUIDED-EVENING-04: neither is a guided evening's summary.
          event.type !== "guided_evening",
      )
      .sort(compareEvents)
  );
}

/**
 * The cause a pause carries: the latest correction note naming it
 * (`pauseCause.pauseEventId`), by recordedAt then eventId, else its own
 * `cause`, else null.
 */
export function effectivePauseCause(pause, events) {
  let corrected = null;
  for (const event of journalOf(events)) {
    const correction = event.payload.pauseCause;
    if (
      event.type === "note" &&
      correction &&
      correction.pauseEventId === pause?.eventId &&
      PAUSE_CAUSES.has(correction.cause)
    )
      corrected = correction.cause;
  }
  if (corrected) return corrected;
  const own = pause?.payload?.cause;
  return PAUSE_CAUSES.has(own) ? own : null;
}

function pausesOf(journal, windowEnd) {
  const corrections = new Map();
  // The person's precision about a pause rides
  // on its correction note (`text`); the latest one naming the pause wins.
  const notes = new Map();
  for (const event of journal) {
    const correction = event.payload.pauseCause;
    if (
      event.type === "note" &&
      correction &&
      typeof correction.pauseEventId === "string" &&
      PAUSE_CAUSES.has(correction.cause)
    ) {
      corrections.set(correction.pauseEventId, correction.cause);
      const text =
        typeof event.payload.text === "string" ? event.payload.text.trim() : "";
      if (text) notes.set(correction.pauseEventId, text);
    }
  }
  const pauses = [];
  let open = null;
  for (const event of journal) {
    if (event.type === "pause" && !open) open = event;
    else if (event.type === "resume" && open) {
      pauses.push({ pause: open, start: open.minute, end: event.minute });
      open = null;
    }
  }
  if (open && windowEnd !== null)
    pauses.push({ pause: open, start: open.minute, end: windowEnd });
  return pauses
    .filter((entry) => entry.end > entry.start)
    .map((entry) => {
      const own = entry.pause.payload.cause;
      const pause = {
        start: entry.start,
        end: entry.end,
        cause:
          corrections.get(entry.pause.eventId) ??
          (PAUSE_CAUSES.has(own) ? own : null),
      };
      const note = notes.get(entry.pause.eventId);
      if (note) pause.note = note;
      return pause;
    });
}

function eventTargetKeys(event) {
  return {
    planItemId:
      typeof event.payload.planItemId === "string"
        ? event.payload.planItemId
        : null,
    name:
      (typeof event.payload.targetId === "string" && event.payload.targetId) ||
      (typeof event.payload.targetLabel === "string" &&
        event.payload.targetLabel) ||
      null,
  };
}

const TARGET_EVENT_TYPES = new Set([
  "target_started",
  "target_finished",
  "target_skipped",
]);

/**
 * The spans a target was observed for: its own passages (`session-passages.js`),
 * the ones its own `target_started` events opened, in whole minutes.
 */
function observedSpans(targetEvents, passages) {
  const ownIds = new Set(targetEvents.map((event) => event.eventId));
  return normalized(
    passages
      .filter(
        (passage) => passage.end !== null && ownIds.has(passage.startEventId),
      )
      .map((passage) => [minuteOf(passage.start), minuteOf(passage.end)]),
  );
}

/**
 * The passages of one target (`listed`, see below), with `holeMinutes`: the
 * minutes its passages spent while the application did not run (`holeMs`,
 * pauses deducted) and no `auto_time_confirmed` has confirmed since
 * (`holeConfirmed`), counted as automatic time not confirmed yet. A passage
 * whose whole time is already unconfirmed (the clock's) counts once.
 */
function passagesAndHolesOfTarget(targetEvents, passages, windowSpan, pauses) {
  const ownIds = new Set(targetEvents.map((event) => event.eventId));
  const pauseIntervals = normalized(pauses.map((p) => [p.start, p.end]));
  let holeMinutes = 0;
  for (const passage of passages) {
    if (passage.end === null || !ownIds.has(passage.startEventId)) continue;
    if (!(passage.holeMs > 0) || passage.holeConfirmed) continue;
    if (passage.auto && !passage.autoConfirmed) continue;
    const clipped = intersect(
      [[minuteOf(passage.start), minuteOf(passage.end)]],
      windowSpan,
    );
    if (!clipped.length) continue;
    holeMinutes += Math.min(
      lengthOf(subtract(clipped, pauseIntervals)),
      Math.round(passage.holeMs / 60000),
    );
  }
  return {
    listed: listedPassagesOfTarget(targetEvents, passages, windowSpan, pauses),
    holeMinutes,
  };
}

/**
 * The passages of one target, for `perTarget[].passages`: each passage of the
 * target's own `target_started` events, clipped to the window, in whole
 * minutes, with the pauses inside it; a passage that is nothing once clipped
 * is not listed (as observed spans have never been).
 */
function listedPassagesOfTarget(targetEvents, passages, windowSpan, pauses) {
  const ownIds = new Set(targetEvents.map((event) => event.eventId));
  const pauseIntervals = normalized(pauses.map((p) => [p.start, p.end]));
  const listed = [];
  for (const passage of passages) {
    if (passage.end === null || !ownIds.has(passage.startEventId)) continue;
    const clipped = intersect(
      [[minuteOf(passage.start), minuteOf(passage.end)]],
      windowSpan,
    );
    if (!clipped.length) continue;
    const [start, end] = clipped[0];
    const minutes = lengthOf(subtract(clipped, pauseIntervals));
    listed.push({
      start: isoOf(start),
      end: isoOf(end),
      minutes,
      auto: passage.auto,
      confirmed: !passage.auto || passage.autoConfirmed,
      pauses: pauses
        .flatMap((pause) =>
          intersect([[start, end]], [[pause.start, pause.end]]).map(
            ([from, to]) => ({
              start: isoOf(from),
              end: isoOf(to),
              cause: pause.cause,
            }),
          ),
        )
        .sort((left, right) => compareText(left.start, right.start)),
    });
  }
  return listed;
}

/** `[{ planItemId, targetId, start, end }]` — the launched plan's slots on the clock, inside the window. */
function launchedSlotsOf(launchedSchedule, nightStartMs, windowSpan) {
  if (!Array.isArray(launchedSchedule) || !Number.isFinite(nightStartMs))
    return [];
  const slots = [];
  for (const entry of launchedSchedule) {
    const startMinute = finiteNumber(entry?.startMinute);
    const endMinute = finiteNumber(entry?.endMinute);
    if (
      typeof entry?.planItemId !== "string" ||
      startMinute === null ||
      endMinute === null
    )
      continue;
    const clipped = intersect(
      [
        [
          Math.floor((nightStartMs + startMinute * MINUTE_MS) / MINUTE_MS),
          Math.floor((nightStartMs + endMinute * MINUTE_MS) / MINUTE_MS),
        ],
      ],
      windowSpan,
    );
    if (!clipped.length) continue;
    slots.push({
      planItemId: entry.planItemId,
      targetId:
        (typeof entry.targetId === "string" && entry.targetId) ||
        entry.planItemId,
      start: isoOf(clipped[0][0]),
      end: isoOf(clipped[0][1]),
    });
  }
  return slots;
}

function skyCauseBefore(journal, minute) {
  let cause = null;
  for (const event of journal) {
    if (event.minute > minute) break;
    if (event.type === "condition" && SKY_CAUSES.has(event.payload.cause))
      cause = event.payload.cause;
  }
  return cause ?? "clouds";
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Spans by start, then target, end and kind: a total order, on both sides. */
function compareSpans(left, right) {
  return (
    compareText(left.start, right.start) ||
    compareText(left.targetId, right.targetId) ||
    compareText(left.end, right.end) ||
    compareText(left.kind, right.kind)
  );
}

/**
 * debriefSummary(input) -> {
 *   plannedMinutes, acquiredMinutes, lostMinutes, guidingIncluded,
 *   lostByCause: [{ cause, minutes, spans: [{ start, end, targetId, kind }] }],
 *   perTarget: [{ targetId, planItemId, outcome, plannedMinutes,
 *                 acquiredMinutes, slot?, skipReason?, passages,
 *                 autoUnconfirmedMinutes }],
 *   autoUnconfirmedMinutes, launchedSlots?: [{ planItemId, targetId, start, end }]
 * }
 *
 * `slot` ({ start, end }, ISO) is the planned slot inside the session's
 * window — the stretch `plannedMinutes` counts — so a reader can draw the
 * night as a strip without the plan; absent for a target added in the field
 * and when the night's start is unknown.
 */
export function debriefSummary({
  nightStartAt = null,
  window = null,
  planItems = [],
  events = [],
  adjustments = null,
  outcome = null,
  guidingLosses = null,
  launchedSchedule = null,
  kind = null,
} = {}) {
  const visual = kind === "visual";
  const journal = journalOf(events);
  const nightStartMs =
    typeof nightStartAt === "string" ? Date.parse(nightStartAt) : NaN;
  const windowStart = minuteOf(window?.start);
  const windowEnd = minuteOf(window?.end);
  const lastEventMinute = journal.length
    ? journal[journal.length - 1].minute
    : null;
  const openEnd = windowEnd ?? lastEventMinute;
  const windowSpan =
    windowStart !== null && windowEnd !== null
      ? [[windowStart, windowEnd]]
      : [[-Infinity, Infinity]];

  const passages = sessionPassages({
    events,
    windowEnd: openEnd === null ? null : isoOf(openEnd),
  });
  const pauses = pausesOf(journal, openEnd);
  const pauseIntervals = normalized(pauses.map((p) => [p.start, p.end]));
  const guidingIncluded = Array.isArray(guidingLosses);
  const guiding = normalized(
    (guidingIncluded ? guidingLosses : [])
      .map((loss) => [minuteOf(loss?.start), minuteOf(loss?.end)])
      .filter(([start, end]) => start !== null && end !== null),
  );
  const adjustmentById = new Map(
    (Array.isArray(adjustments) ? adjustments : [])
      .filter((entry) => entry && typeof entry.targetId === "string")
      .map((entry) => [entry.targetId, entry]),
  );

  // The plan's items in slot order, then the targets the field added.
  const items = (Array.isArray(planItems) ? planItems : [])
    .filter((item) => item && typeof item.id === "string")
    .map((item, index) => ({ item, index, slot: slotOf(item) }))
    .sort((left, right) => {
      if (left.slot === null && right.slot === null)
        return left.index - right.index;
      if (left.slot === null) return 1;
      if (right.slot === null) return -1;
      return (
        left.slot[0] - right.slot[0] ||
        left.slot[1] - right.slot[1] ||
        left.index - right.index
      );
    });

  const claimed = new Set();
  const targets = items.map(({ item, slot }) => {
    const name =
      (typeof item.targetId === "string" && item.targetId) || item.id;
    const own = journal.filter((event) => {
      if (!TARGET_EVENT_TYPES.has(event.type)) return false;
      const keys = eventTargetKeys(event);
      return keys.planItemId
        ? keys.planItemId === item.id
        : keys.name === name || keys.name === item.id;
    });
    for (const event of own) claimed.add(event.eventId);
    let slotSpan = [];
    let plannedMinutes = 0;
    if (slot) {
      if (Number.isFinite(nightStartMs)) {
        const start = Math.floor(
          (nightStartMs + slot[0] * MINUTE_MS) / MINUTE_MS,
        );
        const end = Math.floor(
          (nightStartMs + slot[1] * MINUTE_MS) / MINUTE_MS,
        );
        slotSpan = intersect([[start, end]], windowSpan);
        plannedMinutes = lengthOf(slotSpan);
      } else plannedMinutes = Math.round(slot[1] - slot[0]);
    }
    return {
      targetId: name,
      planItemId: item.id,
      own,
      slotSpan,
      plannedMinutes,
      adjustment: adjustmentById.get(item.id) ?? null,
    };
  });

  // Targets the field added: started, finished or skipped, but in no slot.
  const added = new Map();
  for (const event of journal) {
    if (!TARGET_EVENT_TYPES.has(event.type) || claimed.has(event.eventId))
      continue;
    const { name } = eventTargetKeys(event);
    if (!name) continue;
    if (!added.has(name))
      added.set(name, {
        targetId: name,
        planItemId: null,
        own: [],
        slotSpan: [],
        plannedMinutes: 0,
        adjustment: null,
      });
    added.get(name).own.push(event);
  }
  targets.push(...added.values());

  const spansByCause = new Map();
  const minutesByCause = new Map();
  const allocate = (cause, minutes, span) => {
    if (minutes <= 0) return;
    minutesByCause.set(cause, (minutesByCause.get(cause) ?? 0) + minutes);
    if (span) {
      if (!spansByCause.has(cause)) spansByCause.set(cause, []);
      spansByCause.get(cause).push(span);
    }
  };

  const perTarget = [];
  for (const target of targets) {
    const state = target.adjustment?.state ?? null;
    const declaredObserved =
      state === "done" || state === "modified" || state === "partial";
    const skipEvents = target.own.filter(
      (event) => event.type === "target_skipped",
    );
    const lastSkip = skipEvents[skipEvents.length - 1] ?? null;

    let observed = intersect(observedSpans(target.own, passages), windowSpan);
    if (!observed.length && declaredObserved) observed = target.slotSpan;
    const observedMinutes = lengthOf(observed);
    const pausedInside = intersect(observed, pauseIntervals);
    const guidingInside = subtract(
      intersect(observed, guiding),
      pauseIntervals,
    );
    const computed = Math.max(
      0,
      observedMinutes - lengthOf(pausedInside) - lengthOf(guidingInside),
    );
    const declared =
      declaredObserved &&
      Number.isSafeInteger(target.adjustment.acquiredMinutes) &&
      target.adjustment.acquiredMinutes >= 0
        ? target.adjustment.acquiredMinutes
        : null;
    // A visual night's plan is an ideal: what the person declares is theirs.
    const cap =
      visual && declared !== null
        ? Infinity
        : Math.max(target.plannedMinutes, observedMinutes);
    const acquiredMinutes =
      state === "skipped" ? 0 : Math.min(declared ?? computed, cap);
    const { listed: targetPassages, holeMinutes } = passagesAndHolesOfTarget(
      target.own,
      passages,
      windowSpan,
      pauses,
    );
    const autoUnconfirmedMinutes =
      targetPassages
        .filter((passage) => !passage.confirmed)
        .reduce((sum, passage) => sum + passage.minutes, 0) + holeMinutes;

    let targetOutcome;
    if (state === "done" || state === "modified") targetOutcome = "done";
    else if (state === "partial") targetOutcome = "partial";
    else if (state === "skipped") targetOutcome = "abandoned";
    else if (acquiredMinutes === 0) targetOutcome = "abandoned";
    else if (outcome === "executed") targetOutcome = "done";
    else if (lastSkip) targetOutcome = "partial";
    else
      targetOutcome =
        acquiredMinutes >= target.plannedMinutes ? "done" : "partial";

    const reason =
      (state === "skipped" ? target.adjustment.reason : null) ??
      lastSkip?.payload.reason ??
      null;
    const skipReason = targetOutcome === "abandoned" ? reason : null;

    const entry = {
      targetId: target.targetId,
      planItemId: target.planItemId,
      outcome: targetOutcome,
      plannedMinutes: target.plannedMinutes,
      acquiredMinutes,
      passages: targetPassages,
      autoUnconfirmedMinutes,
    };
    if (target.slotSpan.length)
      entry.slot = {
        start: isoOf(target.slotSpan[0][0]),
        end: isoOf(target.slotSpan[target.slotSpan.length - 1][1]),
      };
    if (skipReason) entry.skipReason = skipReason;
    perTarget.push(entry);

    // --- the lost minutes of this target, by cause ---
    // A visual night loses nothing: its plan is an ideal, and what was not
    // looked at is no loss (the night summary of a visual night).
    let remaining = visual
      ? 0
      : Math.max(0, target.plannedMinutes - acquiredMinutes);
    const take = (cause, interval, kind, note = null) => {
      if (remaining <= 0) return;
      const minutes = Math.min(remaining, interval[1] - interval[0]);
      if (minutes <= 0) return;
      remaining -= minutes;
      const span = {
        start: isoOf(interval[0]),
        end: isoOf(interval[0] + minutes),
        targetId: target.targetId,
        kind,
      };
      if (note) span.note = note;
      allocate(cause, minutes, span);
    };

    if (targetOutcome === "abandoned" || skipEvents.length) {
      const unreached = subtract(target.slotSpan, observed);
      for (const interval of unreached) {
        let cause = "unexplained";
        if (reason === "weather")
          cause = skyCauseBefore(journal, lastSkip?.minute ?? interval[0]);
        else if (reason && SKIP_CAUSE[reason]) cause = SKIP_CAUSE[reason];
        take(cause, interval, "abandon");
      }
    }
    for (const pause of pauses)
      if (pause.cause)
        for (const interval of intersect(observed, [[pause.start, pause.end]]))
          take(pause.cause, interval, "pause", pause.note);
    for (const interval of guidingInside) take("guiding", interval, "rejected");
    for (const pause of pauses)
      if (!pause.cause)
        for (const interval of intersect(observed, [[pause.start, pause.end]]))
          take("unexplained", interval, "pause", pause.note);
    if (remaining > 0) allocate("unexplained", remaining, null);
  }

  const order = (cause) => DEBRIEF_LOSS_CAUSES.indexOf(cause);
  const lostByCause = [...minutesByCause.entries()]
    .map(([cause, minutes]) => ({
      cause,
      minutes,
      spans: (spansByCause.get(cause) ?? []).sort(compareSpans),
    }))
    .sort((left, right) => {
      if (left.cause === "unexplained") return 1;
      if (right.cause === "unexplained") return -1;
      return (
        right.minutes - left.minutes || order(left.cause) - order(right.cause)
      );
    });

  const plannedMinutes = targets.reduce(
    (sum, target) => sum + target.plannedMinutes,
    0,
  );
  const acquiredMinutes = perTarget.reduce(
    (sum, target) => sum + target.acquiredMinutes,
    0,
  );
  const lostMinutes = lostByCause.reduce(
    (sum, entry) => sum + entry.minutes,
    0,
  );
  const summary = {
    plannedMinutes,
    acquiredMinutes,
    lostMinutes,
    guidingIncluded,
    lostByCause,
    perTarget,
    autoUnconfirmedMinutes: perTarget.reduce(
      (sum, target) => sum + target.autoUnconfirmedMinutes,
      0,
    ),
  };
  const launchedSlots = launchedSlotsOf(
    launchedSchedule,
    nightStartMs,
    windowSpan,
  );
  if (launchedSlots.length) summary.launchedSlots = launchedSlots;
  summary.segments = debriefStripSegments(summary);
  return summary;
}

function stripSubtractIntervals(from, removed) {
  let result = from.map(([start, end]) => [start, end]);
  for (const [r0, r1] of removed) {
    const next = [];
    for (const [start, end] of result) {
      if (r1 <= start || r0 >= end) next.push([start, end]);
      else {
        if (r0 > start) next.push([start, r0]);
        if (r1 < end) next.push([r1, end]);
      }
    }
    result = next;
  }
  return result;
}

/**
 * The strip of `summary` (read from the passages). Two rows:
 *
 * - « Prévu » — one box per planned slot: the plan as it was launched
 *   (`launchedSlots`) when the summary has it, else each target's slot;
 * - « Réalisé » — what really happened, one stretch per passage of each
 *   target (a target observed twice is drawn twice), the stretches spent
 *   paused hatched (`pause`), the frames lost to guiding and the part of a
 *   given-up target never reached in red; time the clock counted and nobody
 *  confirmed yet is `auto: true`, drawn hatched in the night summary. A
 *   target with no passage (declared observed without a journal) is drawn as
 *   it was before passages existed, inside its slot. The acquired stretches
 *   are shortened from the end when the person declared less time than the
 *   journal shows, so the strip never claims more than the figures say.
 *
 * A target keeps its place in « Réalisé » whether or not it has a box: one
 * observed off the plan has none. Times are epoch minutes. `null` when there
 * is nothing to draw.
 */
export function debriefStripSegments(summary) {
  const spans = [];
  for (const entry of summary?.lostByCause ?? [])
    for (const span of entry.spans ?? []) {
      const start = minuteOf(span.start);
      const end = minuteOf(span.end);
      if (start === null || end === null) continue;
      spans.push({
        cause: entry.cause,
        kind: span.kind,
        start,
        end,
        target: span.targetId,
      });
    }

  const launched = new Map();
  for (const slot of summary?.launchedSlots ?? [])
    launched.set(slot.planItemId, slot);

  const targets = [];
  const seen = new Set();
  const draw = (entry, box, slot) => {
    const passages = (entry.passages ?? [])
      .map((passage) => ({
        start: minuteOf(passage.start),
        end: minuteOf(passage.end),
        auto: passage.confirmed === false,
        pauses: (passage.pauses ?? []).map((pause) => ({
          start: minuteOf(pause.start),
          end: minuteOf(pause.end),
          cause: pause.cause || "unexplained",
        })),
      }))
      .filter((passage) => passage.start !== null && passage.end !== null);

    const lost = [];
    const taken = [];
    const keep = (span, kind, cause, bounds) => {
      const start = bounds ? Math.max(span.start, bounds[0]) : span.start;
      const end = bounds ? Math.min(span.end, bounds[1]) : span.end;
      if (end <= start) return;
      taken.push([start, end]);
      lost.push({ start, end, kind, cause });
    };
    const ownSpans = spans.filter((span) => span.target === entry.targetId);
    const slotBounds = slot ? [slot[0], slot[1]] : null;

    let acquired = [];
    if (passages.length) {
      for (const passage of passages)
        for (const pause of passage.pauses) {
          taken.push([pause.start, pause.end]);
          lost.push({
            start: pause.start,
            end: pause.end,
            kind: "pause",
            cause: pause.cause,
          });
        }
      for (const span of ownSpans)
        if (span.kind !== "pause")
          keep(
            span,
            span.kind === "rejected" ? "rejected" : "abandoned",
            span.cause,
            span.kind === "rejected" ? null : slotBounds,
          );
      for (const passage of passages)
        for (const [from, to] of stripSubtractIntervals(
          [[passage.start, passage.end]],
          [...taken].sort((a, b) => a[0] - b[0]),
        ))
          acquired.push({ start: from, end: to, auto: passage.auto });
    } else if (slot) {
      for (const span of ownSpans)
        keep(
          span,
          span.kind === "pause"
            ? "pause"
            : span.kind === "rejected"
              ? "rejected"
              : "abandoned",
          span.cause,
          slotBounds,
        );
      acquired = stripSubtractIntervals(
        [[slot[0], slot[1]]],
        [...taken].sort((a, b) => a[0] - b[0]),
      ).map(([start, end]) => ({ start, end, auto: false }));
    }
    acquired.sort((a, b) => a.start - b.start);
    // …unless the figures say less: shorten from the end.
    let excess =
      acquired.reduce((sum, { start, end }) => sum + end - start, 0) -
      (Number.isFinite(entry.acquiredMinutes) ? entry.acquiredMinutes : 0);
    for (
      let index = acquired.length - 1;
      index >= 0 && excess > 0;
      index -= 1
    ) {
      const length = acquired[index].end - acquired[index].start;
      if (length <= excess) {
        excess -= length;
        acquired.splice(index, 1);
      } else {
        acquired[index].end -= excess;
        excess = 0;
      }
    }

    const segments = [
      ...acquired.map(({ start, end, auto }) => ({
        start,
        end,
        kind: "acquired",
        ...(auto ? { auto: true } : {}),
      })),
      ...lost,
    ].sort((a, b) => a.start - b.start);
    if (!box && !segments.length) return;
    targets.push({
      targetId: entry.targetId,
      start: box ? box[0] : null,
      end: box ? box[1] : null,
      outcome: entry.outcome ?? "done",
      segments,
      passages: passages.map(({ start, end, auto }) => ({ start, end, auto })),
    });
  };

  for (const entry of summary?.perTarget ?? []) {
    const slotFrom = entry.slot ? minuteOf(entry.slot.start) : null;
    const slotTo = entry.slot ? minuteOf(entry.slot.end) : null;
    const slot =
      slotFrom !== null && slotTo !== null ? [slotFrom, slotTo] : null;
    let box = slot;
    if (launched.size) {
      const own = entry.planItemId ? launched.get(entry.planItemId) : null;
      if (entry.planItemId) seen.add(entry.planItemId);
      const from = own ? minuteOf(own.start) : null;
      const to = own ? minuteOf(own.end) : null;
      box = from !== null && to !== null ? [from, to] : null;
    }
    draw(entry, box, slot);
  }
  // Slots of the launched plan no target of the summary claims: still planned.
  for (const [planItemId, slot] of launched) {
    if (seen.has(planItemId)) continue;
    const from = minuteOf(slot.start);
    const to = minuteOf(slot.end);
    if (from === null || to === null) continue;
    targets.push({
      targetId: slot.targetId,
      start: from,
      end: to,
      outcome: "abandoned",
      segments: [],
      passages: [],
    });
  }
  if (!targets.length) return null;
  const edges = targets.flatMap((target) => [
    ...(target.start === null ? [] : [target.start, target.end]),
    ...target.segments.flatMap((segment) => [segment.start, segment.end]),
  ]);
  return {
    start: Math.min(...edges),
    end: Math.max(...edges),
    hasAuto: targets.some((target) =>
      target.segments.some((segment) => segment.auto),
    ),
    targets,
  };
}
