import { randomUUID } from "node:crypto";
import { publishChange } from "../api/change-bus.js";
import { calibrationValuesChanged } from "../calibration/refresh-hook.js";
import { normalizeKnownPlaceLink, placeKinds } from "../planner/state.js";
import { normalizeSkyEntered } from "../sky-brightness-source.js";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

/**
 * The places of
 * a space, a resource of their own read and written by `/v1/places`
 * (`packages/astro-contracts/schemas/api/place.schema.json`, `v1.md`,
 * « Places »). This repository is the only writer of `known_locations`
 * (migration 70: `edited_at`, `deleted_at`) and of `place_preferences` (the
 * default place); the whole-document save of the web planner no longer
 * writes them.
 *
 * The rule of the most recent edit, the place as one block: every write
 * carries `editedAt`, the instant of the person's gesture on the device,
 * capped at the service's clock + 5 minutes (a clock ahead wins for five
 * minutes at most, never for ever). The service keeps the most recent
 * gesture; an older or equal write is answered `applied: false` with what
 * the service keeps, never as an error. A deletion is soft (`deleted_at`,
 * the service's instant) and answers to the same rule through its own
 * instant (`?at=`, kept in `edited_at`): a later edit gives the place back.
 * A tombstone is kept 90 days after the deletion's instant, then purged; an
 * edit older than that never creates the place again.
 *
 * A place used by a plan to execute (`plans.location_json.id`, status
 * `active`) cannot be deleted (`place_in_use`);
 * the other plans keep their own copy of the place. At most 200 live places
 * per space. Each applied write publishes the existing `places` domain of
 * the change signal, after its transaction.
 */

export const PLACE_LIMIT = 200;
export const PLACE_CLOCK_CAP_MS = 5 * 60 * 1000;
export const PLACE_TOMBSTONE_DAYS = 90;
const TOMBSTONE_MS = PLACE_TOMBSTONE_DAYS * 24 * 60 * 60 * 1000;
export const PLACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
/** The static segments of `/v1/places/…`: never a place's identifier. */
export const RESERVED_PLACE_IDS = Object.freeze([
  "default",
  "extract",
  "import",
  "known",
  "resolve",
  "search",
  "suggested",
]);

export class PlaceStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlaceStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

const invalid = (message) => new PlaceStoreError("invalid_request", message);

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

const plain = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function requiredIdentifier(value, label) {
  const result = String(value ?? "").trim();
  if (!result) throw invalid(`${label} is required.`);
  return result;
}

const isoInstantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An RFC 3339 instant as the service writes it, or `null`. */
export function placeInstant(value) {
  if (typeof value !== "string" || !isoInstantPattern.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A place's identifier, or `invalid_request`. */
export function placeIdentifier(value) {
  const id = typeof value === "string" ? value : "";
  if (!PLACE_ID_PATTERN.test(id))
    throw invalid(
      "A place id of 1 to 120 letters, digits, « . », « _ », « : » or « - » is required.",
    );
  if (RESERVED_PLACE_IDS.includes(id))
    throw invalid(
      `« ${id} » is a segment of the places routes, not a place id.`,
    );
  return id;
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const elevationPattern = /^-?[0-9]+(\.[0-9]+)?$/;

function horizonMaskOf(value) {
  if (value === null || value === undefined) return null;
  if (
    !plain(value) ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.points) ||
    value.points.length !== 36
  )
    throw invalid(
      "A horizon mask is { enabled, points } with 36 points, one every 10° of azimuth.",
    );
  const points = value.points.map((point, index) => {
    const altitude = point?.altitude;
    if (
      !plain(point) ||
      point.azimuth !== index * 10 ||
      typeof altitude !== "number" ||
      !Number.isFinite(altitude) ||
      altitude < 0 ||
      altitude > 90
    )
      throw invalid(
        "A horizon mask's points run from azimuth 0 to 350 every 10°, each with an altitude from 0 to 90.",
      );
    // The instant the 10° sector was last surveyed,
    // or absent (« à relever »).
    const surveyedAt = point.surveyedAt;
    if (surveyedAt === null || surveyedAt === undefined)
      return { azimuth: index * 10, altitude };
    if (typeof surveyedAt !== "string" || !placeInstant(surveyedAt))
      throw invalid(
        "A horizon mask point's surveyedAt is an ISO 8601 instant, or absent.",
      );
    return {
      azimuth: index * 10,
      altitude,
      surveyedAt: placeInstant(surveyedAt),
    };
  });
  return { enabled: value.enabled, points };
}

const optionalText = (value, limit, label) => {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > limit)
    throw invalid(`${label} is a text of ${limit} characters at most.`);
  return value;
};

/**
 * The stored details of a place from the body of a write: the whole place,
 * one block. Unknown fields, `usage`, `createdAt` and `updatedAt` are
 * ignored; `editedAt` is required. Answers `{ details, editedAt }` (the
 * instant as written, before the cap).
 */
export function normalizePlaceWrite(body, placeId) {
  if (!plain(body)) throw invalid("A JSON place is required.");
  if (body.id !== undefined && body.id !== placeId)
    throw invalid("The place's id is the one of its path.");
  const name = body.name;
  if (typeof name !== "string" || !name.trim() || name.length > 100)
    throw invalid("A place name of 1 to 100 characters is required.");
  const coordinate = (value, bound, label) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < -bound ||
      value > bound
    )
      throw invalid(`${label} is a number from -${bound} to ${bound}.`);
    return value;
  };
  const latitude = coordinate(body.latitude, 90, "latitude");
  const longitude = coordinate(body.longitude, 180, "longitude");
  const locality = optionalText(body.locality, 200, "locality");
  const note = optionalText(body.note, 500, "note");
  let elevation;
  if (
    body.elevation !== null &&
    body.elevation !== undefined &&
    body.elevation !== ""
  ) {
    if (
      typeof body.elevation !== "string" ||
      !elevationPattern.test(body.elevation)
    )
      throw invalid("elevation is a decimal number written as a string.");
    elevation = body.elevation;
  }
  let timeZone;
  if (body.timeZone !== null && body.timeZone !== undefined) {
    if (
      typeof body.timeZone !== "string" ||
      !body.timeZone ||
      !validTimeZone(body.timeZone)
    )
      throw invalid("timeZone is an IANA time zone name, or absent.");
    timeZone = body.timeZone;
  }
  // Additive: « chosen » when the person picked the zone
  // themselves; a resolution never replaces it. Kept with a zone only.
  let timeZoneSource;
  if (body.timeZoneSource !== null && body.timeZoneSource !== undefined) {
    if (body.timeZoneSource !== "chosen")
      throw invalid("timeZoneSource is « chosen », or absent.");
    if (timeZone !== undefined) timeZoneSource = body.timeZoneSource;
  }
  const horizonMask = horizonMaskOf(body.horizonMask);
  let horizonStatus;
  if (body.horizonStatus !== null && body.horizonStatus !== undefined) {
    if (!["verified", "unverified"].includes(body.horizonStatus))
      throw invalid("horizonStatus is « verified » or « unverified ».");
    horizonStatus = body.horizonStatus;
  }
  let skyEntered;
  if (body.skyEntered !== null && body.skyEntered !== undefined) {
    skyEntered = normalizeSkyEntered(body.skyEntered);
    if (!skyEntered)
      throw invalid("skyEntered is { sqm from 14 to 22.5, enteredAt }.");
  }
  let kind;
  if (body.kind !== null && body.kind !== undefined) {
    if (!placeKinds.includes(body.kind))
      throw invalid(`kind is one of ${placeKinds.join(", ")}, or absent.`);
    kind = body.kind;
  }
  let knownPlace;
  if (body.knownPlace !== null && body.knownPlace !== undefined) {
    knownPlace = normalizeKnownPlaceLink(body.knownPlace);
    if (!knownPlace)
      throw invalid(
        "knownPlace is { source: « osm », id, type, linkedAt }, or absent.",
      );
  }
  const editedAt = placeInstant(body.editedAt);
  if (!editedAt)
    throw invalid("editedAt, the instant of the edit, is required.");
  const details = {
    id: placeId,
    name,
    ...(locality !== undefined ? { locality } : {}),
    latitude,
    longitude,
    ...(elevation !== undefined ? { elevation } : {}),
    ...(timeZone !== undefined ? { timeZone } : {}),
    ...(timeZoneSource !== undefined ? { timeZoneSource } : {}),
    horizonMask,
    ...(horizonStatus !== undefined ? { horizonStatus } : {}),
    ...(skyEntered ? { skyEntered } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(knownPlace ? { knownPlace } : {}),
    ...(note !== undefined ? { note } : {}),
  };
  return { details, editedAt };
}

/** The instant a write is kept at: its own, capped at the clock + 5 min. */
export function cappedPlaceInstant(editedAt, timestamp) {
  const cap = Date.parse(timestamp) + PLACE_CLOCK_CAP_MS;
  return Date.parse(editedAt) > cap ? new Date(cap).toISOString() : editedAt;
}

const finiteNumber = (value) => {
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * A stored place as the contract reads it. The details stored before the
 * migration (written by the whole-document save) carry their coordinates as
 * strings, an empty elevation and « UTC » for a missing time zone: the
 * coordinates are read as numbers, the empty elevation as absent. The
 * time zone is read as stored (dev data may be reset: no rewriting).
 */
function placeResourceFor(row, usage) {
  const details = parseJson(row.details_json, {}) || {};
  const latitude = finiteNumber(details.latitude);
  const longitude = finiteNumber(details.longitude);
  const pick = (key, test) =>
    details[key] !== undefined && details[key] !== null && test(details[key])
      ? { [key]: details[key] }
      : {};
  return {
    id: row.client_id,
    name: String(details.name ?? ""),
    ...pick("locality", (value) => typeof value === "string" && value !== ""),
    latitude: latitude ?? 0,
    longitude: longitude ?? 0,
    ...pick(
      "elevation",
      (value) => typeof value === "string" && elevationPattern.test(value),
    ),
    ...pick("timeZone", (value) => typeof value === "string" && value !== ""),
    ...pick("timeZoneSource", (value) => value === "chosen"),
    horizonMask: plain(details.horizonMask) ? details.horizonMask : null,
    ...pick("horizonStatus", (value) =>
      ["verified", "unverified"].includes(value),
    ),
    ...pick("skyEntered", plain),
    ...pick("kind", (value) => placeKinds.includes(value)),
    ...pick("knownPlace", plain),
    ...pick("note", (value) => typeof value === "string" && value !== ""),
    editedAt: row.edited_at || row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usage: usage || { pendingPlans: [], pastPlans: [] },
  };
}

// The API status spelling (never the stored "pending"), as the framings'
// repository spells it, without an import back onto the planner's store.
function apiPlanStatusFor(status) {
  const known = ["pending", "executed", "partial", "abandoned", "archived"];
  const stored = known.includes(status) ? status : "pending";
  return stored === "pending" ? "active" : stored;
}

/**
 * `{ placeId -> usage }` for the space: every plan not deleted whose copy
 * of the place (`location_json`) names it, in date order. `pendingPlans`
 * are the plans to execute (`active`), `pastPlans` every other one.
 */
async function usageByPlace(executor, tenantId) {
  const rows = (
    await executor.query(
      `SELECT id, name, plan_date, status, location_json FROM plans
       WHERE tenant_id = ? AND deleted_at IS NULL AND location_json IS NOT NULL
       ORDER BY plan_date, created_at, id`,
      [tenantId],
    )
  ).rows;
  const usage = new Map();
  for (const row of rows) {
    const placeId = parseJson(row.location_json)?.id;
    if (typeof placeId !== "string" || !placeId) continue;
    if (!usage.has(placeId))
      usage.set(placeId, { pendingPlans: [], pastPlans: [] });
    const status = apiPlanStatusFor(row.status);
    usage
      .get(placeId)
      [status === "active" ? "pendingPlans" : "pastPlans"].push({
        planId: row.id,
        name: row.name,
        planDate: row.plan_date || null,
        status,
      });
  }
  return usage;
}

async function placeRowFor(executor, tenantId, placeId) {
  return (
    (
      await executor.query(
        "SELECT * FROM known_locations WHERE tenant_id = ? AND client_id = ?",
        [tenantId, placeId],
      )
    ).rows[0] || null
  );
}

async function livePlaceCount(executor, tenantId) {
  return Number(
    (
      await executor.query(
        "SELECT COUNT(*) AS count FROM known_locations WHERE tenant_id = ? AND deleted_at IS NULL",
        [tenantId],
      )
    ).rows[0]?.count || 0,
  );
}

/** Removes the space's tombstones older than 90 days (their instant). */
async function purgeTombstones(executor, tenantId, timestamp) {
  const horizon = new Date(Date.parse(timestamp) - TOMBSTONE_MS).toISOString();
  await executor.run(
    "DELETE FROM known_locations WHERE tenant_id = ? AND deleted_at IS NOT NULL AND edited_at <= ?",
    [tenantId, horizon],
  );
}

const limitReached = () =>
  new PlaceStoreError(
    "place_limit_reached",
    `A space holds at most ${PLACE_LIMIT} places.`,
    { status: 409, limit: PLACE_LIMIT },
  );

const notFound = () =>
  new PlaceStoreError("place_not_found", "The place was not found.", {
    status: 404,
  });

async function defaultPreference(executor, tenantId) {
  return (
    (
      await executor.query(
        "SELECT default_place_id, edited_at FROM place_preferences WHERE tenant_id = ?",
        [tenantId],
      )
    ).rows[0] || null
  );
}

/**
 * The live places of a space, the most recently edited first, with their
 * usage — what `GET /v1/places` answers, and what the data export, the
 * debriefing and the other readers of the space's places read.
 */
export async function listLivePlaces(executor, tenantId) {
  const rows = (
    await executor.query(
      "SELECT * FROM known_locations WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY edited_at DESC, client_id",
      [tenantId],
    )
  ).rows;
  const usage = await usageByPlace(executor, tenantId);
  return rows.map((row) => placeResourceFor(row, usage.get(row.client_id)));
}

async function placeListFor(executor, tenantId) {
  const places = await listLivePlaces(executor, tenantId);
  const preference = await defaultPreference(executor, tenantId);
  const defaultLive =
    preference?.default_place_id &&
    places.some((place) => place.id === preference.default_place_id);
  return {
    places,
    defaultPlaceId: defaultLive ? preference.default_place_id : null,
    defaultPlaceEditedAt: preference?.edited_at || null,
  };
}

async function insertPlace(
  executor,
  { tenantId, placeId, details, editedAt, timestamp },
) {
  await executor.run(
    "INSERT INTO known_locations (id, tenant_id, client_id, details_json, created_at, updated_at, edited_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
    [
      randomUUID(),
      tenantId,
      placeId,
      JSON.stringify(details),
      timestamp,
      timestamp,
      editedAt,
    ],
  );
}

/**
 * Creates the places a space does not hold yet, each with its own id, and
 * never changes one it holds (live or deleted). For the import of a device's
 * places and for the services that bring places into a space (the import of
 * an archive). Answers `[{ id, created }]` in order; refuses the whole
 * batch when it would take the space beyond 200 places. Runs inside the
 * caller's transaction; publishes nothing.
 */
export async function importPlacesInto(
  executor,
  { tenantId, places, timestamp, limit = PLACE_LIMIT },
) {
  await purgeTombstones(executor, tenantId, timestamp);
  const imported = [];
  const creations = [];
  for (const { placeId, details, editedAt } of places) {
    const existing = await placeRowFor(executor, tenantId, placeId);
    const repeated = creations.some((entry) => entry.placeId === placeId);
    const created = !existing && !repeated;
    imported.push({ id: placeId, created });
    if (created)
      creations.push({
        placeId,
        details,
        editedAt: cappedPlaceInstant(editedAt, timestamp),
      });
  }
  if (
    creations.length &&
    limit !== null &&
    (await livePlaceCount(executor, tenantId)) + creations.length > limit
  )
    throw limitReached();
  for (const creation of creations)
    await insertPlace(executor, { tenantId, timestamp, ...creation });
  return imported;
}

/**
 * Methods:
 * - list({ tenantId }) → { places, defaultPlaceId, defaultPlaceEditedAt }
 * - get({ tenantId, placeId }) → place | null
 * - write({ tenantId, placeId, body, timestamp, … }) → { place, applied, created }
 * - remove({ tenantId, placeId, at, timestamp, … }) → { deleted, place? }
 * - setDefault({ tenantId, placeId, editedAt, timestamp, … }) → { defaultPlaceId, defaultPlaceEditedAt, applied }
 * - importPlaces({ tenantId, places, timestamp, … }) → { places, imported }
 */
export async function createPlaceRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  /** After a committed write that changed the space's places. */
  async function changed(tenantId, originClientInstanceId) {
    publishChange({ tenantId, domains: ["places"], originClientInstanceId });
    // A place may carry the sky value its person typed.
    await calibrationValuesChanged(tenantId);
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async list({ tenantId, timestamp = new Date().toISOString() }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      return await db.transaction(async (transaction) => {
        await purgeTombstones(transaction, normalizedTenantId, timestamp);
        return await placeListFor(transaction, normalizedTenantId);
      });
    },

    async get({ tenantId, placeId }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedPlaceId = requiredIdentifier(placeId, "Place id");
      return await db.transaction(async (transaction) => {
        const row = await placeRowFor(
          transaction,
          normalizedTenantId,
          normalizedPlaceId,
        );
        if (!row || row.deleted_at) return null;
        const usage = await usageByPlace(transaction, normalizedTenantId);
        return placeResourceFor(row, usage.get(row.client_id));
      });
    },

    /**
     * `PUT /v1/places/{placeId}`: creates (`created`), updates, or brings a
     * deleted place back when the write is more recent than what the
     * service keeps; otherwise answers `applied: false` with the place kept
     * (`null` when it stays deleted, or when no tombstone can judge an edit
     * older than 90 days).
     */
    async write({
      tenantId,
      placeId,
      body,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedPlaceId = placeIdentifier(placeId);
      const { details, editedAt: written } = normalizePlaceWrite(
        body,
        normalizedPlaceId,
      );
      const editedAt = cappedPlaceInstant(written, timestamp);
      const result = await db.transaction(async (transaction) => {
        await purgeTombstones(transaction, normalizedTenantId, timestamp);
        const current = await placeRowFor(
          transaction,
          normalizedTenantId,
          normalizedPlaceId,
        );
        const answer = async (row, applied, created = false) => {
          const usage = await usageByPlace(transaction, normalizedTenantId);
          return {
            applied,
            created,
            place: row ? placeResourceFor(row, usage.get(row.client_id)) : null,
          };
        };
        if (!current) {
          if (Date.parse(editedAt) <= Date.parse(timestamp) - TOMBSTONE_MS)
            return { applied: false, created: false, place: null };
          if (
            (await livePlaceCount(transaction, normalizedTenantId)) >=
            PLACE_LIMIT
          )
            throw limitReached();
          await insertPlace(transaction, {
            tenantId: normalizedTenantId,
            placeId: normalizedPlaceId,
            details,
            editedAt,
            timestamp,
          });
          return await answer(
            await placeRowFor(
              transaction,
              normalizedTenantId,
              normalizedPlaceId,
            ),
            true,
            true,
          );
        }
        const keptAt = Date.parse(current.edited_at || current.updated_at);
        if (!(Date.parse(editedAt) > keptAt))
          return current.deleted_at
            ? { applied: false, created: false, place: null }
            : await answer(current, false);
        if (
          current.deleted_at &&
          (await livePlaceCount(transaction, normalizedTenantId)) >= PLACE_LIMIT
        )
          throw limitReached();
        await transaction.run(
          "UPDATE known_locations SET details_json = ?, edited_at = ?, deleted_at = NULL, updated_at = ? WHERE id = ?",
          [JSON.stringify(details), editedAt, timestamp, current.id],
        );
        return await answer(
          await placeRowFor(transaction, normalizedTenantId, normalizedPlaceId),
          true,
        );
      });
      if (result.applied)
        await changed(normalizedTenantId, originClientInstanceId);
      return result;
    },

    /**
     * `DELETE /v1/places/{placeId}?at=`: soft deletion when the place was
     * not edited after `at` (the service's clock when absent), refused
     * while a plan to execute uses it.
     */
    async remove({
      tenantId,
      placeId,
      at = null,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedPlaceId = requiredIdentifier(placeId, "Place id");
      let deletedAt = timestamp;
      if (at !== null && at !== undefined && at !== "") {
        const instant = placeInstant(at);
        if (!instant)
          throw invalid(
            "at, the instant of the deletion, is an RFC 3339 instant.",
          );
        deletedAt = cappedPlaceInstant(instant, timestamp);
      }
      const result = await db.transaction(async (transaction) => {
        await purgeTombstones(transaction, normalizedTenantId, timestamp);
        const current = await placeRowFor(
          transaction,
          normalizedTenantId,
          normalizedPlaceId,
        );
        if (!current || current.deleted_at) throw notFound();
        const usage = (await usageByPlace(transaction, normalizedTenantId)).get(
          current.client_id,
        );
        if (
          Date.parse(current.edited_at || current.updated_at) >
          Date.parse(deletedAt)
        )
          return { deleted: false, place: placeResourceFor(current, usage) };
        if (usage?.pendingPlans.length)
          throw new PlaceStoreError(
            "place_in_use",
            "This place is used by plans to execute; change their place or delete them first.",
            { status: 409, pendingPlans: usage.pendingPlans },
          );
        await transaction.run(
          "UPDATE known_locations SET deleted_at = ?, edited_at = ?, updated_at = ? WHERE id = ?",
          [timestamp, deletedAt, timestamp, current.id],
        );
        return { deleted: true };
      });
      if (result.deleted)
        await changed(normalizedTenantId, originClientInstanceId);
      return result;
    },

    /** `PUT /v1/places/default`: the space's default place, same rule. */
    async setDefault({
      tenantId,
      placeId,
      editedAt,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      if (placeId !== null && typeof placeId !== "string")
        throw invalid("placeId is a place's id, or null.");
      const written = placeInstant(editedAt);
      if (!written)
        throw invalid("editedAt, the instant of the choice, is required.");
      const instant = cappedPlaceInstant(written, timestamp);
      const result = await db.transaction(async (transaction) => {
        if (placeId !== null) {
          const row = await placeRowFor(
            transaction,
            normalizedTenantId,
            placeId,
          );
          if (!row || row.deleted_at) throw notFound();
        }
        const current = await defaultPreference(
          transaction,
          normalizedTenantId,
        );
        const applied =
          !current || Date.parse(instant) > Date.parse(current.edited_at);
        if (applied)
          await transaction.run(
            `INSERT INTO place_preferences (tenant_id, default_place_id, edited_at, updated_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(tenant_id) DO UPDATE SET default_place_id = excluded.default_place_id,
               edited_at = excluded.edited_at, updated_at = excluded.updated_at`,
            [normalizedTenantId, placeId, instant, timestamp],
          );
        const list = await placeListFor(transaction, normalizedTenantId);
        return {
          defaultPlaceId: list.defaultPlaceId,
          defaultPlaceEditedAt: list.defaultPlaceEditedAt,
          applied,
        };
      });
      if (result.applied)
        await changed(normalizedTenantId, originClientInstanceId);
      return result;
    },

    /**
     * `POST /v1/places/import`: what a device or a browser kept without a
     * space, sent once. Idempotent: an id the space holds is never changed.
     */
    async importPlaces({
      tenantId,
      places,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      if (!Array.isArray(places))
        throw invalid("places, the list of the places to import, is required.");
      if (places.length > PLACE_LIMIT)
        throw invalid(`At most ${PLACE_LIMIT} places are imported at once.`);
      const seen = new Set();
      const writes = places.map((body) => {
        const placeId = placeIdentifier(plain(body) ? body.id : undefined);
        if (seen.has(placeId))
          throw invalid("Each imported place is sent once.");
        seen.add(placeId);
        const { details, editedAt } = normalizePlaceWrite(body, placeId);
        return { placeId, details, editedAt };
      });
      const result = await db.transaction(async (transaction) => {
        const imported = await importPlacesInto(transaction, {
          tenantId: normalizedTenantId,
          places: writes,
          timestamp,
        });
        const list = await placeListFor(transaction, normalizedTenantId);
        return { places: list.places, imported };
      });
      if (result.imported.some((entry) => entry.created))
        await changed(normalizedTenantId, originClientInstanceId);
      return result;
    },
  };
}
