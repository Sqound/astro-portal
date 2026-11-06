import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";

/**
 * The body of `PUT /v1/projects/{projectId}` (`project.schema.json`,
 * `write`), checked and reduced to exactly the fields of the resource. A
 * body outside the contract is refused, never repaired, except the horizon
 * mask, written back on the planner's 36-point grid like every stored mask.
 */

export const PROJECT_STATUSES = Object.freeze([
  "active",
  "finished",
  "archived",
]);
export const WRITABLE_STATUSES = Object.freeze(["active", "finished"]);
export const GOAL_MINUTES_MIN = 30;
export const GOAL_MINUTES_MAX = 6000;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProjectValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectValidationError";
    this.code = "invalid_request";
    this.status = 400;
  }
}

const refuse = (message) => {
  throw new ProjectValidationError(message);
};

const plainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isUuid = (value) => typeof value === "string" && UUID.test(value);

function onlyKeys(value, allowed, label) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) refuse(`${label} does not accept "${key}".`);
}

function text(value, label, maximum) {
  if (typeof value !== "string") refuse(`${label} must be a string.`);
  const result = value.trim();
  if (!result || result.length > maximum)
    refuse(`${label} must have 1 to ${maximum} characters.`);
  return result;
}

function number(value, label, minimum, maximum) {
  if (typeof value !== "number" || !Number.isFinite(value))
    refuse(`${label} must be a number.`);
  if (value < minimum || value > maximum)
    refuse(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}

function target(value) {
  if (!plainObject(value)) refuse("A project needs a target.");
  onlyKeys(value, ["targetId", "framingId", "name", "commonName"], "target");
  const hasTarget = value.targetId !== undefined;
  const hasFraming = value.framingId !== undefined;
  if (hasTarget === hasFraming)
    refuse("A project's target names exactly one of targetId and framingId.");
  const result = {};
  if (hasTarget) result.targetId = text(value.targetId, "target.targetId", 200);
  if (hasFraming) {
    if (!isUuid(value.framingId)) refuse("target.framingId must be a UUID.");
    result.framingId = value.framingId;
  }
  result.name = text(value.name, "target.name", 300);
  if (value.commonName !== undefined)
    result.commonName = text(value.commonName, "target.commonName", 300);
  return result;
}

function horizonMask(value) {
  if (!plainObject(value) || !Array.isArray(value.points))
    refuse("place.horizonMask must be { enabled, points }.");
  if (typeof value.enabled !== "boolean")
    refuse("place.horizonMask.enabled must be a boolean.");
  for (const point of value.points)
    if (
      !plainObject(point) ||
      typeof point.azimuth !== "number" ||
      typeof point.altitude !== "number" ||
      !Number.isFinite(point.azimuth) ||
      !Number.isFinite(point.altitude)
    )
      refuse("place.horizonMask.points are { azimuth, altitude } numbers.");
  const mask = normaliseHorizonMask(value);
  return {
    enabled: mask.enabled,
    points: mask.points.map(({ azimuth, altitude }) => ({ azimuth, altitude })),
  };
}

function place(value) {
  if (!plainObject(value)) refuse("A project needs a place.");
  onlyKeys(
    value,
    ["name", "latitude", "longitude", "timeZone", "horizonMask"],
    "place",
  );
  const result = {
    name: text(value.name, "place.name", 300),
    latitude: number(value.latitude, "place.latitude", -90, 90),
    longitude: number(value.longitude, "place.longitude", -180, 180),
  };
  if (value.timeZone !== undefined)
    result.timeZone = text(value.timeZone, "place.timeZone", 100);
  if (value.horizonMask !== undefined)
    result.horizonMask = horizonMask(value.horizonMask);
  return result;
}

function constraints(value) {
  if (!plainObject(value)) refuse("A project needs its constraints.");
  onlyKeys(
    value,
    ["minAltitude", "moonSeparationMinimum", "moonSeparationMinimumByFilter"],
    "constraints",
  );
  const byFilter = value.moonSeparationMinimumByFilter;
  if (!plainObject(byFilter))
    refuse("constraints.moonSeparationMinimumByFilter must be an object.");
  const filters = Object.keys(byFilter);
  if (filters.length > 50)
    refuse("constraints.moonSeparationMinimumByFilter has too many filters.");
  return {
    minAltitude: number(value.minAltitude, "constraints.minAltitude", 0, 90),
    moonSeparationMinimum: number(
      value.moonSeparationMinimum,
      "constraints.moonSeparationMinimum",
      0,
      180,
    ),
    moonSeparationMinimumByFilter: Object.fromEntries(
      filters.map((filter) => {
        if (!filter.trim() || filter.length > 100)
          refuse("A filter name has 1 to 100 characters.");
        return [
          filter,
          number(
            byFilter[filter],
            `constraints.moonSeparationMinimumByFilter.${filter}`,
            0,
            180,
          ),
        ];
      }),
    ),
  };
}

/**
 * `{ status, fields }`: `status` is the written one (`null` when the body
 * names none), `fields` the resource's own content as it is stored.
 */
export function normalizeProjectWrite(body) {
  if (!plainObject(body)) refuse("A JSON project is required.");
  onlyKeys(
    body,
    ["status", "target", "goalMinutes", "place", "equipment", "constraints"],
    "A project",
  );
  let status = null;
  if (body.status !== undefined) {
    if (!WRITABLE_STATUSES.includes(body.status))
      refuse(
        body.status === "archived"
          ? "A project is archived by DELETE, never by a write."
          : "status must be active or finished.",
      );
    status = body.status;
  }
  if (
    !Number.isInteger(body.goalMinutes) ||
    body.goalMinutes < GOAL_MINUTES_MIN ||
    body.goalMinutes > GOAL_MINUTES_MAX
  )
    refuse(
      `goalMinutes must be a whole number from ${GOAL_MINUTES_MIN} to ${GOAL_MINUTES_MAX}.`,
    );
  if (!plainObject(body.equipment))
    refuse("equipment must be the plan's equipment object.");
  return {
    status,
    fields: {
      target: target(body.target),
      goalMinutes: body.goalMinutes,
      place: place(body.place),
      equipment: body.equipment,
      constraints: constraints(body.constraints),
    },
  };
}
