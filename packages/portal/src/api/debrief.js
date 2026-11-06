import { validatedPassages } from "../declared-passages.js";
import {
  createDebriefRepository,
  DebriefStoreError,
} from "../persistence/debrief-repository.js";
import {
  SessionReworkError,
  validatedReworkRequest,
} from "./session-rework.js";

// "Session" everywhere in this file is always an OBSERVATION session; see
// the naming note at the top of persistence/observation-session-repository.js.
// Every export here is named debrief... for the same collision-avoidance
// reason.

/**
 * The stable application error for thin HTTP adapters, on the exact pattern
 * of packages/portal/src/api/plan-resources.js#PlanResourceError /
 * api/observation-sessions.js#ObservationSessionError. `body` is already the
 * versioned v1 error envelope.
 */
export class DebriefError extends Error {
  constructor(code, message, { status = 400, reason, ...details } = {}) {
    super(message);
    this.name = "DebriefError";
    this.code = code;
    this.status = status;
    // `Error.reason` tells apart the two causes of `plan_not_debriefable`
    // (`night_in_future`, `session_has_events`), so a screen only advises
    // « partial » when the night holds field events.
    this.body = {
      error: { code, message, ...(reason ? { reason } : {}) },
      ...details,
    };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof DebriefError) return error;
  if (error instanceof DebriefStoreError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new DebriefError(code, message, { status, ...details });
  }
  return new DebriefError(
    "debrief_storage_unavailable",
    "Debrief storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new DebriefError("invalid_request", `${label} is required.`);
  return result;
}

function resourceIdentifier(value, label) {
  const result = requiredIdentifier(value, label);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new DebriefError("invalid_request", `${label} must be a UUID.`);
  return result;
}

const OUTCOMES = ["executed", "partial", "abandoned"];
const BASE_VERSIONS = ["current", "set_aside"];
const ADJUSTMENT_STATES = ["done", "skipped", "modified", "partial"];
// The registry's own closed list (session-events/target-skipped.schema.json
// properties.reason.enum), restated here on the same principle
// debrief.schema.json's own $defs.skipReason does — pinned against it in
// packages/astro-contracts/tests/sessions.test.mjs.
const SKIP_REASONS = ["weather", "equipment", "time", "visibility", "other"];

function isValidTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validatedNote(value, label, { maxLength = 500 } = {}) {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength)
    throw new DebriefError(
      "invalid_request",
      `${label} must be 1 to ${maxLength} characters.`,
    );
  return value;
}

/** An exposure per frame a person declares: more than 0 s, a day at most. */
function validatedExposure(value, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 86400
  )
    throw new DebriefError(
      "invalid_request",
      `${label} must be a duration of more than 0 s and at most a day.`,
    );
  return value;
}

function validatedAdjustment(entry, index) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new DebriefError(
      "invalid_request",
      `sessionAdjustments.targets[${index}] must be an object.`,
    );
  const targetId = String(entry.targetId || "").trim();
  if (!targetId || targetId.length > 200)
    throw new DebriefError(
      "invalid_request",
      `sessionAdjustments.targets[${index}].targetId is required.`,
    );
  const state = entry.state;
  if (!ADJUSTMENT_STATES.includes(state))
    throw new DebriefError(
      "invalid_request",
      `sessionAdjustments.targets[${index}].state must be done, skipped, modified or partial.`,
    );
  const result = { targetId, state };
  // `reason` is read for `skipped` only; a `note`'s bound narrows to 300 for
  // a `skipped` adjustment (it lands in the registry's `notes`) versus 500
  // for `done`/`modified` (it becomes a `note` event's own `text`) — exactly
  // debrief.schema.json's $defs.targetAdjustment allOf branch.
  if (entry.reason !== undefined) {
    if (!SKIP_REASONS.includes(entry.reason))
      throw new DebriefError(
        "invalid_request",
        `sessionAdjustments.targets[${index}].reason is not recognized.`,
      );
    result.reason = entry.reason;
  }
  if (entry.note !== undefined)
    result.note = validatedNote(
      entry.note,
      `sessionAdjustments.targets[${index}].note`,
      { maxLength: state === "skipped" ? 300 : 500 },
    );
  // The observing time the person declares for this target, in whole
  // minutes — read for done/modified/partial, ignored under skipped
  // (nothing was acquired), exactly as `reason` is read for skipped only.
  if (entry.acquiredMinutes !== undefined) {
    if (
      !Number.isSafeInteger(entry.acquiredMinutes) ||
      entry.acquiredMinutes < 0
    )
      throw new DebriefError(
        "invalid_request",
        `sessionAdjustments.targets[${index}].acquiredMinutes must be a whole number of minutes, 0 or more.`,
      );
    result.acquiredMinutes = entry.acquiredMinutes;
  }
  // The figures and times the person declares for an observed target, and
  // the removal of a planned one. They are stored with the debriefing and
  // never turned into events.
  if (entry.frameCount !== undefined) {
    if (!Number.isSafeInteger(entry.frameCount) || entry.frameCount < 0)
      throw new DebriefError(
        "invalid_request",
        `sessionAdjustments.targets[${index}].frameCount must be a whole number, 0 or more.`,
      );
    result.frameCount = entry.frameCount;
  }
  if (entry.exposureSeconds !== undefined)
    result.exposureSeconds = validatedExposure(
      entry.exposureSeconds,
      `sessionAdjustments.targets[${index}].exposureSeconds`,
    );
  for (const key of ["startedAt", "finishedAt"])
    if (entry[key] !== undefined) {
      if (!isValidTimestamp(entry[key]))
        throw new DebriefError(
          "invalid_request",
          `sessionAdjustments.targets[${index}].${key} must be an ISO 8601 date-time.`,
        );
      result[key] = entry[key];
    }
  if (
    result.startedAt !== undefined &&
    result.finishedAt !== undefined &&
    Date.parse(result.finishedAt) <= Date.parse(result.startedAt)
  )
    throw new DebriefError(
      "invalid_request",
      `sessionAdjustments.targets[${index}].finishedAt must be after startedAt.`,
    );
  // Additive: the passages declared one at a time; the first
  // start and the last end are the target's hours.
  if (entry.passages !== undefined) {
    result.passages = validatedPassages(
      entry.passages,
      `sessionAdjustments.targets[${index}].passages`,
      (message) => new DebriefError("invalid_request", message),
    );
    result.startedAt = result.passages[0].start;
    result.finishedAt = result.passages[result.passages.length - 1].end;
  }
  if (entry.removed !== undefined) {
    if (typeof entry.removed !== "boolean")
      throw new DebriefError(
        "invalid_request",
        `sessionAdjustments.targets[${index}].removed must be a boolean.`,
      );
    result.removed = entry.removed;
  }
  return result;
}

function validatedAddedTarget(entry, index) {
  const where = `addedTargets[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw new DebriefError("invalid_request", `${where} must be an object.`);
  const allowed = [
    "targetId",
    "startedAt",
    "finishedAt",
    "acquiredMinutes",
    "frameCount",
    "exposureSeconds",
    "filter",
    "passages",
  ];
  const unknown = Object.keys(entry).find((key) => !allowed.includes(key));
  if (unknown)
    throw new DebriefError(
      "invalid_request",
      `${where} has an unexpected property "${unknown}".`,
    );
  const targetId = String(entry.targetId || "").trim();
  if (!targetId || targetId.length > 200)
    throw new DebriefError("invalid_request", `${where}.targetId is required.`);
  const result = { targetId };
  for (const key of ["startedAt", "finishedAt"])
    if (entry[key] !== undefined) {
      if (!isValidTimestamp(entry[key]))
        throw new DebriefError(
          "invalid_request",
          `${where}.${key} must be an ISO 8601 date-time.`,
        );
      result[key] = entry[key];
    }
  if (
    result.startedAt !== undefined &&
    result.finishedAt !== undefined &&
    Date.parse(result.finishedAt) <= Date.parse(result.startedAt)
  )
    throw new DebriefError(
      "invalid_request",
      `${where}.finishedAt must be after startedAt.`,
    );
  // Additive: the passages declared one at a time.
  if (entry.passages !== undefined) {
    result.passages = validatedPassages(
      entry.passages,
      `${where}.passages`,
      (message) => new DebriefError("invalid_request", message),
    );
    result.startedAt = result.passages[0].start;
    result.finishedAt = result.passages[result.passages.length - 1].end;
  }
  for (const key of ["acquiredMinutes", "frameCount"])
    if (entry[key] !== undefined) {
      if (!Number.isSafeInteger(entry[key]) || entry[key] < 0)
        throw new DebriefError(
          "invalid_request",
          `${where}.${key} must be a whole number, 0 or more.`,
        );
      result[key] = entry[key];
    }
  if (entry.exposureSeconds !== undefined)
    result.exposureSeconds = validatedExposure(
      entry.exposureSeconds,
      `${where}.exposureSeconds`,
    );
  if (entry.filter !== undefined) {
    if (
      typeof entry.filter !== "string" ||
      entry.filter.length < 1 ||
      entry.filter.length > 40
    )
      throw new DebriefError(
        "invalid_request",
        `${where}.filter must be 1 to 40 characters.`,
      );
    result.filter = entry.filter;
  }
  return result;
}

/**
 * Validates and normalizes a debrief decision body against
 * debrief.schema.json's `$defs.request`. Conditionally-required fields
 * (`setAsideVersionId` when `baseVersion` is `set_aside`) are left to the
 * repository, which already answers the precise `set_aside_version_*` codes
 * for them — this function only rejects a shape debrief.schema.json itself
 * would reject. Exported for its tests.
 */
export function validatedDecision(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new DebriefError(
      "invalid_request",
      "A JSON debrief decision is required.",
    );
  const outcome = body.outcome;
  if (!OUTCOMES.includes(outcome))
    throw new DebriefError(
      "invalid_request",
      "outcome must be one of executed, partial, abandoned.",
    );

  const decision = { outcome };

  if (body.baseVersion !== undefined) {
    if (!BASE_VERSIONS.includes(body.baseVersion))
      throw new DebriefError(
        "invalid_request",
        "baseVersion must be current or set_aside.",
      );
    decision.baseVersion = body.baseVersion;
  }
  if (body.setAsideVersionId !== undefined)
    decision.setAsideVersionId = resourceIdentifier(
      body.setAsideVersionId,
      "setAsideVersionId",
    );

  if (body.session !== undefined) {
    if (
      !body.session ||
      typeof body.session !== "object" ||
      Array.isArray(body.session)
    )
      throw new DebriefError("invalid_request", "session must be an object.");
    const session = {};
    if (body.session.startedAt !== undefined) {
      if (!isValidTimestamp(body.session.startedAt))
        throw new DebriefError(
          "invalid_request",
          "session.startedAt must be an ISO 8601 date-time.",
        );
      session.startedAt = body.session.startedAt;
    }
    if (body.session.finishedAt !== undefined) {
      if (!isValidTimestamp(body.session.finishedAt))
        throw new DebriefError(
          "invalid_request",
          "session.finishedAt must be an ISO 8601 date-time.",
        );
      session.finishedAt = body.session.finishedAt;
    }
    // A journal whose night ends before it starts is never what the person
    // meant (a mistyped hour on either surface): refuse it rather than
    // store it. Only checked when both bounds are supplied — either one
    // alone is completed from the plan's derived night.
    if (
      session.startedAt !== undefined &&
      session.finishedAt !== undefined &&
      Date.parse(session.finishedAt) <= Date.parse(session.startedAt)
    )
      throw new DebriefError(
        "invalid_request",
        "session.finishedAt must be after session.startedAt.",
      );
    decision.session = session;
  }

  if (body.sessionAdjustments !== undefined) {
    const targets = body.sessionAdjustments?.targets;
    if (!Array.isArray(targets))
      throw new DebriefError(
        "invalid_request",
        "sessionAdjustments.targets must be an array.",
      );
    decision.sessionAdjustments = {
      targets: targets.map(validatedAdjustment),
    };
  }

  if (body.note !== undefined) decision.note = validatedNote(body.note, "note");

  // The targets observed that the plan did not hold (read for `executed` and
  // `partial`), and why a night was not carried out (read for `abandoned`).
  if (body.addedTargets !== undefined) {
    if (!Array.isArray(body.addedTargets) || body.addedTargets.length > 32)
      throw new DebriefError(
        "invalid_request",
        "addedTargets must be an array of at most 32 targets.",
      );
    decision.addedTargets = body.addedTargets.map(validatedAddedTarget);
  }
  if (body.reason !== undefined) {
    if (!SKIP_REASONS.includes(body.reason))
      throw new DebriefError("invalid_request", "reason is not recognized.");
    decision.reason = body.reason;
  }

  // Additive: the events and the placements of the signals the person adds
  // after the fact, in the forms and with the rules of the rework
  // (`session-rework.schema.json`); applied as the first layer of a rework.
  // Read for `executed` and `partial` (an `abandoned` night has no event,
  // so they are refused there).
  const events = {};
  for (const key of ["addedEvents", "eventReplacements", "eventMoves"])
    if (body[key] !== undefined) events[key] = body[key];
  if (
    Object.values(events).some((value) => !Array.isArray(value) || value.length)
  ) {
    if (outcome === "abandoned")
      throw new DebriefError(
        "invalid_request",
        "addedEvents, eventReplacements and eventMoves are read for executed and partial only: a night not carried out holds no event.",
      );
    try {
      const { addedEvents, eventReplacements, eventMoves } =
        validatedReworkRequest(events);
      if (addedEvents.length) decision.addedEvents = addedEvents;
      if (eventReplacements.length)
        decision.eventReplacements = eventReplacements;
      if (eventMoves.length) decision.eventMoves = eventMoves;
    } catch (error) {
      if (error instanceof SessionReworkError)
        throw new DebriefError(error.code, error.message, {
          status: error.status,
        });
      throw error;
    }
  }

  return decision;
}

function debriefResponseFromResult(result) {
  switch (result.kind) {
    case "missing":
      throw new DebriefError("plan_not_found", "The plan was not found.", {
        status: 404,
      });
    case "frozen":
      throw new DebriefError(
        "plan_frozen",
        "This plan was never debriefed; there is no earlier decision to replay.",
        {
          status: 409,
          serverRevision: result.serverRevision,
          serverPayload: result.serverPayload,
        },
      );
    case "not_debriefable":
      throw new DebriefError(
        "plan_not_debriefable",
        result.reason === "session_has_events"
          ? "The night has started; debrief it as partial."
          : "This plan's night has not happened yet.",
        { status: 409, reason: result.reason },
      );
    case "set_aside_version_required":
      throw new DebriefError(
        "set_aside_version_required",
        "Two versions exist for this plan; state which one describes the night.",
        { status: 400 },
      );
    case "set_aside_version_not_found":
      throw new DebriefError(
        "set_aside_version_not_found",
        "setAsideVersionId names no set-aside version of this plan.",
        { status: 404 },
      );
    case "unknown_target_adjustment":
      throw new DebriefError(
        "unknown_target_adjustment",
        result.added
          ? `Target "${result.targetId}" is unknown to this space.`
          : `Target "${result.targetId}" is absent from the chosen plan version.`,
        { status: 400, targetId: result.targetId },
      );
    case "ok":
      return {
        plan: result.plan,
        session: result.session,
        outcome: result.outcome,
        decidedAt: result.decidedAt,
        createdSession: result.createdSession,
        eventsCreated: result.eventsCreated,
        replayed: result.replayed,
      };
    default:
      throw new DebriefError(
        "debrief_storage_unavailable",
        "Unexpected debrief result.",
        { status: 503 },
      );
  }
}

function supplementResponseFromResult(result) {
  switch (result.kind) {
    case "session_missing":
      throw new DebriefError(
        "session_not_found",
        "The session was not found.",
        { status: 404 },
      );
    case "supplement_missing":
      throw new DebriefError(
        "supplement_not_found",
        "No such supplement on this session.",
        { status: 404 },
      );
    case "already_accepted":
      throw new DebriefError(
        "supplement_already_accepted",
        "Its events are appended and cannot be withdrawn.",
        { status: 409 },
      );
    case "ok":
      return {
        supplement: result.supplement,
        eventsCreated: result.eventsCreated,
        replayed: result.replayed,
      };
    default:
      throw new DebriefError(
        "debrief_storage_unavailable",
        "Unexpected supplement result.",
        { status: 503 },
      );
  }
}

/**
 * Framework-free v1 debriefing service, on the exact pattern of
 * packages/portal/src/api/observation-sessions.js#createObservationSessionService.
 * Route adapters supply an authenticated tenant/user/device identity and
 * turn returned values/errors into HTTP. Never capability-gated
 * (api/v1.md, "Uploads and captures": plan correctness and the truth of
 * the field are never held by a right).
 *
 * Methods:
 * - queue({ tenantId }) -> { generatedAt, entries }
 * - decide({ tenantId, userId, planId, body, originDeviceId }) ->
 *     debrief.schema.json's `response` shape | DebriefError
 * - record({ tenantId, planId }) -> debrief.schema.json's `record` | null
 * - decideSupplement({ tenantId, sessionId, supplementId, body }) ->
 *     session.schema.json's `supplementDecisionResponse` shape | DebriefError
 */
export async function createDebriefService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  now = () => new Date().toISOString(),
} = {}) {
  const store =
    repository ||
    (await createDebriefRepository({
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

    async queue({ tenantId }) {
      try {
        return await store.queue({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          timestamp: timestamp(),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async decide({
      tenantId,
      userId,
      planId,
      body,
      originDeviceId = null,
      originClientInstanceId = null,
    }) {
      try {
        const decision = validatedDecision(body);
        const result = await store.decide({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          userId: requiredIdentifier(userId, "User id"),
          planId: resourceIdentifier(planId, "Plan id"),
          decision,
          originDeviceId: originDeviceId || null,
          originClientInstanceId: originClientInstanceId || null,
          timestamp: timestamp(),
        });
        return debriefResponseFromResult(result);
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * The stored debriefing of one plan (debrief.schema.json's `record`), or
     * null when the plan was never debriefed.
     */
    async record({ tenantId, planId }) {
      try {
        return await store.debriefRecord({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          planId: resourceIdentifier(planId, "Plan id"),
        });
      } catch (error) {
        throw apiError(error);
      }
    },

    async decideSupplement({
      tenantId,
      sessionId,
      supplementId,
      body,
      originClientInstanceId = null,
    }) {
      try {
        const decisionValue = body?.decision;
        if (!["accept", "dismiss"].includes(decisionValue))
          throw new DebriefError(
            "invalid_request",
            "decision must be accept or dismiss.",
          );
        const result = await store.decideSupplement({
          tenantId: requiredIdentifier(tenantId, "Tenant id"),
          sessionId: resourceIdentifier(sessionId, "Session id"),
          supplementId: resourceIdentifier(supplementId, "Supplement id"),
          decision: decisionValue,
          originClientInstanceId: originClientInstanceId || null,
          timestamp: timestamp(),
        });
        return supplementResponseFromResult(result);
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
