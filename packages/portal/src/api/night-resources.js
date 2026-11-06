import {
  createNightRepository,
  NightRepositoryError,
  stepResourceForRow,
} from "../persistence/night-repository.js";
import { sessionResourceForRow } from "../persistence/observation-session-repository.js";
import { derivedFieldsOf } from "../persistence/session-derived.js";
import { parseJson } from "../persistence/planner-state-repository.js";
import {
  guidingSeries,
  guidingSummary,
  guidingTraceOf,
  posesSummary,
  qualitySummary,
  zoneOf,
} from "../sessions/night-summary.js";
import { nightOnline } from "../sessions/night-online.js";
import { shownPlaceName } from "../places/shown-place-name.js";
import {
  resolvePlaceTimeZone,
  sessionPlaceWithZone,
} from "../planner/place-time-zone.js";

// "Session" here is always an OBSERVATION session — the night; see the
// naming note at the top of persistence/observation-session-repository.js.

/**
 * The structured night: its own fields, read through the plan until the
 * person sets them; its acquisition steps; the summaries of its analysis
 * computed at read time; and « what is online » for it. Framework-free, on
 * the pattern of `observation-sessions.js`; the routes supply the space
 * (a device token of the space or the owner's web session) and turn the
 * values and errors into HTTP. Reading is never gated by a capability.
 *
 * Methods:
 * - read({ tenantId, sessionId }) -> { night, steps, qualitySummary,
 *     guidingSummary, guidingSeries, guidingTrace, posesSummary, zone } |
 *     404 session_not_found — `zone` the place's zone and its offset at the
 *     night's start (the hours are the place's: every instant stays UTC)
 * - patchNight({ tenantId, sessionId, changes }) -> { session, night }
 * - createStep({ tenantId, sessionId, step }) -> step
 * - patchStep({ tenantId, sessionId, stepId, changes }) -> step
 * - deleteStep({ tenantId, sessionId, stepId }) -> undefined
 * - online({ tenantId, sessionId }) -> session-online.schema.json `online`
 */
export class NightError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "NightError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function apiError(error) {
  if (error instanceof NightError) return error;
  if (error instanceof NightRepositoryError) {
    const {
      code,
      message,
      status,
      name: _name,
      stack: _stack,
      ...details
    } = error;
    return new NightError(code, message, { status, ...details });
  }
  return new NightError(
    "observation_session_storage_unavailable",
    "Observation session storage is unavailable.",
    { status: 503 },
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function identifier(value, label) {
  const result = String(value || "").trim();
  if (!UUID.test(result))
    throw new NightError("invalid_request", `${label} must be a UUID.`);
  return result;
}

function tenant(value) {
  const result = String(value || "").trim();
  if (!result)
    throw new NightError("invalid_request", "Tenant id is required.");
  return result;
}

const notFound = () =>
  new NightError("session_not_found", "The session was not found.", {
    status: 404,
  });

const invalid = (message) => new NightError("invalid_request", message);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** `allowed`: an object whose keys are the properties `body` may carry. */
function onlyKeys(body, allowed, label) {
  if (!isObject(body)) throw invalid(`${label} must be a JSON object.`);
  const unknown = Object.keys(body).filter(
    (key) => !Object.hasOwn(allowed, key),
  );
  if (unknown.length)
    throw invalid(`${label} has an unexpected property "${unknown[0]}".`);
}

function text(value, label, max, { nullable = true } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== "string")
    throw invalid(`${label} must be a string${nullable ? " or null" : ""}.`);
  if (value.length > max)
    throw invalid(`${label} must hold ${max} characters at most.`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
    throw invalid(`${label} must be an ISO 8601 date-time.`);
  return value;
}

function coordinate(value, label, limit) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw invalid(`${label} must be a number or null.`);
  if (Math.abs(value) > limit)
    throw invalid(`${label} must lie between -${limit} and ${limit}.`);
  return value;
}

const PLACE_FIELDS = { name: true, latitude: true, longitude: true };
const EQUIPMENT_FIELDS = {
  telescopeId: true,
  cameraId: true,
  mountId: true,
  filterIds: true,
};

/** A night's place: a name and, optionally, coordinates — never a time zone (the place rule). */
function placeInput(value) {
  if (value === null) return null;
  if (isObject(value) && ("timeZone" in value || "timezone" in value))
    throw invalid("A night's place has no time zone.");
  onlyKeys(value, PLACE_FIELDS, "place");
  const name = text(value.name, "place.name", 120, { nullable: false }).trim();
  if (!name) throw invalid("place.name must not be empty.");
  return {
    name,
    latitude: coordinate(value.latitude, "place.latitude", 90),
    longitude: coordinate(value.longitude, "place.longitude", 180),
  };
}

function idOrNull(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw invalid(`${label} must be an identifier or null.`);
  return value;
}

function equipmentInput(value) {
  if (value === null) return null;
  onlyKeys(value, EQUIPMENT_FIELDS, "equipment");
  const filterIds = value.filterIds ?? [];
  if (!Array.isArray(filterIds) || filterIds.length > 20)
    throw invalid(
      "equipment.filterIds must be a list of 20 identifiers at most.",
    );
  return {
    telescopeId: idOrNull(value.telescopeId, "equipment.telescopeId"),
    cameraId: idOrNull(value.cameraId, "equipment.cameraId"),
    mountId: idOrNull(value.mountId, "equipment.mountId"),
    filterIds: [
      ...new Set(filterIds.map((id) => idOrNull(id, "equipment.filterIds[]"))),
    ].filter(Boolean),
  };
}

function targetIdsInput(value) {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length > 50)
    throw invalid(
      "targetIds must be a list of 50 identifiers at most, or null.",
    );
  return [...new Set(value.map((id) => idOrNull(id, "targetIds[]")))].filter(
    Boolean,
  );
}

// The properties each body may carry (objects, never positional lists).
const NIGHT_FIELDS = {
  title: true,
  startedAt: true,
  finishedAt: true,
  place: true,
  equipment: true,
  targetIds: true,
  notes: true,
};

/** Validates a `PATCH …/night` body into the columns' values. */
export function nightChangesInput(body) {
  onlyKeys(body, NIGHT_FIELDS, "The night");
  if (!Object.keys(body).length)
    throw invalid("Name at least one field of the night.");
  const changes = {};
  if ("title" in body) {
    const title = text(body.title, "title", 80);
    changes.title = title === null || !title.trim() ? null : title.trim();
  }
  if ("startedAt" in body)
    changes.startedAt = timestamp(body.startedAt, "startedAt");
  if ("finishedAt" in body)
    changes.finishedAt = timestamp(body.finishedAt, "finishedAt");
  if ("place" in body) changes.place = placeInput(body.place);
  if ("equipment" in body) changes.equipment = equipmentInput(body.equipment);
  if ("targetIds" in body) changes.targetIds = targetIdsInput(body.targetIds);
  if ("notes" in body) {
    // The person's own text, never normalized; empty reads as none.
    const notes = text(body.notes, "notes", 4000);
    changes.notes = notes === "" ? null : notes;
  }
  return changes;
}

const STEP_FIELDS = {
  targetId: true,
  filter: true,
  frameCount: true,
  exposureSeconds: true,
  gain: true,
};

/** Validates a step's body (`required` for a creation). */
export function stepInput(body, { create = false } = {}) {
  onlyKeys(body, STEP_FIELDS, "The step");
  if (!create && !Object.keys(body).length)
    throw invalid("Name at least one field of the step.");
  const step = {};
  if ("targetId" in body) step.targetId = idOrNull(body.targetId, "targetId");
  if ("filter" in body) {
    // Free text of the person, never normalized (« Sans filtre » is null).
    const filter = text(body.filter, "filter", 40);
    step.filter = filter === "" ? null : filter;
  }
  if (create || "frameCount" in body) {
    if (
      !Number.isInteger(body.frameCount) ||
      body.frameCount < 1 ||
      body.frameCount > 100_000
    )
      throw invalid("frameCount must be a whole number from 1 to 100000.");
    step.frameCount = body.frameCount;
  }
  if (create || "exposureSeconds" in body) {
    if (
      typeof body.exposureSeconds !== "number" ||
      !Number.isFinite(body.exposureSeconds) ||
      body.exposureSeconds <= 0 ||
      body.exposureSeconds > 86_400
    )
      throw invalid("exposureSeconds must be a number of seconds above 0.");
    step.exposureSeconds = body.exposureSeconds;
  }
  if ("gain" in body) {
    if (
      body.gain !== null &&
      (!Number.isInteger(body.gain) || body.gain < 0 || body.gain > 100_000)
    )
      throw invalid("gain must be a whole number or null.");
    step.gain = body.gain;
  }
  return step;
}

const finiteNumber = (value) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
};

/** The plan's place, as a night's place: its name and coordinates, never its time zone. */
function planPlace(place) {
  if (!isObject(place)) return null;
  const name =
    (typeof place.name === "string" && place.name.trim()) ||
    (typeof place.locality === "string" && place.locality.trim()) ||
    null;
  const latitude = finiteNumber(place.latitude);
  const longitude = finiteNumber(place.longitude);
  if (name === null && latitude === null && longitude === null) return null;
  return { name, latitude, longitude };
}

function planEquipment(equipment) {
  if (!isObject(equipment)) return null;
  const id = (value) => (typeof value === "string" && value ? value : null);
  const result = {
    telescopeId: id(equipment.telescopeId),
    cameraId: id(equipment.cameraId),
    mountId: id(equipment.mountId),
    filterIds: (Array.isArray(equipment.filterIds) ? equipment.filterIds : [])
      .map(id)
      .filter(Boolean),
  };
  return result.telescopeId ||
    result.cameraId ||
    result.mountId ||
    result.filterIds.length
    ? result
    : null;
}

function planTargets(items) {
  const ids = (Array.isArray(items) ? items : [])
    .map((item) =>
      typeof item?.targetId === "string" && item.targetId
        ? item.targetId
        : typeof item?.target?.id === "string" && item.target.id
          ? item.target.id
          : null,
    )
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * The night's place with the name it is shown under: the live place's, else
 * the copy's own, never a position written as a name (`shownPlaceName`).
 */
function shownPlace(place, copies, knownPlaces) {
  if (!place?.value || typeof place.value !== "object") return place;
  return {
    ...place,
    value: { ...place.value, name: shownPlaceName(copies, knownPlaces) },
  };
}

/**
 * The night's fields (`session.schema.json`, `night`): each one with its
 * `source` — `night` when the night holds it, `plan` when it is read
 * through the plan (the person never set it).
 */
export function nightOf(session, plan, { knownPlaces = [] } = {}) {
  const payload = plan ? parseJson(plan.payload_json, {}) || {} : {};
  const ownPlace = parseJson(session.place_json, null);
  const plannedPlace = payload.location ?? parseJson(plan?.location_json, null);
  const own = (value) => ({ value, source: "night" });
  const either = (value, fromPlan) =>
    value !== null && value !== undefined
      ? own(value)
      : plan && fromPlan !== null && fromPlan !== undefined
        ? { value: fromPlan, source: "plan" }
        : own(null);
  return {
    title: either(session.title ?? null, plan?.name ?? payload.name ?? null),
    startedAt: own(session.started_at),
    finishedAt: own(session.finished_at ?? null),
    place: shownPlace(
      either(ownPlace, planPlace(plannedPlace)),
      [ownPlace, plannedPlace],
      knownPlaces,
    ),
    equipment: either(
      parseJson(session.equipment_json, null),
      planEquipment(payload.equipment ?? parseJson(plan?.equipment_json, null)),
    ),
    targetIds: either(
      parseJson(session.target_ids_json, null),
      plan ? planTargets(payload.items) : null,
    ),
    notes: own(session.notes ?? null),
  };
}

/**
 * The zone of the night's place and its offset at the night's start: the
 * zone of the place itself, of the plan's copy of it, of the space's place of
 * that name and position, else the table's by its position (the page's own
 * order, `sessionPlaceWithZone` and `resolvePlaceTimeZone`).
 */
export function nightZone(night, held) {
  const payload = held.plan ? parseJson(held.plan.payload_json, {}) || {} : {};
  const place = sessionPlaceWithZone(
    night.place?.value ?? null,
    payload.location ?? parseJson(held.plan?.location_json, null),
    held.places ?? [],
  );
  const { timeZone } = place ? resolvePlaceTimeZone(place) : { timeZone: null };
  return zoneOf(timeZone, held.session.started_at);
}

export async function createNightService({
  repository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
} = {}) {
  const store =
    repository ||
    (await createNightRepository({
      databasePath,
      databaseUrl,
      driver,
      dialect,
    }));

  async function requireKnownTargets(tenantId, ids) {
    if (!ids?.length) return;
    const known = await store.knownTargetIds(tenantId, ids);
    const missing = ids.find((id) => !known.has(id));
    if (missing)
      throw new NightError(
        "target_not_found",
        "A target is neither in the catalogue nor one of this space's targets.",
        { status: 422, targetId: missing },
      );
  }

  async function requireKnownEquipment(tenantId, equipment) {
    if (!equipment) return;
    const ids = [
      equipment.telescopeId,
      equipment.cameraId,
      equipment.mountId,
      ...equipment.filterIds,
    ].filter(Boolean);
    const known = await store.knownEquipmentIds(tenantId, ids);
    const missing = ids.find((id) => !known.has(id));
    if (missing)
      throw new NightError(
        "equipment_not_found",
        "An equipment identifier is not equipment of this space.",
        { status: 422, equipmentId: missing },
      );
  }

  return {
    async close() {
      await store.close?.();
    },

    async read({ tenantId, sessionId }) {
      try {
        const held = await store.readNight({
          tenantId: tenant(tenantId),
          sessionId: identifier(sessionId, "Session id"),
        });
        if (!held) throw notFound();
        const steps = held.steps.map(stepResourceForRow);
        const report = held.analysis?.report ?? null;
        const night = nightOf(held.session, held.plan, {
          knownPlaces: held.places,
        });
        return {
          night,
          steps,
          qualitySummary: report ? qualitySummary(report, steps) : null,
          guidingSummary: report ? guidingSummary(report) : null,
          guidingSeries: report ? guidingSeries(report) : [],
          guidingTrace: report ? guidingTraceOf(report) : null,
          posesSummary: report ? posesSummary(report) : null,
          zone: nightZone(night, held),
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async patchNight({
      tenantId,
      sessionId,
      changes: body,
      originClientInstanceId = null,
    }) {
      try {
        const space = tenant(tenantId);
        const id = identifier(sessionId, "Session id");
        const changes = nightChangesInput(body);
        await requireKnownTargets(space, changes.targetIds);
        await requireKnownEquipment(space, changes.equipment);
        const row = await store.patchNight({
          tenantId: space,
          sessionId: id,
          changes,
          originClientInstanceId,
        });
        if (!row) throw notFound();
        const held = await store.readNight({ tenantId: space, sessionId: id });
        return {
          session: sessionResourceForRow(
            held.session,
            derivedFieldsOf(held.session, held.plan),
          ),
          night: nightOf(held.session, held.plan, { knownPlaces: held.places }),
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    async createStep({
      tenantId,
      sessionId,
      step: body,
      originClientInstanceId = null,
    }) {
      try {
        const space = tenant(tenantId);
        const step = stepInput(body, { create: true });
        if (step.targetId) await requireKnownTargets(space, [step.targetId]);
        const row = await store.createStep({
          tenantId: space,
          sessionId: identifier(sessionId, "Session id"),
          step,
          originClientInstanceId,
        });
        if (!row) throw notFound();
        return stepResourceForRow(row);
      } catch (error) {
        throw apiError(error);
      }
    },

    async patchStep({
      tenantId,
      sessionId,
      stepId,
      changes: body,
      originClientInstanceId = null,
    }) {
      try {
        const space = tenant(tenantId);
        const id = identifier(sessionId, "Session id");
        const step = identifier(stepId, "Step id");
        const changes = stepInput(body);
        if (changes.targetId)
          await requireKnownTargets(space, [changes.targetId]);
        const row = await store.patchStep({
          tenantId: space,
          sessionId: id,
          stepId: step,
          changes,
          originClientInstanceId,
        });
        if (!row)
          throw new NightError(
            "step_not_found",
            "No such step for this night.",
            { status: 404 },
          );
        return stepResourceForRow(row);
      } catch (error) {
        throw apiError(error);
      }
    },

    async deleteStep({
      tenantId,
      sessionId,
      stepId,
      originClientInstanceId = null,
    }) {
      try {
        const deleted = await store.deleteStep({
          tenantId: tenant(tenantId),
          sessionId: identifier(sessionId, "Session id"),
          stepId: identifier(stepId, "Step id"),
          originClientInstanceId,
        });
        if (!deleted)
          throw new NightError(
            "step_not_found",
            "No such step for this night.",
            { status: 404 },
          );
      } catch (error) {
        throw apiError(error);
      }
    },

    async online({ tenantId, sessionId }) {
      try {
        const space = tenant(tenantId);
        const id = identifier(sessionId, "Session id");
        const held = await store.readNight({ tenantId: space, sessionId: id });
        if (!held) throw notFound();
        const night = nightOf(held.session, held.plan, {
          knownPlaces: held.places,
        });
        const rows = await store.onlineRows({ tenantId: space, sessionId: id });
        const targetIds = night.targetIds.value ?? [];
        const named = [
          ...new Set([...targetIds, ...rows.targets.map((r) => r.target_id)]),
        ];
        return nightOnline({
          sessionId: id,
          targetIds,
          rows,
          names: await store.targetNames(space, named),
          analysis: held.analysis,
          steps: held.steps.map(stepResourceForRow),
        });
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
