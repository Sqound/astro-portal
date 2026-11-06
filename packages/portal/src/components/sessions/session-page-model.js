// The model of the page of a session on the web: what the page draws, worked
// out from what the service answers — the session, its targets
// (`GET /v1/sessions/{id}`, `targets`), its effective events (the log read
// through the rework), the plan and the summary of the night — without React,
// so a test reads it without rendering. The words are not here (the page writes them),
// the model hands out kinds, instants and figures. Every instant is told in
// UTC (the rule of the place without a time zone).

import { effectivePauseCause } from "../../debrief-summary.js";
import { DEVICE_EVENT_TYPES } from "../../session-events/device-event-types.js";
import { sessionPassages } from "../../session-passages.js";
import { sessionTargetsDoneCount } from "../../session-figures.js";
import { sessionSkipGaps, skipGapSpan } from "../../session-skip-gaps.js";

const instantOf = (value) => {
  const at = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(at) ? at : null;
};

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * The outcome the head says: `toDebrief` (the night is over, the plan is not
 * debriefed), `executed`, `partial`, `notExecuted` (the debriefing said
 * `abandoned`: the session stays with its reason) or `noPlan`.
 */
export function sessionOutcomeKind(session) {
  if (session?.outcome === "executed") return "executed";
  if (session?.outcome === "partial") return "partial";
  if (session?.outcome === "abandoned") return "notExecuted";
  return session?.planId ? "toDebrief" : "noPlan";
}

/**
 * Where the session comes from: `plan`, `multiNight` or `noPlan` (the head's
 * « Session du plan « … » »).
 */
export function sessionFromKind(session) {
  if (!session?.planId) return "noPlan";
  return session.projectId ? "multiNight" : "plan";
}

/**
 * What a report of the night is: the four gestures of « Nuit en cours » and
 * the four kinds Astro Sync detects.
 */
export const REPORT_KINDS = {
  pause: "pause",
  condition: "sky",
  note: "note",
  equipment_issue: "incident",
  exposure_change: "exposure",
  guiding_timeouts: "guidingTimeout",
  sensor_temperature_drift: "temperature",
  guiding_spikes: "guidingSpikes",
};

/** The report kinds Astro Sync detects: no pencil in « Remanier », a bin. */
export const DETECTED_REPORT_KINDS = Object.freeze([
  "exposure",
  "guidingTimeout",
  "temperature",
  "guidingSpikes",
]);

/**
 * The kinds of a report an event of a type this version does not know falls
 * back to: an ordinary report, never a note, never an error.
 */
export const UNKNOWN_REPORT_KIND = "signal";

/**
 * The event types that are no report of their own (the movements of the
 * night, and, the pointing devices' events, which the page reads as lines
 * of their own: `session-device-lines.js`): a type outside both lists is a
 * type a newer service wrote.
 */
const MOVEMENT_TYPES = new Set([
  "target_started",
  "target_finished",
  "target_skipped",
  "resume",
  "auto_time_confirmed",
  // A plan changed during the night is read as a line of its own.
  "plan_edited",
  // GUIDED-EVENING-04: the guided evening's summary is a line of its own.
  "guided_evening",
  ...DEVICE_EVENT_TYPES,
]);

/** Whether the service says Astro Sync detected, wrote or reworked the event. */
const fromAstroSync = (event) => event?.source === "astro-sync";

/**
 * The reports of the night (the signalements): the notes, the sky, the
 * incidents and the pauses (a `pause` closed by the next `resume`, an open
 * one by `windowEnd`), each with the target key it is placed on after the
 * rework (`rework.targetId`, `null` = the whole night), else the target it
 * names, else the target whose passage holds its instant.
 */
export function sessionReports({
  events = [],
  passages = [],
  windowEnd = null,
  resolveTarget = (key) => key,
} = {}) {
  const list = [...events].sort(
    (a, b) =>
      String(a.recordedAt).localeCompare(String(b.recordedAt)) ||
      String(a.eventId).localeCompare(String(b.eventId)),
  );
  const placed = (event, at) => {
    if (event.rework && Object.hasOwn(event.rework, "targetId"))
      return event.rework.targetId
        ? resolveTarget(event.rework.targetId)
        : null;
    const own = event.payload?.targetId;
    if (own) return resolveTarget(own);
    if (at === null) return null;
    const inside = passages.find((passage) => {
      const start = instantOf(passage.start);
      const end = instantOf(passage.end) ?? Number.POSITIVE_INFINITY;
      return start !== null && at >= start && at <= end;
    });
    return inside
      ? resolveTarget(inside.targetId ?? inside.planItemId ?? null)
      : null;
  };
  const reports = [];
  const open = [];
  for (const event of list) {
    const at = instantOf(event.recordedAt);
    if (event.type === "pause") {
      open.push({ event, at });
      continue;
    }
    if (event.type === "resume") {
      const opening = open.shift();
      if (opening)
        reports.push({
          id: opening.event.eventId,
          ids: [opening.event.eventId, event.eventId],
          kind: "pause",
          at: opening.at,
          until: at,
          targetKey: placed(opening.event, opening.at),
          text: opening.event.payload?.reason || null,
          cause: effectivePauseCause(opening.event, list),
          reconstructed: opening.event.timing === "reconstructed",
          added: opening.event.rework?.added === true,
          detected: fromAstroSync(opening.event),
          payload: opening.event.payload ?? {},
        });
      continue;
    }
    const kind =
      REPORT_KINDS[event.type] ??
      (typeof event.type === "string" &&
      event.type !== "" &&
      !MOVEMENT_TYPES.has(event.type)
        ? UNKNOWN_REPORT_KIND
        : null);
    if (!kind) continue;
    const payload = event.payload ?? {};
    if (kind === "note" && !payload.text) continue;
    reports.push({
      id: event.eventId,
      ids: [event.eventId],
      kind,
      at,
      until: null,
      targetKey: placed(event, at),
      text:
        kind === "note"
          ? payload.text
          : kind === UNKNOWN_REPORT_KIND
            ? typeof payload.description === "string" && payload.description
              ? payload.description
              : null
            : kind === "incident"
              ? payload.description || null
              : kind === "sky"
                ? (payload.notes ?? null)
                : null,
      sky: kind === "sky" ? (payload.sky ?? null) : null,
      cause: kind === "sky" ? (payload.cause ?? null) : null,
      reconstructed: event.timing === "reconstructed",
      added: event.rework?.added === true,
      // « Détecté par Astro Sync »: only what the service says came from it,
      // never a type this version does not know (the origin is not sure).
      detected: kind !== UNKNOWN_REPORT_KIND && fromAstroSync(event),
      payload,
    });
  }
  const end = instantOf(windowEnd);
  for (const opening of open)
    reports.push({
      id: opening.event.eventId,
      ids: [opening.event.eventId],
      kind: "pause",
      at: opening.at,
      until: end,
      targetKey: placed(opening.event, opening.at),
      text: opening.event.payload?.reason || null,
      cause: effectivePauseCause(opening.event, list),
      reconstructed: opening.event.timing === "reconstructed",
      added: opening.event.rework?.added === true,
      detected: fromAstroSync(opening.event),
      payload: opening.event.payload ?? {},
    });
  return reports.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

const secondsOf = (value) => finite(value);

/**
 * The cards of the targets, in the order of the night (`targets` of the
 * service): the plan's slot, the hours really spent (the passages), the
 * figures the service computed (the debriefing, then the events, then the
 * analysis of Astro Sync), the final photo, and the reports placed on it.
 */
export function sessionCards({
  targets = [],
  debriefSummary = null,
  passages = [],
  skipGaps = [],
  reports = [],
  steps = [],
  captureCards = {},
  titleOf = (id) => id,
  imported = false,
  unpromised = false,
} = {}) {
  const summaryOf = (target) =>
    (debriefSummary?.perTarget ?? []).find(
      (entry) =>
        (target.planItemId && entry.planItemId === target.planItemId) ||
        entry.targetId === target.targetId,
    ) ?? null;
  const keyOf = (target) => target.targetId;
  const matchKeys = (target) =>
    new Set([target.targetId, target.planItemId].filter(Boolean));
  const cards = targets.map((target) => {
    const keys = matchKeys(target);
    const entry = summaryOf(target);
    // The passages the person declared one at a time (the
    // rework's, else the debriefing's) win over the journal's.
    const declared =
      target.state === "removed" || !Array.isArray(target.passages)
        ? null
        : target.passages
            .map((passage) => ({
              start: instantOf(passage.start),
              end: instantOf(passage.end),
              pausedMs: 0,
            }))
            .filter(
              (passage) =>
                passage.start !== null &&
                passage.end !== null &&
                passage.end > passage.start,
            )
            .sort((a, b) => a.start - b.start);
    const journal = passages
      .filter((passage) =>
        [passage.targetId, passage.planItemId].some(
          (key) => key && keys.has(key),
        ),
      )
      .map((passage) => ({
        start: instantOf(passage.start),
        end: instantOf(passage.end),
        pausedMs: passage.pausedMs ?? 0,
      }))
      .filter((passage) => passage.start !== null);
    const own = declared?.length ? declared : journal;
    const slotStart = instantOf(entry?.slot?.start);
    const slotEnd = instantOf(entry?.slot?.end);
    // The promise as the plan made it, not cut to the window of the session
    // -- what « Prévu » shows.
    const promisedStart = instantOf(target.plannedSlot?.start);
    const promisedEnd = instantOf(target.plannedSlot?.end);
    // The stretches a skip cost before the target was taken up again
    // (`session-skip-gaps.js`), hatched on the frise as on « Nuit en cours
    // ». A target taken out has none.
    const holes =
      target.state === "removed"
        ? []
        : skipGaps
            .filter((gap) =>
              gap.planItemId && target.planItemId
                ? gap.planItemId === target.planItemId
                : [gap.targetId, gap.targetLabel].some(
                    (key) => key && keys.has(key),
                  ),
            )
            .map((gap) => skipGapSpan(gap, slotStart))
            .filter(Boolean);
    const first = own[0] ?? null;
    const last = own[own.length - 1] ?? null;
    const card = captureCards[target.captureId] ?? null;
    // The exposure and the filter come from the steps of the night (Astro
    // Sync, or entered by hand), never from dividing the time by the frames.
    const ownSteps = steps.filter(
      (step) => step.targetId && keys.has(step.targetId),
    );
    const exposures = [
      ...new Set(ownSteps.map((step) => finite(step.exposureSeconds))),
    ];
    const byFilter = new Map();
    for (const step of ownSteps)
      byFilter.set(
        step.filter || null,
        (byFilter.get(step.filter || null) ?? 0) +
          (finite(step.integrationSeconds) ?? 0),
      );
    const stepFilter =
      [...byFilter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const stepExposure =
      exposures.length === 1 && exposures[0] > 0 ? exposures[0] : null;
    // The service says the exposure of the target: Astro Sync's analysis,
    // else what was declared; with more than one family the main one is not
    // the only one, so no « 40 × 180 s » can be told.
    const givenExposure = finite(target.exposureSeconds);
    const families = finite(target.exposureFamilies);
    const exposureSeconds =
      givenExposure !== null
        ? givenExposure > 0 && (families === null || families <= 1)
          ? givenExposure
          : null
        : stepExposure;
    // The hours of the target come from the service too (the rework's, else
    // the debriefing's, else the events'): a target whose hours were set with
    // the pencil keeps its interval; the passages are the fallback.
    let givenStart = instantOf(target.startedAt);
    let givenEnd = instantOf(target.finishedAt);
    // Hours that do not run forward are not hours (a catalogue night that
    // knows only its date reads « 00:00 → 00:00 »).
    if (givenStart !== null && givenEnd !== null && givenEnd <= givenStart) {
      givenStart = null;
      givenEnd = null;
    }
    return {
      key: keyOf(target),
      planItemId: target.planItemId ?? null,
      label:
        target.label && target.label !== target.targetId
          ? target.label
          : titleOf(target.targetId),
      // A night imported from the catalogue was never promised: its targets
      // are not « ajoutée sur le terrain ».
      // A free execution's plan promised nothing: what it holds was met in
      // the field (a target taken out stays « retirée »).
      state: imported
        ? "planned"
        : unpromised && target.state !== "removed"
          ? "added"
          : target.state,
      outcome: target.outcome ?? null,
      reason: target.reason ?? null,
      // A free execution's plan (« Lancement rapide ») promised nothing: no
      // « Prévu », no slot, so no « plan initial » on the frise.
      plannedSeconds: unpromised ? null : secondsOf(target.plannedSeconds),
      slot:
        !unpromised && slotStart !== null && slotEnd !== null
          ? { start: slotStart, end: slotEnd }
          : null,
      plannedSlot:
        !unpromised && promisedStart !== null && promisedEnd !== null
          ? { start: promisedStart, end: promisedEnd }
          : null,
      passages: own,
      skipGaps: holes,
      realStart: givenStart ?? (first ? first.start : null),
      realEnd: givenEnd ?? (last ? (last.end ?? last.start) : null),
      // The hours the service gives differ from what the journal's passages
      // say (set with the pencil, or declared at the debriefing): the frise
      // then draws the given interval, not the passages.
      hoursSet:
        !declared?.length &&
        givenStart !== null &&
        givenEnd !== null &&
        (!first ||
          givenStart !== first.start ||
          givenEnd !== (last.end ?? last.start)),
      acquiredSeconds: secondsOf(target.acquiredSeconds),
      frameCount: finite(target.frameCount),
      exposureSeconds,
      filter: target.filter ?? stepFilter,
      measured: ownSteps.length > 0,
      // What the launch froze and what was shot, as the service reads them
      // (`journal.schema.json`); a free execution promised nothing.
      plannedShooting: unpromised ? null : (target.planned ?? null),
      measuredShooting:
        target.state === "removed" ? null : (target.measured ?? null),
      captureId: target.captureId ?? null,
      hasThumbnail: Boolean(target.thumbnailUrl),
      // A night of a private server's catalogue has the catalogue's picture.
      imageUrl:
        typeof target.imageUrl === "string" && target.imageUrl
          ? target.imageUrl
          : null,
      capture: card ? { id: target.captureId, ...card } : null,
      reports: reports.filter(
        (report) => report.targetKey && keys.has(report.targetKey),
      ),
    };
  });
  return withNoTimeTonight(cards);
}

/**
 * « plus le temps ce soir » said of each planned
 * target never observed, whose planned slot the passages of the other
 * targets took, unless the person gave it up for another reason than time.
 */
export function withNoTimeTonight(cards) {
  const taken = cards
    .filter((card) => card.state !== "removed")
    .flatMap((card) =>
      card.passages
        .filter((passage) => passage.end !== null)
        .map((passage) => ({ key: card.key, ...passage })),
    );
  return cards.map((card) => {
    const candidate =
      card.state === "planned" &&
      card.passages.length === 0 &&
      !card.hoursSet &&
      card.outcome !== "done" &&
      card.outcome !== "partial" &&
      (card.reason === null || card.reason === "time") &&
      card.slot;
    if (!candidate) return { ...card, noTimeTonight: false };
    const overrun = taken.some(
      (passage) =>
        passage.key !== card.key &&
        passage.start < card.slot.end &&
        passage.end > card.slot.start,
    );
    return { ...card, noTimeTonight: overrun };
  });
}

/** The reports that belong to no target: the whole night. */
export function wholeNightReports(reports, cards) {
  const known = new Set(
    cards.flatMap((card) => [card.key, card.planItemId].filter(Boolean)),
  );
  return reports.filter(
    (report) => !report.targetKey || !known.has(report.targetKey),
  );
}

/**
 * The figures under the head: the acquired time against the promise, the
 * frames, the targets done and removed, and — only when Astro Sync measured —
 * the median FWHM.
 */
export function sessionFigures({ cards, fwhmPixels = null }) {
  const held = cards.filter((card) => card.state !== "removed");
  const sum = (list, key) =>
    list.reduce((total, card) => total + (finite(card[key]) ?? 0), 0);
  const known = (list, key) => list.some((card) => finite(card[key]) !== null);
  const promised = cards.filter((card) => card.state !== "added");
  return {
    acquiredSeconds: known(held, "acquiredSeconds")
      ? sum(held, "acquiredSeconds")
      : null,
    plannedSeconds: known(promised, "plannedSeconds")
      ? sum(promised, "plannedSeconds")
      : null,
    frameCount: known(held, "frameCount") ? sum(held, "frameCount") : null,
    targetsDone: sessionTargetsDoneCount(cards),
    targetsRemoved: cards.length - held.length,
    fwhmPixels: finite(fwhmPixels),
  };
}

/**
 * The frise of a night, real: « Prévu » (one box per planned slot, a dashed
 * one for a target added in the field, drawn over the hours it was observed;
 * a hatched strip for a removed one), « Réalisé » (one stretch per passage,
 * the pauses hatched) and the reports under the stretch of their target.
 * Instants are epoch milliseconds; `null` when there is nothing to draw.
 */
export function sessionFrise({ cards, reports = [], windowStart, windowEnd }) {
  const planned = [];
  const runs = [];
  const gaps = [];
  for (const card of cards) {
    if (card.state === "removed") {
      if (card.slot)
        planned.push({
          key: card.key,
          label: card.label,
          kind: "removed",
          start: card.slot.start,
          end: card.slot.end,
        });
      continue;
    }
    const box =
      card.state === "added"
        ? card.realStart !== null && card.realEnd !== null
          ? { start: card.realStart, end: card.realEnd }
          : null
        : (card.slot ??
          (card.realStart !== null && card.realEnd !== null
            ? { start: card.realStart, end: card.realEnd }
            : null));
    if (box)
      planned.push({
        key: card.key,
        label: card.label,
        kind: card.state === "added" ? "added" : "planned",
        start: box.start,
        end: box.end,
      });
    for (const gap of card.skipGaps ?? [])
      gaps.push({ key: card.key, start: gap.start, end: gap.end });
    if (card.hoursSet && card.realEnd > card.realStart)
      runs.push({ key: card.key, start: card.realStart, end: card.realEnd });
    else
      for (const passage of card.passages)
        if (passage.end !== null && passage.end > passage.start)
          runs.push({
            key: card.key,
            start: passage.start,
            end: passage.end,
          });
  }
  // Each target its colour, in the order of the night (the
  // first passage, else the planned start), the same at each passage; the
  // targets the night left without time, under the frise.
  const firstOf = new Map();
  for (const run of runs)
    if (!firstOf.has(run.key) || run.start < firstOf.get(run.key))
      firstOf.set(run.key, run.start);
  const colours = {};
  [...firstOf.entries()]
    .sort((a, b) => a[1] - b[1])
    .forEach(([key], index) => {
      colours[key] = index;
    });
  const noTime = cards
    .filter((card) => card.noTimeTonight)
    .map((card) => card.label);
  const pauses = reports
    .filter((report) => report.kind === "pause" && report.until !== null)
    .map((report) => ({
      id: report.id,
      start: report.at,
      end: report.until,
    }));
  const points = [
    ...planned.flatMap((box) => [box.start, box.end]),
    ...runs.flatMap((run) => [run.start, run.end]),
    ...reports.map((report) => report.at).filter((at) => at !== null),
    instantOf(windowStart),
    instantOf(windowEnd),
  ].filter((at) => at !== null);
  if (!planned.length && !runs.length) return null;
  const start = Math.min(...points);
  const end = Math.max(...points);
  return {
    start,
    end: end > start ? end : start + 3600_000,
    planned,
    runs,
    colours,
    noTime,
    gaps,
    pauses,
    reports: reports.filter((report) => report.at !== null),
  };
}

/** The stretches a skip cost, read from the (effective) events. */
export function nightSkipGaps(events) {
  return sessionSkipGaps({ events });
}

/** The passages of a night read from its (effective) events. */
export function nightPassages(events, windowEnd) {
  return sessionPassages({ events, windowEnd: windowEnd ?? null });
}
