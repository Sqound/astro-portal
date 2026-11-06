import {
  currentReplacementOf,
  DETECTED_EVENT_TYPES,
  eventsAddedByRework,
  replacedByMap,
} from "./session-rework-layer.js";
import { countOf, spaceLimit } from "../persistence/space-limits.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The events of a rework, checked and shaped: `addedEvents`,
 * `eventReplacements` (a signal modified: the original stays in the log and is
 * hidden, the replacement is stored as an added event that `replaces` it),
 * `eventMoves` and `eventRemovals` of a request against the session they apply
 * to. The rework (`PUT /v1/sessions/{id}/ rework`) and the debriefing
 * (`POST /v1/plans/{id}/debrief`, which takes `addedEvents` and `eventMoves`
 * with the same forms and the same rules, as the first layer of a rework) both
 * read them here, in the transaction that writes, so that the two cannot drift.
 *
 * `fail(code, message, details)` builds the error each repository throws
 * (the same codes and statuses either way: `invalid_request`,
 * `target_not_found` 422, `event_not_found` 404, `event_not_removable` 409,
 * `event_already_replaced` 409, `event_not_replaceable` 409,
 * `session_event_limit_reached` 409).
 *
 * Additive: a replacement keeps the origin (`source`) of the signal it
 * replaces, and may be of another genre among the four (not for a pause); a
 * kind Astro Sync detects can be replaced too (by an incident, say).
 */

/**
 * The types of event a person can replace: the four gestures of « Nuit en
 * cours » and the four kinds Astro Sync detects — the person corrects them as
 * an incident, and the correction keeps their origin.
 */
const REPLACEABLE_TYPES = [
  "note",
  "condition",
  "equipment_issue",
  "pause",
  ...DETECTED_EVENT_TYPES,
];

/**
 * `pause eventId -> the resume that closes it`, among the events that show
 * (the log and the events a rework added, a replaced one left out): in time
 * order, a pause is closed by the next resume, the way the summary of the
 * night pairs them.
 */
async function pausePairs(transaction, sessionId, layer, hidden) {
  const events = (
    await transaction.query(
      `SELECT event_id, type, recorded_at FROM session_events
       WHERE session_id = ? AND type IN ('pause', 'resume')`,
      [sessionId],
    )
  ).rows.map((row) => ({
    eventId: row.event_id,
    type: row.type,
    at: Date.parse(row.recorded_at),
  }));
  for (const event of layer.addedEvents)
    if (event.type === "pause" || event.type === "resume")
      events.push({
        eventId: event.eventId,
        type: event.type,
        at: Date.parse(event.recordedAt),
      });
  const ordered = events
    .filter((event) => !hidden.has(event.eventId) && Number.isFinite(event.at))
    .sort(
      (a, b) =>
        a.at - b.at ||
        (a.type === b.type ? 0 : a.type === "pause" ? -1 : 1) ||
        (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0),
    );
  const pairs = new Map();
  let open = null;
  for (const event of ordered) {
    if (event.type === "pause" && open === null) open = event.eventId;
    else if (event.type === "resume" && open !== null) {
      pairs.set(open, event.eventId);
      open = null;
    }
  }
  return pairs;
}

/** The keys among `keys` that the catalogue or the space's own targets know. */
export async function knownTargetKeys(transaction, tenantId, keys) {
  if (!keys.length) return new Set();
  return new Set(
    (
      await transaction.query(
        `SELECT id FROM target_catalogue_entries
         WHERE id IN (${keys.map(() => "?").join(", ")})
           AND (space_id IS NULL OR space_id = ?)`,
        [...keys, tenantId],
      )
    ).rows.map((row) => row.id),
  );
}

/**
 * -> `{ revision, added, moves, removals }`: the revision the layer moves to,
 * the stored events a request adds, the placements to change and the ids to
 * remove; throws what `fail` builds when anything is wrong. `finalKeys` is
 * the set of the session's target keys once the request is applied.
 */
export async function prepareReworkEvents(
  transaction,
  {
    tenantId,
    sessionId,
    row,
    layer,
    request,
    finalKeys,
    timestamp,
    source = null,
    fail,
    addedOnly = false,
  },
) {
  const replacements = request.eventReplacements ?? [];
  const outside = [
    ...new Set(
      [
        ...request.addedEvents.map((event) => event.targetId),
        ...replacements.map((entry) => entry.event.targetId),
        ...request.eventMoves.map((move) => move.targetId),
      ].filter((key) => key && !finalKeys.has(key)),
    ),
  ];
  const knownOutside = await knownTargetKeys(transaction, tenantId, outside);
  for (const key of outside)
    if (!knownOutside.has(key))
      throw fail(
        "target_not_found",
        "A target is neither in the session, the catalogue nor one of this space's targets.",
        { status: 422, targetId: key },
      );
  const from = Date.parse(row.started_at);
  const to = Date.parse(row.finished_at);
  for (const event of [
    ...request.addedEvents,
    ...replacements.map((entry) => entry.event),
  ]) {
    const at = Date.parse(event.at);
    const until = event.until ? Date.parse(event.until) : at;
    if (
      at < from ||
      at > to ||
      until > to ||
      (event.until !== undefined && until <= at)
    )
      throw fail(
        "invalid_request",
        "An added event must fall inside the session's window (a pause ends after it starts).",
      );
  }
  const removalIds = addedOnly ? [] : (request.eventRemovals ?? []);
  const replacedIds = replacements.map((entry) => entry.eventId);
  if (new Set(replacedIds).size !== replacedIds.length)
    throw fail("invalid_request", "An event can be replaced once per request.");
  for (const eventId of [
    ...request.eventMoves.map((move) => move.eventId),
    ...removalIds,
  ])
    if (replacedIds.includes(eventId))
      throw fail(
        "invalid_request",
        "An event cannot be replaced and moved or removed in the same request.",
      );
  const named = [
    ...request.eventMoves.map((move) => move.eventId),
    ...removalIds,
    ...replacedIds,
  ];
  const loggedTypes = new Map();
  const loggedSources = new Map();
  const loggedIds = new Set();
  if (named.length) {
    const unique = [...new Set(named)];
    for (const entry of (
      await transaction.query(
        `SELECT event_id, type, source FROM session_events
         WHERE session_id = ? AND event_id IN (${unique.map(() => "?").join(", ")})`,
        [sessionId, ...unique],
      )
    ).rows) {
      loggedIds.add(entry.event_id);
      loggedTypes.set(entry.event_id, entry.type);
      if (entry.source) loggedSources.set(entry.event_id, entry.source);
    }
  }
  const addedIds = new Set(layer.addedEvents.map((event) => event.eventId));
  const addedTypes = new Map(
    layer.addedEvents.map((event) => [event.eventId, event.type]),
  );
  const addedSources = new Map(
    layer.addedEvents
      .filter((event) => event.source)
      .map((event) => [event.eventId, event.source]),
  );
  const hidden = replacedByMap(layer);
  // An event a later revision already replaced is not touched again: the
  // client names the one that shows (`replacedBy`).
  const alreadyReplaced = (eventId) =>
    fail(
      "event_already_replaced",
      "The event was already replaced by a more recent revision.",
      {
        status: 409,
        eventId,
        replacedBy: currentReplacementOf(layer, eventId),
      },
    );
  for (const eventId of [
    ...request.eventMoves.map((move) => move.eventId),
    ...removalIds,
  ])
    if (hidden.has(eventId)) throw alreadyReplaced(eventId);
  const removals = new Set(removalIds);
  // The logged events a rework may take out of the night: the four kinds
  // Astro Sync detects. They are hidden, never erased.
  const hide = new Set();
  for (const eventId of removalIds) {
    if (addedIds.has(eventId)) continue;
    if (loggedIds.has(eventId)) {
      if (!DETECTED_EVENT_TYPES.includes(loggedTypes.get(eventId)))
        throw fail(
          "event_not_removable",
          "Only an event a rework added, or one detected by Astro Sync, can be removed.",
          { status: 409, eventId },
        );
      removals.delete(eventId);
      hide.add(eventId);
      continue;
    }
    throw fail("event_not_found", "The session holds no such event.", {
      status: 404,
      eventId,
    });
  }
  const moves = request.eventMoves.filter(
    (move) => !removals.has(move.eventId),
  );
  for (const move of moves)
    if (!addedIds.has(move.eventId) && !loggedIds.has(move.eventId))
      throw fail("event_not_found", "The session holds no such event.", {
        status: 404,
        eventId: move.eventId,
      });
  // An added pause is stored with its resume: removing the pause removes the
  // pair (the replaced pause then shows again with its own resume).
  for (const event of layer.addedEvents)
    if (
      event.type === "resume" &&
      typeof event.pauseOf === "string" &&
      removals.has(event.pauseOf)
    )
      removals.add(event.eventId);

  // --- the signals replaced -----------------------------
  const resolved = [];
  for (const entry of replacements) {
    const eventId = entry.eventId;
    const known = addedIds.has(eventId) || loggedIds.has(eventId);
    if (!known)
      throw fail("event_not_found", "The session holds no such event.", {
        status: 404,
        eventId,
      });
    if (hidden.has(eventId)) throw alreadyReplaced(eventId);
    const type = addedIds.has(eventId)
      ? addedTypes.get(eventId)
      : loggedTypes.get(eventId);
    if (!REPLACEABLE_TYPES.includes(type))
      throw fail(
        "event_not_replaceable",
        "Only a note, a sky condition, an equipment issue, a pause or a kind Astro Sync detects can be replaced.",
        { status: 409, eventId },
      );
    // A pause is replaced by a pause (its resume goes with it); any other
    // signal can become another of the four gestures: its genre is corrected
    // (an incident that was a note, a note that was a pause).
    if (entry.event.type !== type && type === "pause")
      throw fail(
        "invalid_request",
        "A pause is replaced by a pause: a replacement of another type is refused.",
      );
    // The origin of the signal is kept: what Astro Sync wrote and the person
    // corrected still reads « Détecté par Astro Sync ».
    const origin =
      (addedIds.has(eventId)
        ? addedSources.get(eventId)
        : loggedSources.get(eventId)) ?? null;
    resolved.push({
      eventId,
      event: entry.event,
      type,
      resumeId: null,
      source: origin,
    });
  }
  if (resolved.some((entry) => entry.type === "pause")) {
    const pairs = await pausePairs(transaction, sessionId, layer, hidden);
    for (const entry of resolved)
      if (entry.type === "pause")
        entry.resumeId = pairs.get(entry.eventId) ?? null;
  }
  const eventLimit = spaceLimit("eventsPerSession");
  const logged = await countOf(
    transaction,
    "SELECT COUNT(*) AS count FROM session_events WHERE session_id = ?",
    [sessionId],
  );
  const revision = Number(row.rework_revision || 0) + 1;
  const added = eventsAddedByRework({
    sessionId,
    revision,
    timestamp,
    addedEvents: request.addedEvents,
    replacements: resolved,
    source,
  });
  if (
    logged + layer.addedEvents.length - removals.size + added.length >
    eventLimit
  )
    throw fail(
      "session_event_limit_reached",
      `A session holds at most ${eventLimit} events.`,
      { status: 409 },
    );
  return {
    revision,
    added,
    moves: moves.filter((move) => !hide.has(move.eventId)),
    removals: [...removals],
    hide: [...hide],
  };
}
