import {
  createProjectIntegrationRepository,
  totalsByFilterOf,
} from "../persistence/project-integration-repository.js";

/**
 * The integrations of a multi-night plan (`integration.schema.json`, api/v1.md « Integrations
 * of a multi-night plan »), framework-free: a route adapter supplies the
 * space, the person and the body, and turns the value or the thrown
 * `ProjectIntegrationError` into HTTP.
 *
 * - `list` never needs a capability, on any service.
 * - `put` adds or replaces lines (idempotent per night, target and family).
 *   It needs the multi-night plans of Astro Sync: `multiNightActive(userId)`
 *   decides (the capability `analysis.progression`; always on a private
 *   server), else
 *   `403 multi_night_not_active`. A line for a night that does not belong
 *   to the plan is `409 integration_night_not_in_project`, and a line whose
 *   `eveningDate` is not
 *   its night's is `409 integration_outside_night`, whatever the capability.
 *   Every line is checked before one is written. A measured line replaces
 *   the line the session declared for the same night and target.
 * - A body with `replace` (`[{ nightId, targetId }]`) sends those sets
 *   **complete**: the plan's measured lines of such a night and target that
 *   the body does not carry any more are removed, in the same transaction
 *   (a night stacked again under another filter leaves no stale line). A
 *   body without `replace` is the earlier form: lines added or replaced,
 *   none removed, so an older client never erases what it did not send.
 */

export const MULTI_NIGHT_CAPABILITY = "analysis.progression";
const MAX_LINES = 200;

export class ProjectIntegrationError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "ProjectIntegrationError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
  }
}

const invalid = (message) =>
  new ProjectIntegrationError("invalid_request", message);

/**
 * The capability of the gestures on the plan itself: attaching, detaching
 * and creating a multi-night plan with nights are part of « Planification
 * avancée » (`planner.mosaic`). The integrations of a plan and its image stay under
 * `MULTI_NIGHT_CAPABILITY`.
 */
export const MULTI_NIGHT_ATTACH_CAPABILITY = "planner.mosaic";

/** The refusal of a space without the multi-night plans of Astro Sync. */
export const multiNightNotActive = () =>
  new ProjectIntegrationError(
    "multi_night_not_active",
    "The multi-night plans of Astro Sync need a right this space does not hold: the integrations stay readable, none is added.",
    { status: 403, capability: MULTI_NIGHT_CAPABILITY },
  );

const projectNotFound = () =>
  new ProjectIntegrationError(
    "project_not_found",
    "The project was not found.",
    { status: 404 },
  );

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const LINE_KEYS = new Set([
  "nightId",
  "targetId",
  "filter",
  "exposureSeconds",
  "gain",
  "binning",
  "temperatureC",
  "frameCount",
  "eveningDate",
  "sensor",
  "computerLabel",
  "installationId",
]);

function text(value, label, max, { nullable = true } = {}) {
  if ((value === undefined || value === null) && nullable) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max)
    throw invalid(`${label} is a string of 1 to ${max} characters.`);
  return value;
}

function bounded(value, label, { min, max, integer = false, nullable }) {
  if ((value === undefined || value === null) && nullable) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < min ||
    value > max
  )
    throw invalid(
      `${label} is ${integer ? "an integer" : "a number"} from ${min} to ${max}.`,
    );
  return value;
}

/** One line of the body, checked against `$defs.write`. */
export function parseIntegrationLine(line, index = 0) {
  const where = `integrations[${index}]`;
  if (!line || typeof line !== "object" || Array.isArray(line))
    throw invalid(`${where} is an object.`);
  for (const key of Object.keys(line))
    if (!LINE_KEYS.has(key))
      throw invalid(`${where}: unexpected property "${key}".`);
  if (typeof line.nightId !== "string" || !uuidPattern.test(line.nightId))
    throw invalid(`${where}.nightId is a UUID.`);
  if (!("filter" in line)) throw invalid(`${where}.filter is required.`);
  if (
    typeof line.eveningDate !== "string" ||
    !datePattern.test(line.eveningDate) ||
    Number.isNaN(Date.parse(`${line.eveningDate}T12:00:00Z`))
  )
    throw invalid(`${where}.eveningDate is a date (YYYY-MM-DD).`);
  const exposureSeconds = bounded(
    line.exposureSeconds,
    `${where}.exposureSeconds`,
    { min: 0, max: 86400, nullable: false },
  );
  if (exposureSeconds <= 0)
    throw invalid(`${where}.exposureSeconds is above 0.`);
  return {
    nightId: line.nightId.toLowerCase(),
    targetId: text(line.targetId, `${where}.targetId`, 200, {
      nullable: false,
    }),
    filter: text(line.filter, `${where}.filter`, 40),
    exposureSeconds,
    gain: bounded(line.gain, `${where}.gain`, {
      min: -100000,
      max: 100000,
      integer: true,
      nullable: true,
    }),
    binning: bounded(line.binning, `${where}.binning`, {
      min: 1,
      max: 16,
      integer: true,
      nullable: true,
    }),
    temperatureC: bounded(line.temperatureC, `${where}.temperatureC`, {
      min: -100,
      max: 100,
      nullable: true,
    }),
    frameCount: bounded(line.frameCount, `${where}.frameCount`, {
      min: 1,
      max: 1_000_000,
      integer: true,
      nullable: false,
    }),
    eveningDate: line.eveningDate,
    sensor: text(line.sensor, `${where}.sensor`, 80),
    computerLabel: text(line.computerLabel, `${where}.computerLabel`, 80),
    installationId: text(line.installationId, `${where}.installationId`, 100),
  };
}

/** One set of the body's `replace`, checked against `$defs.set`. */
function parseReplaceSet(entry, index) {
  const where = `replace[${index}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry))
    throw invalid(`${where} is an object.`);
  for (const key of Object.keys(entry))
    if (key !== "nightId" && key !== "targetId")
      throw invalid(`${where}: unexpected property "${key}".`);
  if (typeof entry.nightId !== "string" || !uuidPattern.test(entry.nightId))
    throw invalid(`${where}.nightId is a UUID.`);
  return {
    nightId: entry.nightId.toLowerCase(),
    targetId: text(entry.targetId, `${where}.targetId`, 200, {
      nullable: false,
    }),
  };
}

/**
 * The body `{ integrations: [...], replace?: [...] }`: one to 200 lines; with
 * `replace`, the sets sent complete (1 to 200) and then 0 to 200 lines, each
 * inside one of the sets. Answers `{ lines, replace }`, `replace` empty for
 * the earlier form.
 */
export function parseIntegrationsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalid("The body is { integrations: [...] }.");
  for (const key of Object.keys(body))
    if (key !== "integrations" && key !== "replace")
      throw invalid(`Unexpected property "${key}".`);
  const { integrations } = body;
  const hasReplace = "replace" in body;
  if (
    !Array.isArray(integrations) ||
    integrations.length > MAX_LINES ||
    (integrations.length < 1 && !hasReplace)
  )
    throw invalid(
      `integrations holds ${hasReplace ? 0 : 1} to ${MAX_LINES} lines.`,
    );
  const lines = integrations.map(parseIntegrationLine);
  if (!hasReplace) return { lines, replace: [] };
  if (
    !Array.isArray(body.replace) ||
    body.replace.length < 1 ||
    body.replace.length > MAX_LINES
  )
    throw invalid(`replace holds 1 to ${MAX_LINES} sets.`);
  const replace = [];
  const seen = new Set();
  body.replace.map(parseReplaceSet).forEach((set, index) => {
    const key = JSON.stringify([set.nightId, set.targetId]);
    if (seen.has(key)) throw invalid(`replace[${index}] is listed twice.`);
    seen.add(key);
    replace.push(set);
  });
  lines.forEach((line, index) => {
    if (!seen.has(JSON.stringify([line.nightId, line.targetId])))
      throw invalid(
        `integrations[${index}] is not inside a set of replace (its night and target).`,
      );
  });
  return { lines, replace };
}

/**
 * The date of a night (`YYYY-MM-DD`, its evening): its plan's date when it
 * has one; otherwise the evening of its start, local noon to local noon at
 * the longitude (12:00 UTC − longitude / 15 h, never a time zone), the UTC
 * noon when no longitude is known.
 */
export function eveningDateOfNight({
  planDate = null,
  startedAt = null,
  longitude = null,
}) {
  if (typeof planDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(planDate))
    return planDate.slice(0, 10);
  const at = Date.parse(startedAt ?? "");
  if (!Number.isFinite(at)) return null;
  const shift = Number.isFinite(longitude) ? (longitude / 15) * 3_600_000 : 0;
  return new Date(at + shift - 12 * 3_600_000).toISOString().slice(0, 10);
}

/** What the routes answer: the lines, their totals, and the whole. */
function listBody(projectId, integrations) {
  const totalsByFilter = totalsByFilterOf(integrations);
  const sum = (key) =>
    Math.round(
      totalsByFilter.reduce((total, entry) => total + entry[key], 0) * 1000,
    ) / 1000;
  return {
    projectId,
    integrations,
    totalsByFilter,
    totalSeconds: sum("totalSeconds"),
    // What is still declared and what Astro Sync measured; they add up to
    // `totalSeconds`.
    declaredSeconds: sum("declaredSeconds"),
    measuredSeconds: sum("measuredSeconds"),
    nightCount: new Set(integrations.map((line) => line.nightId)).size,
  };
}

export async function createProjectIntegrationService({
  driver,
  dialect,
  multiNightActive = async () => false,
  repository = null,
  now,
} = {}) {
  const store =
    repository ||
    (await createProjectIntegrationRepository({
      driver,
      dialect,
      ...(now ? { now } : {}),
    }));

  async function requireProject(tenantId, projectId) {
    if (typeof projectId !== "string" || !uuidPattern.test(projectId))
      throw projectNotFound();
    const project = await store.project(tenantId, projectId);
    if (!project) throw projectNotFound();
    return project;
  }

  return {
    /** `GET /v1/projects/{projectId}/integrations`: never gated. */
    async list({ tenantId, projectId }) {
      await requireProject(tenantId, projectId);
      return listBody(projectId, await store.list(tenantId, projectId));
    },

    /**
     * What the project read alone adds (`GET /v1/projects/{projectId}`):
     * its integrations, their totals by filter and its image.
     */
    async projectExtras({ tenantId, projectId }) {
      const integrations = await store.list(tenantId, projectId);
      return {
        integrations,
        totalsByFilter: totalsByFilterOf(integrations),
        ...(await store.planCapture(tenantId, projectId)),
      };
    },

    /** `PUT /v1/projects/{projectId}/integrations`. */
    async put({ tenantId, userId, projectId, body }) {
      if (!(await multiNightActive(userId))) throw multiNightNotActive();
      const project = await requireProject(tenantId, projectId);
      const { lines, replace } = parseIntegrationsBody(body);
      const longitude = Number(project.place?.longitude);
      const checked = new Set();
      // Journal: the plan's own nights only.
      const requireNight = async (nightId) => {
        const night = await store.night(tenantId, nightId);
        if (!night)
          throw new ProjectIntegrationError(
            "session_not_found",
            "The night was not found.",
            { status: 404 },
          );
        if (!(await store.projectIdsOfNight(tenantId, nightId)).has(project.id))
          throw new ProjectIntegrationError(
            "integration_night_not_in_project",
            "This night does not belong to the multi-night plan.",
            { status: 409, nightId },
          );
        checked.add(nightId);
        return night;
      };
      for (const line of lines) {
        const night = await requireNight(line.nightId);
        const eveningDate = eveningDateOfNight({
          planDate: night.planDate,
          startedAt: night.startedAt,
          longitude: Number.isFinite(night.longitude)
            ? night.longitude
            : Number.isFinite(longitude)
              ? longitude
              : null,
        });
        if (eveningDate && eveningDate !== line.eveningDate)
          throw new ProjectIntegrationError(
            "integration_outside_night",
            `This integration is dated ${line.eveningDate}, its night is the night of ${eveningDate}.`,
            { status: 409, nightId: line.nightId, eveningDate },
          );
      }
      // A set sent without any line is checked as well: nothing is removed
      // from a night the plan does not own.
      for (const set of replace)
        if (!checked.has(set.nightId)) await requireNight(set.nightId);
      const { retiredNights } = await store.upsert(tenantId, projectId, lines, {
        keys: await store.keysOf(tenantId, projectId),
        replace,
      });
      // A night left without a measured line for a target declares again
      // what its debriefing says.
      for (const nightId of retiredNights)
        await store.writeDeclaredIntegrationsForSession(tenantId, nightId);
      return listBody(projectId, await store.list(tenantId, projectId));
    },
  };
}
