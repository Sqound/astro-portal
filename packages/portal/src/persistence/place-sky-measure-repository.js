import { randomUUID } from "node:crypto";
import { longitudeOffsetMinutes } from "astro-core/night-window.js";
import { publishChange } from "../api/change-bus.js";
import { calibrationValuesChanged } from "../calibration/refresh-hook.js";
import { placeCoordinates, placeDistanceKm } from "../planner/state.js";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

/**
 * The sky background Astro Sync measured on the observer's own solved
 * frames, one value per account, place and night
 * (`packages/astro-contracts/schemas/api/place-sky-measure.schema.json`,
 * table `place_sky_measures`, migration 47). Free: no capability is read
 * here, and the analysis upload (`analysis.logs`) is a different route.
 *
 * What comes in is the night's one number and its evidence — the median in
 * mag/arcsec², the number of poses, the method version, the median instant
 * — with the session it was measured for, and the place of the frames.
 * Never an image. The place and the night are the service's to decide:
 *
 * - a session with a plan: the plan's night (`plans.plan_date`) and the
 *   plan's place (its `id` among the account's places, else the account's
 *   place within 500 m of its position);
 * - a direct session, no session, or a plan without a known place: the
 *   account's place within 500 m of the frames' site — the rule of
 *  « déjà dans vos lieux » — and the night of the
 *   median instant at that place's longitude: the date of
 *   `UTC + round(longitude / 15) h − 12 h`, the rule of a place without a
 *   time zone (`longitudeOffsetMinutes`, astro-core).
 *
 * No place within 500 m: `422 place_not_found`, nothing stored. The frames'
 * site is used to find the place and never kept. A later upload for the
 * same place and night replaces the earlier one.
 */

/** A measure is attached to the account's place within this distance. */
export const PLACE_SKY_MEASURE_SAME_PLACE_KM = 0.5;
/** The plausible range of a sky background, mag/arcsec². */
export const PLACE_SKY_MEASURE_SQM_MIN = 10;
export const PLACE_SKY_MEASURE_SQM_MAX = 25;
export const PLACE_SKY_MEASURE_POSES_MAX = 100_000;
const METHOD_VERSION_PATTERN = /^astro-sync-sky\/[1-9][0-9]{0,5}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_FIELDS = new Set([
  "sessionId",
  "site",
  "observedAt",
  "sqm",
  "poseCount",
  "methodVersion",
]);

const now = () => new Date().toISOString();

/** An error the route answers as it is (`{ error: { code, message } }`). */
export class PlaceSkyMeasureError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "PlaceSkyMeasureError";
    this.code = code;
    this.status = status;
  }
}

const invalid = (message) =>
  new PlaceSkyMeasureError("invalid_request", message, 400);

/**
 * The body of `POST /v1/place-sky-measures`, checked field by field. Any
 * field beyond the six of the contract is refused: the route takes one
 * number per night, and nothing else rides along.
 */
export function validatePlaceSkyMeasureUpload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw invalid("A JSON sky measure is required.");
  for (const key of Object.keys(body))
    if (!UPLOAD_FIELDS.has(key)) throw invalid(`Unknown field: ${key}.`);
  const sqm = body.sqm;
  if (
    typeof sqm !== "number" ||
    !Number.isFinite(sqm) ||
    sqm < PLACE_SKY_MEASURE_SQM_MIN ||
    sqm > PLACE_SKY_MEASURE_SQM_MAX
  )
    throw invalid(
      `sqm must be a number of mag/arcsec² between ${PLACE_SKY_MEASURE_SQM_MIN} and ${PLACE_SKY_MEASURE_SQM_MAX}.`,
    );
  const poseCount = body.poseCount;
  if (
    !Number.isInteger(poseCount) ||
    poseCount < 1 ||
    poseCount > PLACE_SKY_MEASURE_POSES_MAX
  )
    throw invalid("poseCount must be a positive integer.");
  if (
    typeof body.methodVersion !== "string" ||
    !METHOD_VERSION_PATTERN.test(body.methodVersion)
  )
    throw invalid("methodVersion must name the method (astro-sync-sky/1).");
  const observedMillis =
    typeof body.observedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(
      body.observedAt,
    )
      ? Date.parse(body.observedAt)
      : Number.NaN;
  if (!Number.isFinite(observedMillis))
    throw invalid("observedAt must be an ISO 8601 instant.");
  let sessionId = null;
  if (body.sessionId !== undefined && body.sessionId !== null) {
    if (
      typeof body.sessionId !== "string" ||
      !UUID_PATTERN.test(body.sessionId)
    )
      throw invalid("sessionId must be a session identifier.");
    sessionId = body.sessionId.toLowerCase();
  }
  let site = null;
  if (body.site !== undefined && body.site !== null) {
    const keys =
      typeof body.site === "object" && !Array.isArray(body.site)
        ? Object.keys(body.site)
        : null;
    site =
      keys &&
      keys.every((key) => key === "latitude" || key === "longitude") &&
      typeof body.site.latitude === "number" &&
      typeof body.site.longitude === "number"
        ? placeCoordinates(body.site)
        : null;
    if (!site)
      throw invalid("site must be { latitude, longitude } in degrees.");
  }
  if (!sessionId && !site)
    throw invalid("A session or the frames' site is required.");
  return {
    sessionId,
    site,
    observedAt: new Date(observedMillis).toISOString(),
    sqm: Math.round(sqm * 100) / 100,
    poseCount,
    methodVersion: body.methodVersion,
  };
}

/**
 * The night an instant belongs to at a longitude: the date of
 * `UTC + round(longitude / 15) h − 12 h` (Astro Sync's `sky_night::night_of`).
 */
export function nightOfInstant(isoInstant, longitude) {
  const millis =
    Date.parse(isoInstant) +
    (longitudeOffsetMinutes(Number(longitude)) - 12 * 60) * 60_000;
  return new Date(millis).toISOString().slice(0, 10);
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

function toMeasure(row) {
  return {
    placeId: row.place_id,
    night: row.night,
    sqm: Number(row.sqm),
    poseCount: Number(row.pose_count),
    methodVersion: row.method_version,
    observedAt: row.observed_at,
    sessionId: row.session_id || null,
    updatedAt: row.updated_at,
  };
}

/**
 * The account's place a position belongs to: the nearest within 500 m, or
 * `null`. `places` are `{ clientId, details }` rows of `known_locations`.
 */
export function nearestPlace(places, position) {
  let best = null;
  for (const place of places) {
    const distance = placeDistanceKm(place.details, position);
    if (
      distance !== null &&
      distance <= PLACE_SKY_MEASURE_SAME_PLACE_KM &&
      (!best || distance < best.distance)
    )
      best = { place, distance };
  }
  return best?.place ?? null;
}

/**
 * Methods:
 * - record({ tenantId, upload, originClientInstanceId }) → { measure, replaced }
 * - list({ tenantId, placeId }) → { places: [{ placeId, measures }] }
 */
export async function createPlaceSkyMeasureRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  async function accountPlaces(tenantId) {
    return (
      await db.query(
        "SELECT client_id, details_json FROM known_locations WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY client_id",
        [tenantId],
      )
    ).rows
      .map((row) => ({
        clientId: row.client_id,
        details: parseJson(row.details_json),
      }))
      .filter((place) => placeCoordinates(place.details));
  }

  /** The session's plan night and place, or what the frames give. */
  async function resolvePlaceAndNight(tenantId, upload) {
    const places = await accountPlaces(tenantId);
    let planNight = null;
    let place = null;
    if (upload.sessionId) {
      const session = (
        await db.query(
          "SELECT id, plan_id FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
          [upload.sessionId, tenantId],
        )
      ).rows[0];
      if (!session)
        throw new PlaceSkyMeasureError(
          "session_not_found",
          "The session was not found.",
          404,
        );
      const plan = session.plan_id
        ? (
            await db.query(
              "SELECT plan_date, location_json FROM plans WHERE id = ? AND tenant_id = ?",
              [session.plan_id, tenantId],
            )
          ).rows[0]
        : null;
      if (plan) {
        planNight = plan.plan_date || null;
        const location = parseJson(plan.location_json);
        place =
          (location?.id &&
            places.find((known) => known.clientId === String(location.id))) ||
          (placeCoordinates(location) && nearestPlace(places, location)) ||
          null;
      }
    }
    if (!place && upload.site) place = nearestPlace(places, upload.site);
    if (!place)
      throw new PlaceSkyMeasureError(
        "place_not_found",
        "No place of this account is within 500 m of the frames.",
        422,
      );
    const longitude = placeCoordinates(place.details).longitude;
    return {
      placeId: place.clientId,
      night: planNight || nightOfInstant(upload.observedAt, longitude),
    };
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async record({ tenantId, upload, originClientInstanceId = null }) {
      const { placeId, night } = await resolvePlaceAndNight(tenantId, upload);
      const timestamp = now();
      const replaced = await db.transaction(async (tx) => {
        const existing = (
          await tx.query(
            "SELECT id FROM place_sky_measures WHERE tenant_id = ? AND place_id = ? AND night = ?",
            [tenantId, placeId, night],
          )
        ).rows[0];
        await tx.run(
          `INSERT INTO place_sky_measures
             (id, tenant_id, place_id, night, sqm, pose_count, method_version, observed_at, session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, place_id, night) DO UPDATE SET
             sqm = excluded.sqm,
             pose_count = excluded.pose_count,
             method_version = excluded.method_version,
             observed_at = excluded.observed_at,
             session_id = excluded.session_id,
             updated_at = excluded.updated_at`,
          [
            randomUUID(),
            tenantId,
            placeId,
            night,
            upload.sqm,
            upload.poseCount,
            upload.methodVersion,
            upload.observedAt,
            upload.sessionId,
            timestamp,
            timestamp,
          ],
        );
        return Boolean(existing);
      });
      // The account's other devices read their places again: a measured
      // value is shown with the place.
      publishChange({ tenantId, domains: ["places"], originClientInstanceId });
      // The project's calibration set, when the space consented: the
      // night's value is kept, or replaces its row.
      await calibrationValuesChanged(tenantId);
      return {
        measure: {
          placeId,
          night,
          sqm: upload.sqm,
          poseCount: upload.poseCount,
          methodVersion: upload.methodVersion,
          observedAt: upload.observedAt,
          sessionId: upload.sessionId,
          updatedAt: timestamp,
        },
        replaced,
      };
    },

    async list({ tenantId, placeId = null }) {
      const rows = (
        await db.query(
          placeId
            ? "SELECT * FROM place_sky_measures WHERE tenant_id = ? AND place_id = ? ORDER BY place_id, night DESC"
            : "SELECT * FROM place_sky_measures WHERE tenant_id = ? ORDER BY place_id, night DESC",
          placeId ? [tenantId, placeId] : [tenantId],
        )
      ).rows;
      const places = [];
      for (const row of rows) {
        const measure = toMeasure(row);
        const { placeId: id, ...night } = measure;
        const last = places[places.length - 1];
        if (last?.placeId === id) last.measures.push(night);
        else places.push({ placeId: id, measures: [night] });
      }
      return { places };
    },
  };
}
