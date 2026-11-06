import {
  createObservationSessionRepository,
  ObservationSessionStoreError,
} from "../persistence/observation-session-repository.js";
import {
  EVENT_SOURCES,
  isKnownEventType,
  isValidEventId,
  isValidRecordedAt,
  payloadSchemaErrors,
} from "../session-events/registry.js";

// "Session" here is always an OBSERVATION session; see the naming note at
// the top of persistence/observation-session-repository.js.

/**
 * The stable application error for thin HTTP adapters, on the exact pattern
 * of packages/portal/src/api/plan-resources.js#PlanResourceError. `body` is
 * already the versioned v1 error envelope.
 */
export class ObservationSessionError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "ObservationSessionError";
    this.code = code;
    this.status = status;
    this.body = {
      error: { code, message },
      ...details,
    };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof ObservationSessionError) return error;
  if (error instanceof ObservationSessionStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new ObservationSessionError(code, message, { status, ...details });
  }
  return new ObservationSessionError(
    "observation_session_storage_unavailable",
    "Observation session storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new ObservationSessionError(
      "invalid_request",
      `${label} is required.`,
    );
  return result;
}

function resourceIdentifier(value, label) {
  const result = requiredIdentifier(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new ObservationSessionError(
      "invalid_request",
      `${label} must be a UUID.`,
    );
  return result;
}

function requiredTimestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new ObservationSessionError(
      "invalid_request",
      `${label} must be an ISO 8601 date-time.`,
    );
  return value;
}

// session.schema.json's own $defs.ulid, stricter than the event registry's
// envelope eventId pattern (this one bounds the first character to 0-7, the
// standard ULID overflow guard). clientSessionId is this contract's, not the
// registry's, so it is checked against this contract's own pattern.
const CLIENT_SESSION_ID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

function validClientSessionId(value) {
  if (typeof value !== "string" || !CLIENT_SESSION_ID_PATTERN.test(value))
    throw new ObservationSessionError(
      "invalid_request",
      "clientSessionId must be a 26-character Crockford base32 ULID.",
    );
  return value;
}

// An execution of several plans. The
// identity shared by the sessions launched together is the client's own
// ULID, checked like clientSessionId; the piloting is one of the closed
// values of session.schema.json's $defs.piloting.
const SESSION_PILOTINGS = new Set([
  "mount",
  "smart_telescope",
  "assisted",
  "free",
]);

function validExecutionId(value) {
  if (typeof value !== "string" || !CLIENT_SESSION_ID_PATTERN.test(value))
    throw new ObservationSessionError(
      "invalid_request",
      "executionId must be a 26-character Crockford base32 ULID.",
    );
  return value;
}

function validPiloting(value) {
  if (typeof value !== "string" || !SESSION_PILOTINGS.has(value))
    throw new ObservationSessionError(
      "invalid_request",
      "piloting must be one of mount, smart_telescope, assisted or free.",
    );
  return value;
}

// How a night was closed, written with the finish.
const SESSION_CLOSED_BY = new Set(["automatic", "manual"]);

function validClosedBy(value) {
  if (typeof value !== "string" || !SESSION_CLOSED_BY.has(value))
    throw new ObservationSessionError(
      "invalid_request",
      "closedBy must be one of automatic or manual.",
    );
  return value;
}

// Where a session is created from. A client says `execution` (the default),
// `astro-sync` (Astro Sync's « Nuits ») or `capture` (a night born from a
// capture the person adds); `debrief` and `import` are set by the service's own
// creation paths only.
const CLIENT_SESSION_ORIGINS = new Set(["execution", "astro-sync", "capture"]);

function validOrigin(value) {
  if (typeof value !== "string" || !CLIENT_SESSION_ORIGINS.has(value))
    throw new ObservationSessionError(
      "invalid_request",
      "origin must be execution, astro-sync or capture.",
    );
  return value;
}

function parsedLimit(value, { fallback = 50, max = 200 } = {}) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new ObservationSessionError(
      "invalid_request",
      "limit must be a positive integer.",
    );
  return Math.min(parsed, max);
}

/** The sync read's choice about deleted sessions. */
function parsedDeleted(value) {
  if (value === undefined || value === null || value === "") return "exclude";
  if (value === "exclude" || value === "include" || value === "only")
    return value;
  throw new ObservationSessionError(
    "invalid_request",
    "deleted must be exclude, include or only.",
  );
}

function parsedSince(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw new ObservationSessionError(
      "invalid_request",
      "since must be an ISO 8601 date-time.",
    );
  return value;
}

function safeRejectionEventId(raw) {
  const value =
    typeof raw === "string" && raw ? raw : JSON.stringify(raw ?? null);
  return value.slice(0, 200) || "(unknown)";
}

/**
 * Classifies every submitted event into candidates for storage or a
 * `rejected` entry, per api/v1.md's "Appending events": a faulty event is
 * rejected ALONE, the batch is not. `duplicate_event_id_in_batch` is checked
 * first and is purely about identity — a repeated eventId is flagged
 * whether or not either occurrence would otherwise have been valid.
 * Registry-schema validation (type/payload) is delegated to
 * session-events/registry.js, the single place a payload's shape is
 * described.
 */
function classifyEvents(events) {
  const seenEventIds = new Set();
  const rejected = [];
  const candidates = [];
  let newestRecordedAtMs = null;

  for (const raw of events) {
    const eventId = raw?.eventId;
    if (typeof eventId === "string" && seenEventIds.has(eventId)) {
      rejected.push({
        eventId,
        code: "duplicate_event_id_in_batch",
        message: "This eventId already appears earlier in this batch.",
      });
      continue;
    }
    if (typeof eventId === "string") seenEventIds.add(eventId);

    if (!isValidEventId(eventId)) {
      rejected.push({
        eventId: safeRejectionEventId(eventId),
        code: "invalid_event_id",
        message: "eventId must be a 26-character Crockford base32 ULID.",
      });
      continue;
    }
    if (!isValidRecordedAt(raw?.recordedAt)) {
      rejected.push({
        eventId,
        code: "invalid_recorded_at",
        message: "recordedAt must be an ISO 8601 date-time.",
      });
      continue;
    }
    const recordedAtMs = Date.parse(raw.recordedAt);
    newestRecordedAtMs =
      newestRecordedAtMs === null
        ? recordedAtMs
        : Math.max(newestRecordedAtMs, recordedAtMs);

    if (!isKnownEventType(raw?.type)) {
      rejected.push({
        eventId,
        code: "unknown_event_type",
        message: "This event type is not in the registry.",
      });
      continue;
    }
    if (payloadSchemaErrors(raw.type, raw?.payload).length) {
      rejected.push({
        eventId,
        code: "invalid_event_payload",
        message: "This event's payload does not match its registered schema.",
      });
      continue;
    }
    candidates.push({
      eventId,
      type: raw.type,
      recordedAt: raw.recordedAt,
      payload: raw.payload,
    });
  }

  return { candidates, rejected, newestRecordedAtMs };
}

/**
 * Framework-free v1 observation-session service, on the exact pattern of
 * packages/portal/src/api/plan-resources.js#createPlanResourceService. Route
 * adapters supply an authenticated tenant/device identity and turn returned
 * values/errors into HTTP.
 *
 * Methods:
 * - create({ tenantId, planId?, startedAt, clientSessionId?, executionId?,
 *     piloting?, origin?, originDeviceId? })
 *     -> { resource, created }
 * - list({ tenantId, since?, limit? }) -> { sessions, nextSince, hasMore }
 * - get({ tenantId, sessionId }) -> { session, supplements, events } |
 *     ObservationSessionError 404 session_not_found
 * - finish({ tenantId, sessionId, finishedAt? }) -> resource |
 *     ObservationSessionError 404 session_not_found
 * - reopen({ tenantId, sessionId, reopenedAt? }) -> resource |
 *     ObservationSessionError 404 session_not_found | 409
 *     session_debriefed (« Reprendre la nuit »)
 * - setPiloting({ tenantId, sessionId, piloting }) -> resource |
 *     ObservationSessionError 400 invalid_request | 404 session_not_found
 *     (the mode of a night changed in « Nuit en cours »)
 * - listEvents({ tenantId, sessionId, since?, limit? }) ->
 *     { sessionId, events, nextSince, hasMore } |
 *     ObservationSessionError 404 session_not_found
 * - ingestEvents({ tenantId, sessionId, originDeviceId?, source?, events }) ->
 *     the batchResponse shape (session-event-ingest.schema.json):
 *     { sessionId, receivedAt, accepted, duplicate, rejected, counts,
 *       clockSkewMs?, sessionStatus, sessionUpdatedAt }
 */
export async function createObservationSessionService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createObservationSessionRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));
  const timestamp = () => now();

  return {
    async close() {
      await store.close?.();
    },

    async create({
      tenantId,
      planId = null,
      startedAt,
      clientSessionId = null,
      executionId = null,
      piloting = null,
      origin = null,
      originDeviceId = null,
      originClientInstanceId = null,
      // Astro Sync's bulk sending only (never an HTTP body): an execution
      // whose session is in the trash brings it back instead of being
      // refused `session_deleted`.
      reviveDeleted = false,
    }) {
      try {
        return await store.createSession({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          planId: planId ? resourceIdentifier(planId, "Plan id") : null,
          startedAt: requiredTimestamp(startedAt, "startedAt"),
          clientSessionId: clientSessionId
            ? validClientSessionId(clientSessionId)
            : null,
          executionId:
            executionId === null || executionId === undefined
              ? null
              : validExecutionId(executionId),
          piloting:
            piloting === null || piloting === undefined
              ? null
              : validPiloting(piloting),
          origin:
            origin === null || origin === undefined
              ? "execution"
              : validOrigin(origin),
          originDeviceId: originDeviceId || null,
          originClientInstanceId: originClientInstanceId || null,
          reviveDeleted: reviveDeleted === true,
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async list({ tenantId, since, limit, deleted }) {
      try {
        return await store.listSessions({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          since: parsedSince(since),
          limit: parsedLimit(limit),
          deleted: parsedDeleted(deleted),
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async get({ tenantId, sessionId, includeReplaced = false }) {
      try {
        const detail = await store.getSessionDetail({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          includeReplaced: includeReplaced === true,
          timestamp: timestamp(),
        });
        if (!detail)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        return detail;
      } catch (error) {
        throw apiError(error);
      }
    },

    async finish({
      tenantId,
      sessionId,
      finishedAt = null,
      closedBy = null,
      originClientInstanceId = null,
    }) {
      try {
        const resource = await store.finishSession({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          finishedAt: finishedAt
            ? requiredTimestamp(finishedAt, "finishedAt")
            : null,
          closedBy:
            closedBy === null || closedBy === undefined
              ? null
              : validClosedBy(closedBy),
          originClientInstanceId: originClientInstanceId || null,
          timestamp: timestamp(),
        });
        if (!resource)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async reopen({
      tenantId,
      sessionId,
      reopenedAt = null,
      originClientInstanceId = null,
    }) {
      try {
        const resource = await store.reopenSession({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          reopenedAt: reopenedAt
            ? requiredTimestamp(reopenedAt, "reopenedAt")
            : null,
          originClientInstanceId: originClientInstanceId || null,
          timestamp: timestamp(),
        });
        if (!resource)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async setPiloting({
      tenantId,
      sessionId,
      piloting,
      originClientInstanceId = null,
    }) {
      try {
        const resource = await store.setSessionPiloting({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          piloting: validPiloting(piloting),
          originClientInstanceId: originClientInstanceId || null,
          timestamp: timestamp(),
        });
        if (!resource)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        return resource;
      } catch (error) {
        throw apiError(error);
      }
    },

    async listEvents({ tenantId, sessionId, since, limit, includeReplaced }) {
      try {
        const page = await store.listEvents({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          since: parsedSince(since),
          limit: parsedLimit(limit),
          includeReplaced: includeReplaced === true,
          timestamp: timestamp(),
        });
        if (!page)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        return page;
      } catch (error) {
        throw apiError(error);
      }
    },

    async ingestEvents({
      tenantId,
      sessionId,
      originDeviceId = null,
      source = null,
      originClientInstanceId = null,
      events,
    }) {
      try {
        const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
        const normalizedSessionId = resourceIdentifier(sessionId, "Session id");
        // Envelope-level faults refuse the WHOLE batch with nothing written
        // (api/v1.md, "Appending events"): a missing/empty/oversized events
        // array is a fact about the request, not about the night.
        if (!Array.isArray(events) || events.length === 0)
          throw new ObservationSessionError(
            "invalid_request",
            "A non-empty events array is required.",
          );
        if (events.length > 500)
          throw new ObservationSessionError(
            "event_batch_too_large",
            "More than 500 events in one batch; nothing was written.",
          );

        const { candidates, rejected, newestRecordedAtMs } =
          classifyEvents(events);

        const result = await store.ingestEvents({
          tenantId: normalizedTenantId,
          sessionId: normalizedSessionId,
          originDeviceId: originDeviceId || null,
          source: EVENT_SOURCES.includes(source) ? source : null,
          originClientInstanceId: originClientInstanceId || null,
          events: candidates,
          timestamp: timestamp(),
        });
        if (!result)
          throw new ObservationSessionError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );

        const response = {
          sessionId: normalizedSessionId,
          receivedAt: result.receivedAt,
          accepted: result.accepted,
          duplicate: result.duplicate,
          rejected,
          counts: {
            accepted: result.accepted.length,
            duplicate: result.duplicate.length,
            rejected: rejected.length,
          },
          sessionStatus: result.resource.status,
          sessionUpdatedAt: result.resource.updatedAt,
        };
        if (newestRecordedAtMs !== null)
          response.clockSkewMs =
            Date.parse(result.receivedAt) - newestRecordedAtMs;
        return response;
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * A PUT to a FROZEN plan that already has a session stores the submitted
     * payload as a proposed session supplement instead of discarding it
     * (api/v1.md, "Late field data: session supplements"). Called from the plan
     * write route's own catch block, after the plan write has already been
     * refused for its own reason — this call never turns a legitimate refusal
     * into a different one; a plan with no session simply answers `null` and
     * the route keeps its bare body.
     *
     * -> { supplementId, sessionId } | null
     */
    async proposeSupplementForFrozenPlan({
      tenantId,
      planId,
      originDeviceId = null,
      payload,
    }) {
      try {
        if (!payload || typeof payload !== "object" || Array.isArray(payload))
          throw new ObservationSessionError(
            "invalid_request",
            "A plan payload object is required.",
          );
        return await store.proposeSupplementForFrozenPlan({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          planId: resourceIdentifier(planId, "Plan id"),
          originDeviceId: originDeviceId || null,
          payload,
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
