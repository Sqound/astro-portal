import { generatedEventId } from "../session-events/debrief-event-mapping.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The correction layer of a session (`session-rework.schema.json`). **The
 * event log stays append-only**: a rework never edits or deletes a row of
 * `session_events`. It is kept beside the session
 * (`observation_sessions.rework_json`) and read through at request time:
 *
 * - `targets`: the whole list of the session's targets in the order the
 *   person gave them, each `{ targetId, state, startedAt, finishedAt,
 *   frameCount, filter, reason }`, or `null` while the targets were never
 *   reworked (the session then reads its targets from the plan, the
 *   debriefing and the events);
 * - `addedEvents`: the events a rework added, `{ eventId, type, recordedAt,
 *   receivedAt, payload, targetId }`; they read `timing: "reconstructed"`;
 *   only these can be removed by a later rework. An event that **replaces**
 *  another (the person modified a signal, an observed one
 *   included) also carries `replaces: <eventId>`: the replaced event stays in
 *   the log (or in this list) and is hidden from the effective events
 *   (`replacedByMap`); the resume stored with an added pause carries
 *   `pauseOf: <the pause's eventId>`;
 * - `hidden`: the ids of the logged events a rework removed: only the
 *   four kinds Astro Sync detects (`DETECTED_EVENT_TYPES`) can be, because
 *   they can be neither corrected nor taken back by the person who did not
 *   declare them; the event stays in the log and is left out of the effective
 *   events (`rework: { added: false, targetId, removed: true }` when a read
 *   asks for the replaced events, and in the export);
 * - `moves`: `eventId -> targetId | null`, where a rework posed an event
 *   (observed or added) after the fact (`null` = the whole night);
 * - `dropped`: the keys of the targets a rework removed for good. Only
 *   the ones the night never recorded (a target added by a rework
 *   itself: never part of the promise, never seen); a target the plan held,
 *   the field met or the debriefing added is never erased, it stays in
 *   `targets` as `removed`.
 *
 * Pure: no database, no clock.
 */

/** The kinds Astro Sync detects: the logged events a rework may remove. */
export const DETECTED_EVENT_TYPES = Object.freeze([
  "exposure_change",
  "guiding_timeouts",
  "sensor_temperature_drift",
  "guiding_spikes",
]);

export function emptyLayer() {
  return { targets: null, addedEvents: [], moves: {}, dropped: [], hidden: [] };
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** The layer stored as JSON text (or already parsed), never throwing. */
export function parseLayer(value) {
  let layer = value;
  if (typeof layer === "string") {
    try {
      layer = JSON.parse(layer);
    } catch {
      layer = null;
    }
  }
  if (!isObject(layer)) return emptyLayer();
  return {
    targets: Array.isArray(layer.targets) ? layer.targets : null,
    addedEvents: Array.isArray(layer.addedEvents)
      ? layer.addedEvents.filter(
          (event) => isObject(event) && typeof event.eventId === "string",
        )
      : [],
    moves: isObject(layer.moves) ? layer.moves : {},
    dropped: Array.isArray(layer.dropped)
      ? layer.dropped.filter((key) => typeof key === "string")
      : [],
    hidden: Array.isArray(layer.hidden)
      ? layer.hidden.filter((key) => typeof key === "string")
      : [],
  };
}

/** Whether the layer changes anything at all. */
export function layerIsEmpty(layer) {
  return (
    layer.targets === null &&
    !layer.dropped.length &&
    !layer.addedEvents.length &&
    !layer.hidden.length &&
    !Object.keys(layer.moves).length
  );
}

/** The keys of the targets the rework took out of the session (`state: "removed"`). */
function removedTargetKeys(layer) {
  return new Set(
    (layer.targets ?? [])
      .filter((entry) => entry.state === "removed")
      .map((entry) => entry.targetId),
  );
}

/**
 * `replacedEventId -> eventId of the event that replaces it`, read from the
 * `replaces` of the added events. A chain (A replaced by B, B by C) gives
 * `A -> B` and `B -> C`: the end of the chain is the one that shows.
 */
export function replacedByMap(layer) {
  const map = new Map();
  for (const event of layer.addedEvents)
    if (typeof event.replaces === "string")
      map.set(event.replaces, event.eventId);
  return map;
}

/** The event that shows in the place of `eventId`: the end of its chain (itself when not replaced). */
export function currentReplacementOf(layer, eventId) {
  const map = replacedByMap(layer);
  let current = eventId;
  for (let guard = 0; map.has(current) && guard < 1000; guard += 1)
    current = map.get(current);
  return current;
}

/**
 * The placement of an event after the rework: a target key, or `null` (the
 * whole night). A signal posed on a target the rework took out falls to the
 * whole night, whether it was posed there by its own payload, by a move or
 * when it was added.
 */
function placementOf(layer, eventId, ownTarget, removed) {
  const placed = Object.hasOwn(layer.moves, eventId)
    ? (layer.moves[eventId] ?? null)
    : ownTarget;
  return placed !== null && removed.has(placed) ? null : placed;
}

/** The target a logged event is posed on by its own payload (a note's), if any. */
const ownTargetOf = (event) =>
  event.type === "note" && typeof event.payload?.targetId === "string"
    ? event.payload.targetId
    : null;

/**
 * The stored events a rework added, as event resources
 * (`eventResourceForRow`'s shape). An added event a later rework replaced is
 * left out unless `includeReplaced`; it then reads `rework.replacedBy`. An
 * event that replaces another reads `rework.replaces`.
 */
export function addedEventResources(
  layer,
  sessionId,
  { includeReplaced = false } = {},
) {
  const removed = removedTargetKeys(layer);
  const replacedBy = replacedByMap(layer);
  return layer.addedEvents
    .filter((event) => includeReplaced || !replacedBy.has(event.eventId))
    .map((event) => ({
      eventId: event.eventId,
      sessionId,
      type: event.type,
      recordedAt: event.recordedAt,
      receivedAt: event.receivedAt ?? event.recordedAt,
      originDeviceId: null,
      timing: "reconstructed",
      ...(event.source ? { source: event.source } : {}),
      payload: event.payload ?? {},
      rework: {
        added: true,
        targetId: placementOf(
          layer,
          event.eventId,
          event.targetId ?? null,
          removed,
        ),
        ...(typeof event.replaces === "string"
          ? { replaces: event.replaces }
          : {}),
        ...(replacedBy.has(event.eventId)
          ? { replacedBy: replacedBy.get(event.eventId) }
          : {}),
      },
    }));
}

const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

/**
 * The events of a session as they read after its rework: the append-only log
 * (`rawResources`, as `eventResourceForRow` gives them) with the placements
 * of the moved ones marked `rework: { added: false, targetId }`, plus the
 * events the rework added. Ordered by `(receivedAt, eventId)`, the order of
 * the log's own reads. An event no rework touched is returned as it is.
 *
 * A signal posed on a target the rework took out falls to the whole night
 * (`targetId: null`) unless a move places it elsewhere; an event a rework
 * replaced is **hidden** (it stays in the log) unless `includeReplaced`,
 * when it reads `rework: { added: false, targetId, replacedBy }`.
 */
export function effectiveEventResources(
  rawResources,
  layer,
  sessionId,
  { includeReplaced = false } = {},
) {
  const removed = removedTargetKeys(layer);
  if (
    !layer.addedEvents.length &&
    !layer.hidden.length &&
    !Object.keys(layer.moves).length &&
    !removed.size
  )
    return rawResources;
  const replacedBy = replacedByMap(layer);
  const hidden = new Set(layer.hidden);
  const marked = rawResources
    .filter(
      (event) =>
        includeReplaced ||
        !(replacedBy.has(event.eventId) || hidden.has(event.eventId)),
    )
    .map((event) => {
      const moved = Object.hasOwn(layer.moves, event.eventId);
      const own = ownTargetOf(event);
      const falls = !moved && own !== null && removed.has(own);
      const replaced = replacedBy.get(event.eventId);
      const gone = hidden.has(event.eventId);
      if (!moved && !falls && replaced === undefined && !gone) return event;
      return {
        ...event,
        rework: {
          added: false,
          targetId: placementOf(layer, event.eventId, null, removed),
          ...(replaced === undefined ? {} : { replacedBy: replaced }),
          ...(gone ? { removed: true } : {}),
        },
      };
    });
  return [
    ...marked,
    ...addedEventResources(layer, sessionId, { includeReplaced }),
  ].sort(
    (left, right) =>
      compareText(left.receivedAt, right.receivedAt) ||
      compareText(left.eventId, right.eventId),
  );
}

/**
 * The events a rework adds, with their ids: `addedEvents` of the request
 * (`type`, `at`, `until`, `targetId`, `payload`), the revision the layer
 * moves to and the instant of the write. A pause is stored as the pair
 * `pause` / `resume`; the ids are deterministic (the session, the revision
 * and the rank in the request), the way the debriefing's generated events are.
 *
 * `replacements` (`{ eventId, event, resumeId }`, `event` of the form of an
 * added event, `resumeId` the resume paired with a replaced pause, or `null`)
 * are stored the same way with `replaces: <eventId>` (and the resume with
 * `replaces: <resumeId>`). -> the stored events, in order.
 */
export function eventsAddedByRework({
  sessionId,
  revision,
  timestamp,
  addedEvents,
  replacements = [],
  source = null,
}) {
  const stored = [];
  let ordinal = 0;
  const next = (at, key) =>
    generatedEventId(
      sessionId,
      at,
      (ordinal += 1),
      `rework/${revision}/${key}`,
    );
  const push = (
    event,
    key,
    replaces = null,
    resumeReplaces = null,
    origin = source,
  ) => {
    const targetId = event.targetId ?? null;
    const payload = { ...(event.payload ?? {}) };
    // The note's own `targetId` is ignored: the placement is the entry's.
    if (event.type === "note") delete payload.targetId;
    const eventId = next(event.at, key);
    stored.push({
      eventId,
      type: event.type,
      recordedAt: event.at,
      receivedAt: timestamp,
      payload,
      targetId,
      // Where the rework came from (`astro-sync`, `declared`); absent for a
      // debriefing, which says nothing of its origin. A replacement keeps the
      // origin of the signal it replaces.
      ...(origin ? { source: origin } : {}),
      ...(replaces ? { replaces } : {}),
    });
    if (event.type === "pause")
      stored.push({
        eventId: next(event.until, `${key}/resume`),
        type: "resume",
        recordedAt: event.until,
        receivedAt: timestamp,
        payload: {},
        targetId,
        ...(origin ? { source: origin } : {}),
        pauseOf: eventId,
        ...(resumeReplaces ? { replaces: resumeReplaces } : {}),
      });
  };
  addedEvents.forEach((event, rank) => push(event, `event/${rank}`));
  replacements.forEach((replacement, rank) =>
    push(
      replacement.event,
      `replacement/${rank}`,
      replacement.eventId,
      replacement.resumeId ?? null,
      replacement.source ?? source,
    ),
  );
  return stored;
}

/** The layer after a validated rework (`targets` already normalized by the caller). */
export function layerAfterRework(
  layer,
  {
    targets,
    dropped = [],
    added,
    eventMoves = [],
    eventRemovals = [],
    hide = [],
  },
) {
  const removed = new Set(eventRemovals);
  const hidden = [...new Set([...layer.hidden, ...hide])];
  for (const eventId of hide) removed.add(eventId);
  const addedEvents = [...layer.addedEvents, ...added].filter(
    (event) => !removed.has(event.eventId),
  );
  const moves = { ...layer.moves };
  for (const eventId of removed) delete moves[eventId];
  for (const move of eventMoves) moves[move.eventId] = move.targetId ?? null;
  // A move to the place an added event already has is no move.
  return {
    targets: targets ?? layer.targets,
    dropped: [...new Set([...layer.dropped, ...dropped])],
    hidden,
    addedEvents,
    moves,
  };
}
