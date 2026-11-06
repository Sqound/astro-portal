// « Remanier la session » on the web, worked out without React: the draft the
// person edits (the order of the targets, the figures of one, a target taken
// out, an event added, a report moved), what the page shows of it before it is
// saved, and the body of `PUT /v1/sessions/{id}/rework` it makes
// (`session-rework.schema.json`). Nothing is written until « Enregistrer les
// changements »; the event log itself is never edited (the rework is a
// correction layer the service reads through). Hours are those of the place
// (its zone, UTC for a place without one, which the page then says): a row
// holds « HH:MM » and the day of the session in that zone; the body sent holds
// instants.

import { instantOfClock } from "./debrief-moment.js";
import { DETECTED_REPORT_KINDS } from "./session-page-model.js";

const isDetectedKind = (kind) => DETECTED_REPORT_KINDS.includes(kind);

/** A draft that changes nothing, from the cards the page shows. */
export function emptyDraft(cards) {
  return {
    targets: cards.map((card) => ({
      key: card.key,
      planItemId: card.planItemId,
      label: card.label,
      origin: card.state === "added" ? "added" : "planned",
      removed: card.state === "removed",
      reason: card.reason ?? null,
      start: "",
      end: "",
      frames: "",
      filter: "",
    })),
    added: [],
    moves: {},
    removals: [],
    // Reports already recorded that the person rewrote (« Modifier »), by the
    // id of the event: the new form, and the payload of the original, whose
    // other fields the replacement keeps.
    replacements: {},
  };
}

/**
 * Whether the night recorded something of a target (a passage, frames, time,
 * a measure): such a target taken out in a rework stays in the session as
 * « retirée » (the service keeps it `removed`); one that the rework added and
 * the night never saw leaves no trace and disappears.
 */
export function seenByNight(card) {
  if (!card) return false;
  const known = (value) => typeof value === "number" && Number.isFinite(value);
  return (
    (card.passages?.length ?? 0) > 0 ||
    known(card.acquiredSeconds) ||
    known(card.frameCount) ||
    card.measured === true
  );
}

/** Whether the draft holds a change worth saving. */
export function draftChanged(draft, cards) {
  if (!draft) return false;
  if (draft.added.length || draft.removals.length) return true;
  if (Object.keys(draft.moves).length) return true;
  if (Object.keys(draft.replacements ?? {}).length) return true;
  const original = cards.map((card) => card.key);
  if (
    draft.targets.map((target) => target.key).join("\u0000") !==
    original.join("\u0000")
  )
    return true;
  return draft.targets.some((target) => {
    const card = cards.find((entry) => entry.key === target.key);
    return (
      !card ||
      target.removed !== (card.state === "removed") ||
      target.start ||
      target.end ||
      target.frames !== "" ||
      target.filter
    );
  });
}

let counter = 0;
/** A client identifier for an event added in the draft (never sent). */
export const draftEventId = () => `draft-${(counter += 1)}`;

/** Moves the target `key` before `beforeKey` (the end of the list when null). */
export function moveTarget(draft, key, beforeKey) {
  if (key === beforeKey) return draft;
  const list = draft.targets.filter((target) => target.key !== key);
  const moved = draft.targets.find((target) => target.key === key);
  if (!moved) return draft;
  const at = beforeKey
    ? list.findIndex((target) => target.key === beforeKey)
    : list.length;
  list.splice(at < 0 ? list.length : at, 0, moved);
  return { ...draft, targets: list };
}

/**
 * One step up (-1) or down (1) among the targets still held: the keyboard's
 * way to drag. A target taken out is stepped over (it is not in the frise nor
 * in the order the person reads).
 */
export function stepTarget(draft, key, step) {
  const at = draft.targets.findIndex((target) => target.key === key);
  if (at < 0) return draft;
  let to = at + step;
  while (draft.targets[to]?.removed) to += step;
  if (to < 0 || to >= draft.targets.length) return draft;
  const list = [...draft.targets];
  const [moved] = list.splice(at, 1);
  list.splice(to, 0, moved);
  return { ...draft, targets: list };
}

/**
 * Dropping the target `key` on the target `overKey`: before it, or after it
 * (the drop's side). The frise's way to drag; the reports are placed by
 * target, so they follow.
 */
export function dropTarget(draft, key, overKey, after = false) {
  if (key === overKey) return draft;
  const list = draft.targets.filter((target) => target.key !== key);
  const moved = draft.targets.find((target) => target.key === key);
  const over = list.findIndex((target) => target.key === overKey);
  if (!moved || over < 0) return draft;
  list.splice(after ? over + 1 : over, 0, moved);
  return { ...draft, targets: list };
}

/** The keys of the targets held, in the order of the draft: « 2 sur 4 ». */
export function heldOrder(draft) {
  return draft.targets
    .filter((target) => !target.removed)
    .map((target) => target.key);
}

/**
 * The reports of the night as the page shows them with the draft applied:
 * moved to another target (or the whole night), removed, or added (an event
 * the person adds is « reconstruit »). The debriefing uses it too: its draft
 * has no removal.
 */
export function reportsWithDraft(reports, draft) {
  const removed = new Set(draft.removals ?? []);
  const replacements = draft.replacements ?? {};
  const base = reports
    .filter((report) => !report.ids.some((id) => removed.has(id)))
    .map((report) => {
      const rewritten = replacements[report.id];
      if (rewritten)
        return {
          ...report,
          kind: rewritten.kind ?? report.kind,
          at: rewritten.at,
          until: rewritten.until ?? null,
          targetKey: rewritten.targetKey ?? null,
          text: rewritten.text ?? null,
          sky: rewritten.sky ?? null,
          cause: rewritten.cause ?? null,
          reconstructed: true,
          added: true,
          replaced: true,
        };
      return Object.hasOwn(draft.moves, report.id)
        ? { ...report, targetKey: draft.moves[report.id] }
        : report;
    });
  const added = draft.added.map((event) => ({
    id: event.id,
    ids: [event.id],
    kind: event.kind,
    at: event.at,
    until: event.until ?? null,
    targetKey: Object.hasOwn(draft.moves, event.id)
      ? draft.moves[event.id]
      : event.targetKey,
    text: event.text ?? null,
    sky: event.sky ?? null,
    cause: event.cause ?? null,
    reconstructed: true,
    added: true,
    draft: true,
  }));
  return [...base, ...added].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

/**
 * The cards and the reports as the page shows them with the draft applied:
 * the order, the targets taken out or added, the figures given, the reports
 * moved, removed or added.
 */
export function applyDraft({
  cards,
  reports,
  draft,
  sessionStart,
  timeZone = "UTC",
}) {
  const allReports = reportsWithDraft(reports, draft);
  const known = new Map(cards.map((card) => [card.key, card]));
  const shown = [];
  for (const target of draft.targets) {
    const card = known.get(target.key);
    const keys = new Set([target.key, target.planItemId].filter(Boolean));
    const own = allReports.filter(
      (report) => report.targetKey && keys.has(report.targetKey),
    );
    if (target.removed && target.origin === "added" && !seenByNight(card))
      continue;
    const start = target.start
      ? instantOfClock(target.start, sessionStart, null, timeZone)
      : null;
    const end = target.end
      ? instantOfClock(target.end, sessionStart, start, timeZone)
      : null;
    const frames = /^\d+$/.test(target.frames) ? Number(target.frames) : null;
    const hours = start !== null && end !== null && end > start;
    const paused = hours
      ? own
          .filter((report) => report.kind === "pause" && report.until)
          .reduce(
            (sum, report) =>
              sum +
              Math.max(
                0,
                Math.min(report.until, end) - Math.max(report.at, start),
              ),
            0,
          )
      : 0;
    shown.push({
      ...(card ?? {
        key: target.key,
        planItemId: null,
        label: target.label,
        outcome: "done",
        plannedSeconds: null,
        slot: null,
        passages: [],
        realStart: null,
        realEnd: null,
        acquiredSeconds: null,
        frameCount: null,
        exposureSeconds: null,
        filter: null,
        measured: false,
        captureId: null,
        hasThumbnail: false,
        capture: null,
      }),
      state: target.removed
        ? "removed"
        : target.origin === "added"
          ? "added"
          : "planned",
      outcome: target.removed ? "skipped" : (card?.outcome ?? "done"),
      reason: target.removed ? target.reason : null,
      ...(hours
        ? {
            realStart: start,
            realEnd: end,
            hoursSet: true,
            acquiredSeconds: Math.max(0, (end - start - paused) / 1000),
          }
        : {}),
      ...(frames !== null ? { frameCount: frames } : {}),
      ...(target.filter ? { filter: target.filter } : {}),
      reports: own,
    });
  }
  const keys = new Set(
    shown.flatMap((c) => [c.key, c.planItemId].filter(Boolean)),
  );
  return {
    cards: shown,
    reports: allReports,
    loose: allReports.filter(
      (report) => !report.targetKey || !keys.has(report.targetKey),
    ),
  };
}

const EVENT_TYPE = {
  note: "note",
  sky: "condition",
  incident: "equipment_issue",
  pause: "pause",
};

/**
 * The body of `PUT /v1/sessions/{id}/rework`: the whole list of the targets in
 * the order given (a planned one taken out is `removed`, never dropped; an
 * added one taken out is sent `removed` too, which erases it for good), the
 * events added, the events moved and the events removed. A figure left empty
 * is `null`: the debriefing's or the journal's number is kept.
 */
export function reworkBody(draft, { sessionStart, timeZone = "UTC" }) {
  const targets = draft.targets.map((target) => {
    const start = target.start
      ? instantOfClock(target.start, sessionStart, null, timeZone)
      : null;
    const end = target.end
      ? instantOfClock(target.end, sessionStart, start, timeZone)
      : null;
    const usable = start !== null && end !== null && end > start;
    return {
      targetId: target.key,
      state: target.removed
        ? "removed"
        : target.origin === "added"
          ? "added"
          : "planned",
      startedAt: usable ? new Date(start).toISOString() : null,
      finishedAt: usable ? new Date(end).toISOString() : null,
      frameCount: /^\d+$/.test(target.frames) ? Number(target.frames) : null,
      filter: target.filter ? target.filter.slice(0, 40) : null,
      reason: target.removed && target.reason ? target.reason : null,
    };
  });
  const body = { targets };
  const addedEvents = addedEventsBody(draft);
  if (addedEvents.length) body.addedEvents = addedEvents;
  const eventMoves = eventMovesBody(draft);
  if (eventMoves.length) body.eventMoves = eventMoves;
  const eventReplacements = eventReplacementsBody(draft);
  if (eventReplacements.length) body.eventReplacements = eventReplacements;
  if (draft.removals.length) body.eventRemovals = [...new Set(draft.removals)];
  return body;
}

/**
 * The events added in a draft, as `addedEvents` of the rework and of the
 * debriefing read them (`session-rework.schema.json`, `addedEvent`): the
 * four gestures of « Nuit en cours », an instant, the target it is placed on
 * (a move chosen after the event was added counts), a pause with its end and
 * its cause.
 */
export function addedEventsBody(draft) {
  return draft.added.map((event) => {
    const targetKey = Object.hasOwn(draft.moves, event.id)
      ? draft.moves[event.id]
      : event.targetKey;
    return {
      type: EVENT_TYPE[event.kind],
      at: new Date(event.at).toISOString(),
      ...(event.kind === "pause"
        ? { until: new Date(event.until).toISOString() }
        : {}),
      ...(targetKey ? { targetId: targetKey } : {}),
      payload:
        event.kind === "note"
          ? { text: event.text }
          : event.kind === "sky"
            ? {
                sky: event.sky,
                ...(event.cause ? { cause: event.cause } : {}),
                ...(event.text ? { notes: event.text.slice(0, 300) } : {}),
              }
            : event.kind === "incident"
              ? { description: event.text }
              : {
                  ...(event.cause ? { cause: event.cause } : {}),
                  ...(event.text ? { reason: event.text.slice(0, 200) } : {}),
                },
    };
  });
}

/**
 * What « Modifier » sends for a report already recorded: `eventReplacements`
 * of the rework and of the debriefing, `{ eventId, event }`, `event` in the
 * form of an `addedEvents[]` entry and of the same type as the original. The
 * original stays in the journal; the service hides it and the replacement
 * reads in its place. The fields of the original the form does not edit (a
 * sky's seeing, an issue's equipment) are kept.
 */
export function eventReplacementsBody(draft) {
  return Object.entries(draft.replacements ?? {}).map(([eventId, form]) => {
    const [event] = addedEventsBody({
      added: [{ ...form, id: eventId }],
      moves: {},
    });
    const original = form.payload ?? {};
    const kept = {
      note: [],
      sky: ["seeing", "transparency"],
      incident: ["equipmentId", "severity"],
      pause: [],
    }[form.kind];
    for (const key of kept)
      if (original[key] !== undefined && event.payload[key] === undefined)
        event.payload[key] = original[key];
    return { eventId, event };
  });
}

/**
 * The genres a report can be edited into (« Modifier »): a pause is replaced
 * by a pause (its resume goes with it); any other report can change genre —
 * an incident that was a note, a note that was a pause. A new event (no
 * `initial`) can be any of the four.
 */
export const editableKinds = (initial) =>
  initial?.kind === "pause" ? ["pause"] : ["note", "sky", "incident", "pause"];

/**
 * What the person calls an incident — the gesture and the
 * two kinds Astro Sync detects in the guiding. Their sheet has « Modifier »;
 * the correction is an incident that keeps its origin.
 */
export const isIncidentKind = (kind) =>
  kind === "incident" || kind === "guidingTimeout" || kind === "guidingSpikes";

/**
 * The form a report is edited in (« Modifier »): what the dialog opens on. A
 * report Astro Sync detected in the guiding is edited as an incident, its
 * sentence (`detected`) being the words to correct.
 */
export const reportForm = (report, detected = null) => ({
  kind: isDetectedKind(report.kind) ? "incident" : report.kind,
  at: report.at,
  until: report.until ?? null,
  targetKey: report.targetKey ?? null,
  text: report.text ?? (isDetectedKind(report.kind) ? detected : null),
  sky: report.sky ?? null,
  cause: report.cause ?? null,
});

/**
 * « Modifier » a report: one added in this draft is rewritten in place; one
 * already recorded gets a replacement (its original stays in the journal).
 */
export function editReport(draft, report, form) {
  if (report.draft)
    return {
      ...draft,
      added: draft.added.map((event) =>
        event.id === report.id ? { ...event, ...form, id: event.id } : event,
      ),
    };
  const moves = { ...draft.moves };
  delete moves[report.id];
  return {
    ...draft,
    moves,
    replacements: {
      ...(draft.replacements ?? {}),
      [report.id]: {
        ...form,
        payload:
          draft.replacements?.[report.id]?.payload ?? report.payload ?? {},
      },
    },
  };
}

/** « Annuler la modification »: the recorded report is read as it was. */
export function revertReport(draft, report) {
  const replacements = { ...(draft.replacements ?? {}) };
  delete replacements[report.id];
  return { ...draft, replacements };
}

/** « Déplacer ce signalement »: a report rewritten carries its place in its replacement. */
export function moveReport(draft, report, targetKey) {
  const rewritten = draft.replacements?.[report.id];
  if (rewritten)
    return {
      ...draft,
      replacements: {
        ...draft.replacements,
        [report.id]: { ...rewritten, targetKey },
      },
    };
  return { ...draft, moves: { ...draft.moves, [report.id]: targetKey } };
}

/** The reports of the night already recorded, placed on another target (or the whole night): `eventMoves`. */
export function eventMovesBody(draft) {
  const added = new Set(draft.added.map((event) => event.id));
  const replaced = new Set(Object.keys(draft.replacements ?? {}));
  // A report rewritten carries its place in its replacement: the service
  // refuses one that is both replaced and moved.
  return Object.entries(draft.moves)
    .filter(([id]) => !added.has(id) && !replaced.has(id))
    .map(([eventId, targetKey]) => ({ eventId, targetId: targetKey ?? null }));
}

/**
 * What « Remanier » offers on a report. A report of a kind Astro
 * Sync detects has a bin (the service hides it) and, for the incidents it
 * finds in the guiding, a pencil (the person corrects them as an
 * incident, which keeps its origin); a measure (a pose, a temperature) has no
 * pencil; the fall-back of a kind this version does not know has neither (the
 * service would refuse it).
 */
export const reportIsEditable = (report) =>
  (!isDetectedKind(report.kind) && report.kind !== "signal") ||
  isIncidentKind(report.kind);
export const reportIsRemovable = (report) =>
  isDetectedKind(report.kind) || (report.added === true && !report.replaced);
