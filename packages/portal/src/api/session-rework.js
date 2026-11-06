import { validatedPassages } from "../declared-passages.js";
import {
  createSessionReworkRepository,
  SessionReworkStoreError,
} from "../persistence/session-rework-repository.js";
import {
  EVENT_SOURCES,
  isValidEventId,
  payloadSchemaErrors,
} from "../session-events/registry.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The stable application error for thin HTTP adapters, on the pattern of
 * `ObservationSessionError`. `body` is already the versioned v1 error
 * envelope (with the current `session` for `session_rework_conflict`).
 */
export class SessionReworkError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionReworkError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof SessionReworkError) return error;
  if (error instanceof SessionReworkStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new SessionReworkError(code, message, { status, ...details });
  }
  return new SessionReworkError(
    "observation_session_storage_unavailable",
    "Observation session storage is unavailable.",
    { status: 503 },
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = (message) => new SessionReworkError("invalid_request", message);
const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const SKIP_REASONS = ["weather", "equipment", "time", "visibility", "other"];
const TARGET_STATES = ["planned", "added", "removed"];
const EVENT_TYPES = ["note", "condition", "equipment_issue", "pause"];

function onlyKeys(value, allowed, label) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown)
    throw invalid(`${label} has an unexpected property "${unknown}".`);
}

function timestampOf(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw invalid(`${label} must be an ISO 8601 date-time.`);
  return value;
}

function targetKey(value, label) {
  if (typeof value !== "string" || !value || value.length > 200)
    throw invalid(`${label} must be a target key of 1 to 200 characters.`);
  return value;
}

function parseIfMatch(value) {
  if (value === null || value === undefined || value === "")
    throw new SessionReworkError(
      "precondition_required",
      "If-Match is required to rework a session.",
      { status: 428 },
    );
  if (Number.isInteger(value) && value >= 0) return value;
  const match = /^"(0|[1-9]\d*)"$/.exec(String(value).trim());
  if (!match || !Number.isSafeInteger(Number(match[1])))
    throw new SessionReworkError(
      "invalid_if_match",
      "If-Match must be one quoted non-negative rework revision.",
    );
  return Number(match[1]);
}

function validatedTarget(entry, index) {
  const label = `targets[${index}]`;
  if (!isObject(entry)) throw invalid(`${label} must be an object.`);
  onlyKeys(
    entry,
    [
      "targetId",
      "state",
      "startedAt",
      "finishedAt",
      "frameCount",
      "exposureSeconds",
      "filter",
      "reason",
      "passages",
    ],
    label,
  );
  if (!TARGET_STATES.includes(entry.state))
    throw invalid(`${label}.state must be planned, added or removed.`);
  const result = {
    targetId: targetKey(entry.targetId, `${label}.targetId`),
    state: entry.state,
  };
  for (const key of ["startedAt", "finishedAt"])
    result[key] =
      entry[key] === undefined || entry[key] === null
        ? null
        : timestampOf(entry[key], `${label}.${key}`);
  if (
    result.startedAt &&
    result.finishedAt &&
    Date.parse(result.finishedAt) <= Date.parse(result.startedAt)
  )
    throw invalid(`${label}.finishedAt must be after startedAt.`);
  // Additive: the passages set one at a time; the first start
  // and the last end are the target's hours.
  if (entry.passages !== undefined && entry.passages !== null) {
    result.passages = validatedPassages(
      entry.passages,
      `${label}.passages`,
      invalid,
    );
    result.startedAt = result.passages[0].start;
    result.finishedAt = result.passages[result.passages.length - 1].end;
  } else result.passages = null;
  if (entry.frameCount !== undefined && entry.frameCount !== null) {
    if (!Number.isSafeInteger(entry.frameCount) || entry.frameCount < 0)
      throw invalid(`${label}.frameCount must be a whole number, 0 or more.`);
    result.frameCount = entry.frameCount;
  } else result.frameCount = null;
  if (entry.exposureSeconds !== undefined && entry.exposureSeconds !== null) {
    if (
      typeof entry.exposureSeconds !== "number" ||
      !Number.isFinite(entry.exposureSeconds) ||
      entry.exposureSeconds <= 0 ||
      entry.exposureSeconds > 86400
    )
      throw invalid(
        `${label}.exposureSeconds must be a duration of more than 0 s and at most a day.`,
      );
    result.exposureSeconds = entry.exposureSeconds;
  } else result.exposureSeconds = null;
  if (entry.filter !== undefined && entry.filter !== null) {
    if (
      typeof entry.filter !== "string" ||
      entry.filter.length < 1 ||
      entry.filter.length > 40
    )
      throw invalid(`${label}.filter must be 1 to 40 characters.`);
    result.filter = entry.filter;
  } else result.filter = null;
  if (entry.reason !== undefined && entry.reason !== null) {
    if (!SKIP_REASONS.includes(entry.reason))
      throw invalid(`${label}.reason is not recognized.`);
    result.reason = entry.reason;
  } else result.reason = null;
  return result;
}

function validatedAddedEvent(entry, index, label = `addedEvents[${index}]`) {
  if (!isObject(entry)) throw invalid(`${label} must be an object.`);
  onlyKeys(entry, ["type", "at", "until", "targetId", "payload"], label);
  if (!EVENT_TYPES.includes(entry.type))
    throw invalid(
      `${label}.type must be note, condition, equipment_issue or pause.`,
    );
  const result = {
    type: entry.type,
    at: timestampOf(entry.at, `${label}.at`),
    targetId:
      entry.targetId === undefined || entry.targetId === null
        ? null
        : targetKey(entry.targetId, `${label}.targetId`),
  };
  if (entry.type === "pause") {
    if (entry.until === undefined)
      throw invalid(`${label}.until is required for a pause.`);
    result.until = timestampOf(entry.until, `${label}.until`);
    if (Date.parse(result.until) <= Date.parse(result.at))
      throw invalid(`${label}.until must be after at.`);
  } else if (entry.until !== undefined)
    throw invalid(`${label}.until is read for a pause only.`);
  if (!isObject(entry.payload)) throw invalid(`${label}.payload is required.`);
  // A note's own `targetId` is ignored: the placement is the entry's.
  const payload = { ...entry.payload };
  if (entry.type === "note") delete payload.targetId;
  if (payloadSchemaErrors(entry.type, payload).length)
    throw invalid(
      `${label}.payload does not match the ${entry.type} event's schema.`,
    );
  result.payload = payload;
  return result;
}

/**
 * One replacement: `{ eventId, event }`, `event` of the form of an
 * `addedEvents[]` entry. The original stays in the log; the service hides it
 * and stores `event` as an added one that replaces it.
 */
function validatedEventReplacement(entry, index) {
  const label = `eventReplacements[${index}]`;
  if (!isObject(entry)) throw invalid(`${label} must be an object.`);
  onlyKeys(entry, ["eventId", "event"], label);
  if (!isValidEventId(entry.eventId))
    throw invalid(`${label}.eventId must be an event id.`);
  if (!isObject(entry.event)) throw invalid(`${label}.event is required.`);
  return {
    eventId: entry.eventId,
    event: validatedAddedEvent(entry.event, index, `${label}.event`),
  };
}

/**
 * Validates the body of `PUT /v1/sessions/{id}/rework` against
 * `session-rework.schema.json`'s `request`: the shape, the bounds and the
 * payloads. What needs the session (the targets it holds, its window, its
 * events) is checked by the repository, in the transaction that writes.
 */
export function validatedReworkRequest(body) {
  if (!isObject(body)) throw invalid("A JSON rework is required.");
  onlyKeys(
    body,
    [
      "targets",
      "addedEvents",
      "eventReplacements",
      "eventMoves",
      "eventRemovals",
    ],
    "The rework",
  );
  const list = (key, max) => {
    if (body[key] === undefined) return [];
    if (!Array.isArray(body[key]) || body[key].length > max)
      throw invalid(`${key} must be an array of at most ${max} entries.`);
    return body[key];
  };
  const request = {
    targets:
      body.targets === undefined
        ? null
        : list("targets", 64).map(validatedTarget),
    addedEvents: list("addedEvents", 100).map((entry, index) =>
      validatedAddedEvent(entry, index),
    ),
    eventReplacements: list("eventReplacements", 100).map(
      validatedEventReplacement,
    ),
    eventMoves: list("eventMoves", 200).map((entry, index) => {
      const label = `eventMoves[${index}]`;
      if (!isObject(entry)) throw invalid(`${label} must be an object.`);
      onlyKeys(entry, ["eventId", "targetId"], label);
      if (!isValidEventId(entry.eventId))
        throw invalid(`${label}.eventId must be an event id.`);
      if (entry.targetId === undefined)
        throw invalid(
          `${label}.targetId is required (null = the whole night).`,
        );
      return {
        eventId: entry.eventId,
        targetId:
          entry.targetId === null
            ? null
            : targetKey(entry.targetId, `${label}.targetId`),
      };
    }),
    eventRemovals: list("eventRemovals", 100).map((entry, index) => {
      if (!isValidEventId(entry))
        throw invalid(`eventRemovals[${index}] must be an event id.`);
      return entry;
    }),
  };
  if (
    request.targets === null &&
    !request.addedEvents.length &&
    !request.eventReplacements.length &&
    !request.eventMoves.length &&
    !request.eventRemovals.length
  )
    throw invalid("The rework changes nothing: send targets or events.");
  return request;
}

/**
 * Framework-free rework service, on the pattern of the other v1 session
 * services. Free: no entitlement provider is asked, whatever the profile.
 *
 * - rework({ tenantId, userId, sessionId, ifMatch, body,
 *     source?, originClientInstanceId? }) -> `{ revision }`, or a `SessionReworkError`
 *   (`session_rework_conflict` carries the current `session`).
 */
export async function createSessionReworkService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  recomputeDeclaredLines,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createSessionReworkRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
      ...(recomputeDeclaredLines ? { recomputeDeclaredLines } : {}),
    }));

  return {
    async close() {
      await store.close?.();
    },

    async rework({
      tenantId,
      userId,
      sessionId,
      ifMatch,
      body,
      source = null,
      originClientInstanceId = null,
    }) {
      try {
        const space = String(tenantId || "").trim();
        if (!space) throw invalid("Tenant id is required.");
        // An id that is no session's (a synthetic one included).
        if (!UUID.test(String(sessionId || "").trim()))
          throw new SessionReworkError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        const expectedRevision = parseIfMatch(ifMatch);
        const request = validatedReworkRequest(body);
        const result = await store.rework({
          tenantId: space,
          userId: userId || null,
          sessionId: String(sessionId).trim(),
          expectedRevision,
          request,
          source: EVENT_SOURCES.includes(source) ? source : null,
          originClientInstanceId: originClientInstanceId || null,
          timestamp: now(),
        });
        if (result.kind === "conflict")
          throw new SessionReworkError(
            "session_rework_conflict",
            "The session was reworked meanwhile; read it again.",
            { status: 409, session: result.session },
          );
        return { revision: result.revision };
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
