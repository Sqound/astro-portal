import { randomUUID } from "node:crypto";
import {
  pendingPlanPermission,
  planStatusCountsTowardNight,
} from "../capabilities/provider.js";
import { astronomicalNightWindow } from "astro-core/night-window.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import {
  migratePlannerState,
  normalizeKnownPlaceLink,
  placeFingerprint,
  repairPlannerDocument,
  validatePlannerDocument,
} from "portal/planner/state.js";
import { normalizeSkyEntered } from "portal/sky-brightness-source.js";
import {
  normalizePlanAcquisition,
  planAcquisitionRefusal,
} from "portal/planner/plan-acquisition.js";
import {
  mergePlanFields,
  planFieldSideLocal,
  planFieldSideOther,
} from "portal/planner/plan-fields.js";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { publishChange } from "../api/change-bus.js";
import { calibrationValuesChanged } from "../calibration/refresh-hook.js";
import { purgeAtOf } from "../sessions/session-grace.js";
import { erasePlanRows } from "./trash-erasure.js";
import {
  loadFramingHydrationRecords,
  missingFramingIds,
  planHasFramings,
  replacePlanFramings,
} from "./framing-repository.js";
import {
  checkPlanProjectLinks,
  followPlanProjectLinks,
  withoutProjectLinks,
} from "./plan-project-links.js";
import {
  dehydratePlanItems,
  hydratePlanItems,
  referencedFramingIds,
} from "./plan-framing-hydration.js";
import {
  DEBRIEF_PLAN_OUTCOMES,
  executionStatesForPlanRows,
  sessionFlagsForPlanRows,
} from "./plan-session-flags.js";

const now = () => new Date().toISOString();

// Every served plan payload is hydrated on the way out, regardless of which
// route reads it. `driver` may be the process-owned `db` (a plain read,
// outside any transaction — safe, since hydration never needs the write's
// own snapshot) or a `transaction` object mid-write (both implement the
// same query/run interface).
export async function hydratedPayloadVia(driver, tenantId, payload) {
  if (!plainObject(payload) || !Array.isArray(payload.items)) return payload;
  const framingIds = referencedFramingIds(payload.items);
  if (framingIds.length === 0) return payload;
  const records = await loadFramingHydrationRecords(
    driver,
    tenantId,
    framingIds,
  );
  return { ...payload, items: hydratePlanItems(payload.items, records) };
}

// The one dehydrate-then-check step EVERY plan write runs on its items
// before they are ever stored — shared by `writePlanResource` (the v1
// single-plan route) and `savePlannerState` (the web's full-document save),
// so a plan written through either surface is dehydrated the same way and
// refused the same way when it names a `framingId` this tenant's framing
// library does not have. Dehydration itself is pure; only the
// missing-framing lookup touches the database, in the caller's own
// transaction (never a plan write's own row work — this runs before any of
// it, so a refusal here writes nothing at all).
async function dehydrateAndCheckFramings(transaction, tenantId, items) {
  const dehydratedItems = dehydratePlanItems(items);
  const framingIds = referencedFramingIds(dehydratedItems);
  const missing = framingIds.length
    ? await missingFramingIds(transaction, tenantId, framingIds)
    : [];
  return { items: dehydratedItems, framingIds, missingFramingIds: missing };
}

async function hydrateResultPayloads(driver, tenantId, result) {
  if (!result) return result;
  if (result.resource)
    result.resource = {
      ...result.resource,
      payload: await hydratedPayloadVia(
        driver,
        tenantId,
        result.resource.payload,
      ),
    };
  if (result.serverPayload)
    result.serverPayload = await hydratedPayloadVia(
      driver,
      tenantId,
      result.serverPayload,
    );
  return result;
}

// Exported: shared with debrief-repository.js, which reads/writes the same
// `plans`/`plan_versions` rows from its own single transaction and must not
// diverge from this module's own reading of them.
export function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// A plan resource revision must represent its JSON content rather than the
// property order chosen by a browser serializer. Arrays deliberately retain
// their stored order: target order is part of a plan.
function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

function canonicalJsonFromString(value, project = (payload) => payload) {
  try {
    return canonicalJson(project(JSON.parse(value)));
  } catch {
    return null;
  }
}

function identifier(value, fallback) {
  const result = String(value || "").trim();
  return result && result.length <= 200 ? result : fallback;
}

// Exported for the portable plan-lifecycle contract (fixtures/plan-lifecycle.json):
// an unrecognized stored status must fall back to "pending" rather than reject.
// "partial" is the debrief's own addition (api/v1.md's debrief outcome of the
// same name; plan.schema.json's resource.status already lists it).
export function plannerPlanStatus(value) {
  return ["pending", "executed", "partial", "abandoned", "archived"].includes(
    value,
  )
    ? value
    : "pending";
}

function plannerPayloadFor(plan, items) {
  // The state an archived plan had is the service's (or the device's, beside
  // its `closedAs`), never a copy that lingers in the settings.
  const parsed = parseJson(plan.settings_json, {});
  const stored = plainObject(parsed) ? parsed : {};
  const { archivedFrom: _settingsArchivedFrom, ...settings } = stored;
  const archivedFrom = archivedFromOfPlanRow(plan, stored);
  // The acquisition lines are read as kept: what the reading does not
  // understand is discarded (`plan-acquisition.js`).
  return normalizePlanAcquisition({
    ...settings,
    // The browser's durable identity stays in the payload. A v1 resource
    // exposes the server UUID separately.
    id: plan.client_id,
    date: plan.plan_date,
    name: plan.name,
    location: parseJson(plan.location_json),
    equipment: parseJson(plan.equipment_json),
    minAltitude: plan.min_altitude,
    status: plannerPlanStatus(plan.status),
    archivedAt: plan.archived_at || null,
    // Additive, read-only (absent unless the plan is archived from a closed
    // night): « Abandonné » then « Archivé » on the library's card.
    ...(archivedFrom ? { archivedFrom } : {}),
    // Round-tripped by the browser: a later `PUT /api/plans` carries it
    // back as the revision this copy is based on, which is how
    // `savePlannerState` tells a stale full-document save from a fresh one.
    // Placed after the settings spread so a value that lingers inside an
    // older `settings_json` blob (this same field, persisted redundantly
    // like every other column-backed one here) never wins over the current
    // stored revision.
    revision: planRevision(plan.revision),
    items,
  });
}

export function planRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision > 0 ? revision : 1;
}

function plannerCoordinate(value, minimum, maximum) {
  // Avoid Number("") === 0: an omitted coordinate is not a location.
  if (typeof value === "string" && !value.trim()) return null;
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) return null;
  if (coordinate < minimum || coordinate > maximum) return null;
  return coordinate;
}

// A stored mask as the planner reads it (one point every 10°, a mask on the
// former 30° grid read onto it), or null when there is nothing to keep: no
// profile and not switched on.
function storedHorizonMask(value) {
  if (!value || typeof value !== "object") return null;
  const mask = normaliseHorizonMask(value);
  const hasProfile = mask.points.some((point) => point.altitude > 0);
  if (!mask.enabled && !hasProfile) return null;
  return mask;
}

function knownPlannerLocation(value) {
  const latitude = plannerCoordinate(value?.latitude, -90, 90);
  const longitude = plannerCoordinate(value?.longitude, -180, 180);
  // Earlier clients turned two blank fields into 0,0. This portal has no
  // observing site there, so exclude that legacy null-island placeholder.
  if (
    latitude === null ||
    longitude === null ||
    (latitude === 0 && longitude === 0)
  )
    return null;
  const horizonMask = storedHorizonMask(value?.horizonMask);
  // The link to a known place is kept, normalised; the known place's own
  // details never are.
  const knownPlace = normalizeKnownPlaceLink(value?.knownPlace);
  // The sky background the observer typed, normalised.
  const skyEntered = normalizeSkyEntered(value?.skyEntered);
  return {
    ...(value.id ? { id: String(value.id) } : {}),
    ...(value.version ? { version: Number(value.version) } : {}),
    ...(value.locality ? { locality: String(value.locality) } : {}),
    ...(value.horizonStatus
      ? { horizonStatus: String(value.horizonStatus) }
      : {}),
    name: String(value?.name || "").trim(),
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    // Unknown stays empty: it is not "0" (a real zero is the string "0").
    elevation: String(value?.elevation ?? ""),
    timeZone: String(value?.timeZone || "UTC"),
    ...(horizonMask ? { horizonMask } : {}),
    ...(knownPlace ? { knownPlace } : {}),
    ...(skyEntered ? { skyEntered } : {}),
  };
}

// Truncated to the whole second (astro-contracts/schemas/api/v1.md, "The
// night boundaries of a plan"): a patch-level change in the ephemeris
// library must not move a stored boundary by a millisecond, and with it a
// generated session-event identifier (see the initial-event mapping, which
// anchors every emitted event's id on nightStartAt).
function truncatedToWholeSecond(isoInstant) {
  const parsed = new Date(isoInstant);
  return new Date(Math.floor(parsed.getTime() / 1000) * 1000).toISOString();
}

const nightBoundsCache = new Map();
const nightBoundsCacheLimit = 500;

/**
 * The server's own reading of "The night boundaries of a plan"
 * (astro-contracts/schemas/api/v1.md): both null together whenever the
 * payload names no usable place — knownPlannerLocation already excludes an
 * absent/invalid location and the legacy 0,0 null-island placeholder — or
 * the Sun never crosses astronomical twilight (-18 degrees) that night
 * (polar summer/winter; astronomicalNightWindow itself returns null rather
 * than substituting the planner's own noon-to-noon fallback, which is a
 * caller decision this server deliberately does not make). Memoized: a
 * tenant's plans, and the lazy debrief-queue catch-up below, frequently
 * repeat the same (date, place) pair, and the search is not free.
 */
function deriveNightBounds(payload) {
  const location = knownPlannerLocation(payload?.location);
  if (!location) return { nightStartAt: null, nightEndAt: null };
  const cacheKey = JSON.stringify([
    payload?.date,
    location.latitude,
    location.longitude,
    location.elevation,
    location.timeZone,
  ]);
  const cached = nightBoundsCache.get(cacheKey);
  if (cached) return cached;
  const window = astronomicalNightWindow({
    date: payload?.date,
    latitude: location.latitude,
    longitude: location.longitude,
    elevation: location.elevation,
    timeZone: location.timeZone,
  });
  const result = window
    ? {
        nightStartAt: truncatedToWholeSecond(window.start),
        nightEndAt: truncatedToWholeSecond(window.end),
      }
    : { nightStartAt: null, nightEndAt: null };
  nightBoundsCache.set(cacheKey, result);
  if (nightBoundsCache.size > nightBoundsCacheLimit)
    nightBoundsCache.delete(nightBoundsCache.keys().next().value);
  return result;
}

function plannerHorizonProfile(value, index = 0) {
  const id = identifier(value?.id, `horizon-profile-${index + 1}`);
  const name = identifier(value?.name, "");
  const location = knownPlannerLocation(value?.location);
  const mask = storedHorizonMask(value?.mask || value?.horizonMask);
  if (!name || !location || !mask) return null;
  return { id, name, location, mask: { ...mask, enabled: true } };
}

function plannerHorizonProfiles(values) {
  const seen = new Set();
  return values
    .map(plannerHorizonProfile)
    .filter(Boolean)
    .filter((profile) => {
      if (seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    });
}

async function audit(driver, { tenantId, userId, eventType, details }) {
  await driver.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId,
      eventType,
      details ? JSON.stringify(details) : null,
      now(),
    ],
  );
}

async function plannerRowsWithItems(
  driver,
  tenantId,
  { planIds = null, onlyMissingPayloads = false } = {},
) {
  const ids = planIds ? [...new Set(planIds)] : null;
  if (ids && !ids.length) return { itemsByPlanId: new Map(), planRows: [] };
  // A plan deleted through the v1 protocol leaves the legacy whole document
  // as well: both protocols read the same rows.
  const clauses = ["tenant_id = ?", "deleted_at IS NULL"];
  const params = [tenantId];
  if (ids) {
    clauses.push(`id IN (${ids.map(() => "?").join(", ")})`);
    params.push(...ids);
  }
  if (onlyMissingPayloads) clauses.push("payload_json IS NULL");
  const planRows = (
    await driver.query(
      `SELECT * FROM plans WHERE ${clauses.join(" AND ")}
       ORDER BY plan_date, created_at, client_id`,
      params,
    )
  ).rows;
  const planIdsForRows = planRows.map((plan) => plan.id);
  const itemsByPlanId = new Map(planIdsForRows.map((id) => [id, []]));
  if (planIdsForRows.length) {
    const placeholders = planIdsForRows.map(() => "?").join(", ");
    const itemRows = (
      await driver.query(
        `SELECT plan_id, details_json FROM plan_items
         WHERE plan_id IN (${placeholders})
         ORDER BY plan_id, created_at, client_id`,
        planIdsForRows,
      )
    ).rows;
    for (const item of itemRows)
      itemsByPlanId.get(item.plan_id)?.push(parseJson(item.details_json, {}));
  }
  return { itemsByPlanId, planRows };
}

export async function archivePlannerPayload(
  driver,
  { tenantId, plan, payloadJson, timestamp },
) {
  const versionId = randomUUID();
  await driver.run(
    "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, origin_device_id, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      versionId,
      tenantId,
      plan.id,
      planRevision(plan.revision),
      "history",
      null,
      payloadJson,
      timestamp,
      null,
    ],
  );
  return versionId;
}

/**
 * Fills the stored representation of plans that predate the column. This
 * is intentionally application-level rather than SQL JSON aggregation: it
 * shares the exact item ordering and projection used by the web planner on
 * SQLite and PostgreSQL.
 */
async function backfillPlannerPayloadsFor(driver, tenantId) {
  const { planRows, itemsByPlanId } = await plannerRowsWithItems(
    driver,
    tenantId,
    { onlyMissingPayloads: true },
  );
  let backfilled = 0;
  for (const plan of planRows) {
    const payloadJson = canonicalJson(
      plannerPayloadFor(plan, itemsByPlanId.get(plan.id) || []),
    );
    const result = await driver.run(
      "UPDATE plans SET payload_json = ? WHERE id = ? AND tenant_id = ? AND payload_json IS NULL",
      [payloadJson, plan.id, tenantId],
    );
    backfilled += result.rowCount;
  }
  return backfilled;
}

async function backfillAllPlannerPayloadsFor(driver) {
  const tenants = (
    await driver.query(
      "SELECT DISTINCT tenant_id FROM plans WHERE payload_json IS NULL ORDER BY tenant_id",
    )
  ).rows;
  let backfilled = 0;
  for (const tenant of tenants)
    backfilled += await backfillPlannerPayloadsFor(driver, tenant.tenant_id);
  return backfilled;
}

/** Refreshes payload/revision after the legacy whole-document writer. */
async function refreshPlannerPayloadsFor(
  driver,
  { tenantId, planIds, timestamp },
) {
  const { planRows, itemsByPlanId } = await plannerRowsWithItems(
    driver,
    tenantId,
    { planIds },
  );
  for (const plan of planRows) {
    const payloadJson = canonicalJson(
      plannerPayloadFor(plan, itemsByPlanId.get(plan.id) || []),
    );
    const previousPayload = plan.payload_json;
    if (previousPayload === null || previousPayload === undefined) {
      await driver.run(
        "UPDATE plans SET payload_json = ? WHERE id = ? AND tenant_id = ?",
        [payloadJson, plan.id, tenantId],
      );
      continue;
    }
    // The stored copy names the revision it was written at, one behind the
    // row once it was bumped: only the content decides.
    if (
      canonicalJsonFromString(previousPayload, withoutRevision) ===
      canonicalJsonFromString(payloadJson, withoutRevision)
    ) {
      // Normalize a noncanonical legacy representation without fabricating a
      // resource revision or a conflict.
      if (previousPayload !== payloadJson)
        await driver.run(
          "UPDATE plans SET payload_json = ? WHERE id = ? AND tenant_id = ?",
          [payloadJson, plan.id, tenantId],
        );
      continue;
    }
    await archivePlannerPayload(driver, {
      tenantId,
      plan,
      payloadJson: previousPayload,
      timestamp,
    });
    await driver.run(
      "UPDATE plans SET payload_json = ?, revision = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
      [
        payloadJson,
        planRevision(plan.revision) + 1,
        timestamp,
        plan.id,
        tenantId,
      ],
    );
  }
}

const dayMilliseconds = 24 * 60 * 60 * 1000;
export const setAsideRetentionDays = 60;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}

// Exported for the portable plan-lifecycle contract (fixtures/plan-lifecycle.json):
// the v1 API vocabulary maps stored "pending" to "active" and leaves the rest as-is.
export function apiPlanStatus(value) {
  const stored = plannerPlanStatus(value);
  return stored === "pending" ? "active" : stored;
}

// A plan that is still an intention — pending or abandoned — goes to the
// trash at once. An executed or archived plan is history: it goes there
// once no live session names it any more (its sessions in the trash or
// erased), so that the Journal, which keeps its lines by the session, never
// loses a line to the deletion of a plan.
function planResourceDeletable(status) {
  return ["active", "abandoned"].includes(apiPlanStatus(status));
}

/** The live sessions (not in the trash) of a plan, the oldest first. */
async function liveSessionIdsOf(driver, tenantId, planId) {
  return (
    await driver.query(
      `SELECT id FROM observation_sessions
       WHERE tenant_id = ? AND plan_id = ? AND deleted_at IS NULL
       ORDER BY started_at, id`,
      [tenantId, planId],
    )
  ).rows.map((row) => row.id);
}

/**
 * The refusal of the deletion of a plan that is history: not a
 * conflict of versions (`plan_conflict`) nor a frozen write (`plan_frozen`),
 * a refusal of the request itself, `403`, which names what the person can do
 * instead. The web planner's own library never offers the deletion of such a
 * plan; this answers a copy that was stale, or a device that was not told.
 */
export function planNotDeletableError(
  planIds = null,
  { inProgressPlanIds = [], sessionIds = null } = {},
) {
  return new PlanResourceStoreError(
    "plan_not_deletable",
    sessionIds
      ? "An executed or archived plan goes to the trash once its sessions are in the trash."
      : "An executed or archived plan cannot be deleted: archive it instead.",
    {
      status: 403,
      ...(planIds ? { planIds } : {}),
      // The live sessions that hold an executed or archived plan: once
      // they are in the trash, the plan goes there too.
      ...(sessionIds ? { sessionIds } : {}),
      // Those of `planIds` whose night is running on a device (a
      // session open or paused): the page says so in words.
      ...(inProgressPlanIds.length ? { inProgressPlanIds } : {}),
    },
  );
}

/** A constraint of the database refusing a write (SQLite or PostgreSQL). */
/**
 * The refusal of the deletion of a plan whose night runs on a device, asked
 * by the web before it deletes: `409 plan_in_progress`, naming the open
 * session and the last time it was heard of (`lastSignalAt`), so that the
 * page says it and offers « Supprimer quand même » (`force`).
 */
export function planInProgressError(session) {
  return new PlanResourceStoreError(
    "plan_in_progress",
    "This plan's night is running on a device: delete it with force to take its open session to the trash too.",
    {
      status: 409,
      executionSessionId: session?.id ?? null,
      lastSignalAt: session?.updated_at ?? null,
    },
  );
}

export function isConstraintViolation(error) {
  const code = String(error?.code ?? "");
  return (
    /^SQLITE_CONSTRAINT/.test(code) ||
    /^23\d{3}$/.test(code) ||
    /constraint failed|violates .*constraint/i.test(
      String(error?.message ?? ""),
    )
  );
}

// The closures that say a night happened, or was given up: a device's
// `closedAs` and the web planner's `status`.
const closuresOfAFinishedNight = new Set(["executed", "partial", "abandoned"]);

/**
 * Whether the night of a plan is too far ahead to be marked executed, in
 * part or abandoned: a plan of the 23rd October cannot be « Exécuté »
 * on the 15th. The rule is the service's, laxer than the one of the screens on
 * purpose: the screens offer the marks once the night has begun, the service
 * refuses only a night that begins more than a day from now, so that an
 * execution launched in the morning of its day (a device may start it from
 * its local midnight) and finished before the dusk is never refused. The
 * night's start is the astronomical dusk of the plan's place; a plan without
 * a usable place counts from the midnight (UTC) of its date, the convention
 * of the debriefing queue's fallback.
 */
export function planNightIsTooFarAhead({ planDate, nightStartAt, now }) {
  const at = Date.parse(now);
  const start = nightStartAt
    ? Date.parse(nightStartAt)
    : Date.parse(`${planDate}T00:00:00Z`);
  if (!Number.isFinite(at) || !Number.isFinite(start)) return false;
  return at < start - dayMilliseconds;
}

function planNightNotBegunError(planIds = null) {
  return new PlanResourceStoreError(
    "plan_night_not_begun",
    "The night of this plan has not begun: it cannot be marked as executed or abandoned yet.",
    { status: 409, ...(planIds ? { planIds } : {}) },
  );
}

/**
 * A device does not close a night that is too far ahead
 * (`payload.closedAs`: executed, partial or abandoned). A closure the plan
 * already carries is not asked again — a plan edited after it keeps passing.
 */
function refuseClosureOfFutureNight({
  closedAs,
  previousClosedAs,
  fields,
  timestamp,
}) {
  if (!closuresOfAFinishedNight.has(closedAs) || closedAs === previousClosedAs)
    return;
  if (
    planNightIsTooFarAhead({
      planDate: fields.planDate,
      nightStartAt: fields.nightStartAt,
      now: timestamp,
    })
  )
    throw planNightNotBegunError();
}

/**
 * DEBRIEF-QUEUE-ABANDONED-01: a night given up needs no debriefing. The write
 * that sets a plan's `closedAs` to `abandoned` (a creation, or a change of the
 * value the plan carries) is also the debriefing decision « Abandonné »: the
 * plan is stored `abandoned` and frozen at the same instant, in the same
 * transaction, as a decision made through `POST /v1/plans/{planId}/debrief`
 * would freeze it, so it never enters the debrief queue (which lists the
 * plans still `pending`). No session is made and none is touched: the
 * execution a device ran keeps its own journal, and its sessions reach the
 * service by their own routes. A plan that already carries `abandoned` while
 * still active (« Recréer la session », which hands a plan back to the
 * debriefing on purpose) is not frozen again by a later write.
 *
 * Mutates `fields` (the plan's columns as they will be stored); answers
 * whether the plan is frozen by this write.
 */
export function freezeAbandonedClosure({
  closedAs,
  previousClosedAs = null,
  fields,
  timestamp,
}) {
  if (closedAs !== "abandoned" || previousClosedAs === "abandoned")
    return false;
  fields.status = "abandoned";
  fields.frozenAt = timestamp;
  return true;
}

function timestampAfterDays(timestamp, days) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime()))
    throw new PlanResourceStoreError(
      "invalid_timestamp",
      "A valid UTC timestamp is required.",
    );
  return new Date(value.getTime() + days * dayMilliseconds).toISOString();
}

function timestampAtOffset(timestamp, offset) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return timestamp;
  return new Date(value.getTime() + offset).toISOString();
}

/** A package-level error that route adapters map to the v1 error envelope. */
export class PlanResourceStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "PlanResourceStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

/** Serialize the read/check/write for a space across PostgreSQL connections. */
export async function lockTenantPlans(transaction, tenantId) {
  if (transaction.dialect === "postgres")
    await transaction.query(
      "SELECT id FROM organizations WHERE id = ? FOR UPDATE",
      [tenantId],
    );
}

/**
 * Both write surfaces use the same pending-plan night and numeric guard.
 *
 * The internal plan of a guided evening (`guidedEvening`, the written plan's
 * flag) is outside both rules: it is never refused, and the plans that carry
 * the flag are never counted for the night nor for the guard, so that it can
 * live the same evening as the night's ordinary plan on a profile without
 * `planner.multiple`.
 */
export async function refuseBeyondPlanLimit(
  transaction,
  tenantId,
  planLimit,
  { plannerMultiple = true, date, planId, guidedEvening = false } = {},
) {
  if (guidedEvening) return;
  // The night rule also counts the plans that were run (executed,
  // partial); the numeric guard still counts the pending ones only
  // (`pendingPlanPermission`).
  const plans = (
    await transaction.query(
      "SELECT id, name, plan_date, status FROM plans WHERE tenant_id = ? AND status IN (?, ?, ?) AND deleted_at IS NULL AND guided_evening = 0",
      [tenantId, "pending", "executed", "partial"],
    )
  ).rows.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.plan_date,
    status: row.status,
  }));
  const permission = pendingPlanPermission({
    capabilities: {
      "planner.multiple": plannerMultiple,
      "sync.plan_limit": planLimit,
    },
    plans,
    date,
    planId,
  });
  if (permission === "allowed") return;
  // When the night is what is full, the answer names the plan(s) that hold
  // it, so that a phone can offer to merge into it or to delete it instead of
  // asking the person to « try again ». The numeric guard names nothing: it
  // is about how many plans, not which night.
  const holders =
    permission === "night"
      ? plans
          .filter(
            (plan) =>
              plan.date === date &&
              (!planId || plan.id !== planId) &&
              planStatusCountsTowardNight(plan.status),
          )
          .map((plan) => ({
            id: plan.id,
            name: plan.name,
            status: plan.status === "pending" ? "active" : plan.status,
          }))
      : [];
  throw new PlanResourceStoreError(
    "plan_limit_reached",
    "The pending-plan limit has been reached.",
    {
      status: 409,
      reason: permission,
      ...(holders.length ? { date, otherPlans: holders } : {}),
    },
  );
}

/**
 * « une nuit = un lieu »: every plan still to plan of a night has the same
 * place. The projection has no night identifier, so « the same night » is the
 * same date. A plan counts when it is pending and its night was not closed
 * (`closedAs`): a plan that ran, was abandoned or put away keeps the place it
 * was observed at and never takes part (the executed plan of another place is
 * history, not a plan of the night to come). The internal plan of a guided
 * evening never takes part either.
 */
function plansOfANightCount({ status, closedAs, guidedEvening = false }) {
  return (
    !guidedEvening &&
    (status === undefined || status === null || status === "pending") &&
    !planClosedAsStatuses.includes(closedAs)
  );
}

// A plan without a usable place (none, invalid coordinates, or the legacy 0,0
// null-island placeholder `knownPlannerLocation` already excludes) has no night
// place: there is nothing to compare, so it neither conflicts nor counts.
function nightPlaceKey(location) {
  if (!knownPlannerLocation(location)) return null;
  const key = placeFingerprint(location);
  return key === "null" ? null : key;
}

/**
 * The refusal of a write that would give a night two places (`409
 * plan_night_place_conflict`, nothing written). `planIds` are the refused
 * plans (the client ids); `date` and `nightPlace` say what the night holds
 * now — the place of the other plans and their names — so that a surface can
 * show the same choice the planners show (« Utiliser … » / « Revenir à … »).
 */
export function nightPlaceConflictError({ date, refused, others }) {
  const first = others[0];
  return new PlanResourceStoreError(
    "plan_night_place_conflict",
    "Every plan of a night has the same place: the other plans of this night are at another place.",
    {
      status: 409,
      planIds: refused,
      date,
      nightPlace: {
        location: first?.location ?? null,
        plans: others
          .filter((other) => nightPlaceKey(other.location) === first?.key)
          .map((other) => ({ id: other.clientId, name: other.name })),
      },
    },
  );
}

/**
 * The plans of [candidates] ({ clientId, name, date, location, counts }) that
 * share a date and disagree on the place with one of [focus] (the client ids
 * of the plans being written). Pure: the repository's two write paths each
 * build the list of the plans that WILL be stored and ask this.
 */
export function nightPlaceConflictsOf(candidates, focus) {
  const counting = candidates
    .filter((plan) => plan.counts)
    .map((plan) => ({ ...plan, key: nightPlaceKey(plan.location) }))
    .filter((plan) => plan.key !== null);
  const focused = new Set(focus);
  const conflicts = [];
  for (const plan of counting) {
    if (!focused.has(plan.clientId)) continue;
    const others = counting.filter(
      (other) =>
        other.clientId !== plan.clientId &&
        other.date === plan.date &&
        other.key !== plan.key,
    );
    if (others.length) conflicts.push({ plan, others });
  }
  return conflicts;
}

/**
 * The single-plan write (`PUT /v1/plans/{id}`): refuses the plan whose new
 * date or place differs from the place of the other plans of that date. A plan
 * whose date and place are those it already had is never refused here (data
 * stored before the rule is not locked by it). `moving` are the resource ids
 * of plans a device is about to write to the same new place in the same
 * synchronisation (a night moved plan by plan): their stored place does not
 * count, or the first write of the move would always be refused.
 */
export async function refuseNightPlaceConflict(
  transaction,
  tenantId,
  { planId = null, fields, closedAs, current = null, moving = [] },
) {
  if (
    !plansOfANightCount({
      status: "pending",
      closedAs,
      guidedEvening: fields.guidedEvening === 1,
    })
  )
    return;
  const key = nightPlaceKey(parseJson(fields.locationJson, null));
  if (key === null) return;
  if (
    current &&
    current.plan_date === fields.planDate &&
    nightPlaceKey(parseJson(current.location_json, null)) === key
  )
    return;
  const skipped = new Set([planId, ...moving].filter(Boolean));
  const rows = (
    await transaction.query(
      "SELECT id, client_id, name, location_json, settings_json FROM plans WHERE tenant_id = ? AND plan_date = ? AND status = ? AND deleted_at IS NULL AND guided_evening = 0",
      [tenantId, fields.planDate, "pending"],
    )
  ).rows.filter((row) => !skipped.has(row.id));
  const candidates = [
    {
      clientId: fields.clientId,
      name: fields.name,
      date: fields.planDate,
      location: parseJson(fields.locationJson, null),
      counts: true,
    },
    ...rows.map((row) => ({
      clientId: row.client_id,
      name: row.name,
      date: fields.planDate,
      location: parseJson(row.location_json, null),
      counts: plansOfANightCount({
        status: "pending",
        closedAs: storedClosedAs(row.settings_json) ?? undefined,
      }),
    })),
  ];
  const [conflict] = nightPlaceConflictsOf(candidates, [fields.clientId]);
  if (conflict)
    throw nightPlaceConflictError({
      date: fields.planDate,
      refused: [fields.clientId],
      others: conflict.others,
    });
}

/**
 * The whole-document save (`PUT /api/plans`): the plans the document leaves
 * pending must agree on the place of their night (their date). Only a plan
 * whose date, place or status changes can be refused, so a night stored
 * before the rule stays editable.
 */
function refuseNightPlaceConflictOfDocument({
  plans,
  storedPlans,
  deletedClientIds,
  explicitlyDeletedClientIds,
}) {
  const carried = new Map();
  const closures = new Map();
  const guided = new Set();
  for (const row of storedPlans) {
    if (explicitlyDeletedClientIds.has(row.client_id)) continue;
    closures.set(row.client_id, storedClosedAs(row.settings_json) ?? undefined);
    if (storedGuidedEvening(row.settings_json)) guided.add(row.client_id);
    carried.set(row.client_id, {
      clientId: row.client_id,
      name: row.name,
      date: row.plan_date,
      location: parseJson(row.location_json, null),
      counts: plansOfANightCount({
        status: row.status,
        closedAs: storedClosedAs(row.settings_json) ?? undefined,
        guidedEvening: storedGuidedEvening(row.settings_json),
      }),
    });
  }
  const focus = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    const clientId = identifier(plan?.id, null);
    if (
      !clientId ||
      deletedClientIds.has(clientId) ||
      explicitlyDeletedClientIds.has(clientId)
    )
      continue;
    const before = carried.get(clientId);
    const next = {
      clientId,
      name: String(plan?.name || ""),
      date: String(plan?.date || ""),
      location: plan?.location ?? null,
      counts: plansOfANightCount({
        status: plannerPlanStatus(plan?.status),
        // A closure the device recorded is kept by the save.
        closedAs: plan?.closedAs ?? closures.get(clientId),
        guidedEvening: plan?.guidedEvening === true || guided.has(clientId),
      }),
    };
    carried.set(clientId, next);
    const unchanged =
      before?.counts === next.counts &&
      before.date === next.date &&
      nightPlaceKey(before.location) === nightPlaceKey(next.location);
    if (next.counts && !unchanged) focus.push(clientId);
  }
  const [conflict] = nightPlaceConflictsOf([...carried.values()], focus);
  if (conflict)
    throw nightPlaceConflictError({
      date: conflict.plan.date,
      refused: focus.filter(
        (id) => nightPlaceConflictsOf([...carried.values()], [id]).length > 0,
      ),
      others: conflict.others,
    });
}

function planReadOnlyError() {
  return new PlanResourceStoreError(
    "entitlement_read_only",
    "This account's subscription has ended: plan writes are suspended; existing plans remain readable and exportable.",
    { status: 403 },
  );
}

/**
 * The rules of a plan item's `projectId` for one plan write
 * (`plan-project-links.js`), thrown as the store's own error so that every
 * shell reports it in its usual format. `projectLinks` is the caller's right
 * (`{ allowed, readOnly }`, resolved by the plan service); a caller that
 * passes none is a trusted one (a migration, a test of the store) and its
 * links are not checked. Answers what to hand to `followProjectLinks` once
 * the write has gone through.
 */
async function checkProjectLinks(transaction, tenantId, projectLinks, change) {
  if (!projectLinks) return null;
  const outcome = await checkPlanProjectLinks(transaction, {
    tenantId,
    projectLinks,
    ...change,
  });
  if (outcome.refusal) {
    const { code, message, status, ...details } = outcome.refusal;
    throw new PlanResourceStoreError(code, message, { status, ...details });
  }
  return outcome.links;
}

/** What the links just written carry along; the domains to signal. */
async function followProjectLinks(transaction, change) {
  return [...(await followPlanProjectLinks(transaction, change))];
}

/** The items a stored plan payload holds (`[]` when it holds none). */
function storedItemsOf(payloadJson) {
  const items = parseJson(payloadJson, null)?.items;
  return Array.isArray(items) ? items : [];
}

/** A browser plan's own content, without the fields the server sets. */
function comparablePlanSettings(settings) {
  const {
    revision: _revision,
    archivedAt: _archivedAt,
    archivedFrom: _archivedFrom,
    // The closure a device recorded is not a browser edit.
    closedAs: _closedAs,
    items: _items,
    ...rest
  } = settings || {};
  return canonicalJson(rest);
}

function cloneJson(value) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new PlanResourceStoreError(
      "invalid_payload",
      "The plan payload must be JSON serializable.",
    );
  }
}

/**
 * The statuses a device may record on a plan it ran without the service
 * having frozen it (`payload.closedAs`): the night stopped on the phone,
 * before any debriefing. The plan itself stays `active` and writable for the
 * service (the debriefing decision is the only thing that freezes it); the
 * field only carries what the device knows across the plan sync, so a push
 * never rewrites a finished plan as « active » on the other devices.
 */
export const planClosedAsStatuses = Object.freeze([
  "executed",
  "partial",
  "abandoned",
  "archived",
]);

/** The closure a stored settings blob carries, or null. */
export function storedClosedAs(settingsJson) {
  const closedAs = parseJson(settingsJson, {})?.closedAs;
  return planClosedAsStatuses.includes(closedAs) ? closedAs : null;
}

/** Whether the settings of a stored plan say it is a guided evening's. */
export function storedGuidedEvening(settingsJson) {
  return parseJson(settingsJson, {})?.guidedEvening === true;
}

// A payload without the revision it carries: the revision is the row's, not
// content, and the stored copy of a payload always names the revision it was
// written at.
function withoutRevision(payload) {
  if (!plainObject(payload)) return payload;
  const { revision: _revision, ...content } = payload;
  return content;
}

/**
 * The state a plan keeps when a full-document save archives it: the outcome
 * it had (a debriefed plan keeps it so that its session still reads it; a plan
 * the web abandoned or marked executed keeps it so that its card reads
 * « Abandonné » then « Archivé »), the one already recorded for a plan that
 * stays archived, none for a plan that was still planned or is not archived.
 */
function archivedFromOnSave({ row, status }) {
  if (status !== "archived") return null;
  if (DEBRIEF_PLAN_OUTCOMES.includes(row.status)) return row.status;
  return row.status === "archived" ? (row.archived_from ?? null) : null;
}

/**
 * Whether the plan a full-document save carries is what the service already
 * holds for it: the document the service served, read and written back as it
 * is, changes nothing — not the revision, not `updated_at`, not the history.
 * The submitted plan is put through what a write would store
 * (`plannerPayloadFor` over the columns and the settings a write would
 * produce) and compared, revision aside, with what is stored.
 */
function planStoredAlready({
  plan,
  clientId,
  row,
  storedItems,
  items,
  status,
}) {
  const { items: _items, ...settings } = plan;
  const keptClosure = storedClosedAs(row.settings_json);
  if (keptClosure && settings.closedAs === undefined)
    settings.closedAs = keptClosure;
  const wouldStore = plannerPayloadFor(
    {
      client_id: clientId,
      settings_json: JSON.stringify(settings),
      plan_date: String(plan?.date || ""),
      name: String(plan?.name || ""),
      location_json: JSON.stringify(plan?.location || null),
      equipment_json: JSON.stringify(plan?.equipment || null),
      min_altitude: plannerMinAltitude(plan?.minAltitude),
      status,
      archived_at:
        status === "archived" ? String(plan?.archivedAt || "") || null : null,
      archived_from: archivedFromOnSave({ row, status }),
      revision: row.revision,
    },
    items,
  );
  const stored = plannerPayloadFor(row, storedItems);
  return (
    canonicalJson(withoutRevision(wouldStore)) ===
    canonicalJson(withoutRevision(stored))
  );
}

// The minimum altitude a plan carries: a number, or none (not zero).
function plannerMinAltitude(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

/**
 * The legacy browser stores a local client id in payload.id. It is deliberately
 * distinct from plans.id, which is the v1 server resource id. Mobile writes
 * only active plans; the normalized persistence vocabulary calls that pending.
 */
export function normalizePlanResourcePayload(value) {
  if (!plainObject(value))
    throw new PlanResourceStoreError(
      "invalid_payload",
      "A plan payload object is required.",
    );
  if (Object.hasOwn(value, "tenantId") || Object.hasOwn(value, "tenant_id"))
    throw new PlanResourceStoreError(
      "invalid_payload",
      "Tenant identity is derived from authentication and is not accepted in a plan payload.",
    );

  const payload = cloneJson(value);
  const clientId = String(payload.id || "").trim();
  if (!clientId || clientId.length > 200)
    throw new PlanResourceStoreError(
      "invalid_payload",
      "A plan payload requires a client id of at most 200 characters.",
    );
  if (!validDate(payload.date))
    throw new PlanResourceStoreError(
      "invalid_payload",
      "A plan payload requires an ISO calendar date.",
    );
  const name = String(payload.name || "").trim();
  if (!name || name.length > 300)
    throw new PlanResourceStoreError(
      "invalid_payload",
      "A plan payload requires a name of at most 300 characters.",
    );
  if (!Array.isArray(payload.items))
    throw new PlanResourceStoreError(
      "invalid_payload",
      "A plan payload requires an items array.",
    );
  if (
    payload.closedAs !== undefined &&
    !planClosedAsStatuses.includes(payload.closedAs)
  )
    throw new PlanResourceStoreError(
      "invalid_payload",
      `A plan payload's closedAs is one of ${planClosedAsStatuses.join(", ")}, or absent.`,
    );

  // A value of the acquisition lines out of bounds is refused as a
  // capture's line is (`400`, the field and its limit named).
  const acquisitionRefused = planAcquisitionRefusal(payload);
  if (acquisitionRefused)
    throw new PlanResourceStoreError(
      "invalid_payload",
      acquisitionRefused.message,
      { field: acquisitionRefused.field, limit: acquisitionRefused.limit },
    );

  const itemIds = new Set();
  payload.items = payload.items.map((item) => {
    if (!plainObject(item))
      throw new PlanResourceStoreError(
        "invalid_payload",
        "Each plan item must be an object.",
      );
    const id = String(item.id || "").trim();
    if (!id || id.length > 200 || itemIds.has(id))
      throw new PlanResourceStoreError(
        "invalid_payload",
        "Each plan item requires a unique id of at most 200 characters.",
      );
    itemIds.add(id);
    return { ...item, id };
  });

  // v1 accepts the API spelling for an active plan, while preserving existing
  // browser payloads that still contain the stored pending spelling. Do not
  // rewrite either spelling here: payload_json is the exact v1 document and
  // the normalized row separately retains the legacy pending vocabulary.
  if (
    payload.status !== undefined &&
    payload.status !== "active" &&
    payload.status !== "pending"
  )
    throw new PlanResourceStoreError(
      "invalid_payload",
      "Only active plans may be written through this API version.",
    );
  payload.id = clientId;
  payload.name = name;
  return normalizePlanAcquisition(payload);
}

export function normalizedPlanFields(payload) {
  const { items, ...settings } = payload;
  const minAltitude =
    payload.minAltitude === null ||
    payload.minAltitude === undefined ||
    (typeof payload.minAltitude === "string" && !payload.minAltitude.trim())
      ? null
      : Number(payload.minAltitude);
  const nightBounds = deriveNightBounds(payload);
  return {
    archivedAt: null,
    clientId: payload.id,
    equipmentJson: canonicalJson(payload.equipment || null),
    // The internal plan of a guided evening (`payload.guidedEvening`): the
    // column the one-plan-per-night rule, the debrief queue and the lists
    // filter on.
    guidedEvening: payload.guidedEvening === true ? 1 : 0,
    locationJson: canonicalJson(payload.location || null),
    minAltitude: Number.isFinite(minAltitude) ? minAltitude : null,
    name: payload.name,
    nightStartAt: nightBounds.nightStartAt,
    nightEndAt: nightBounds.nightEndAt,
    payloadJson: canonicalJson(payload),
    planDate: payload.date,
    settingsJson: canonicalJson(settings),
    status: "pending",
    items,
  };
}

/**
 * The state an archived plan had before its archive: `executed`, `partial` or
 * `abandoned`; `null` for a plan that is not archived, one archived while it
 * was still planned, or one archived before the service recorded it.
 *
 * - archived by the service (`status` `archived`): `plans.archived_from`;
 * - archived by a device without the service having frozen it (the status
 *   stays `active`, the payload carries `closedAs: "archived"`): the state the
 *   device recorded beside it (`payload.archivedFrom`).
 */
export function archivedFromOfPlanRow(plan, payload = null) {
  const status = plannerPlanStatus(plan?.status);
  if (status === "archived")
    return DEBRIEF_PLAN_OUTCOMES.includes(plan.archived_from)
      ? plan.archived_from
      : null;
  if (
    status === "pending" &&
    plainObject(payload) &&
    payload.closedAs === "archived" &&
    DEBRIEF_PLAN_OUTCOMES.includes(payload.archivedFrom)
  )
    return payload.archivedFrom;
  return null;
}

export function resourceForPlanRow(plan) {
  const payload = parseJson(plan.payload_json);
  if (!plainObject(payload))
    throw new PlanResourceStoreError(
      "invalid_stored_payload",
      "The stored plan payload is invalid.",
      { status: 500 },
    );
  return {
    id: plan.id,
    revision: planRevision(plan.revision),
    status: apiPlanStatus(plan.status),
    nightStartAt: plan.night_start_at || null,
    nightEndAt: plan.night_end_at || null,
    frozenAt: plan.frozen_at || null,
    // Additive, read-only: the state an archived plan had before its archive.
    archivedFrom: archivedFromOfPlanRow(plan, payload),
    updatedAt: plan.updated_at,
    payload: normalizePlanAcquisition(payload),
  };
}

export function versionForRow(version) {
  const payload = parseJson(version.payload_json);
  if (!plainObject(payload))
    throw new PlanResourceStoreError(
      "invalid_stored_payload",
      "The stored plan version payload is invalid.",
      { status: 500 },
    );
  return {
    versionId: version.id,
    revision: planRevision(version.revision),
    state: version.state,
    createdAt: version.created_at,
    purgeAfter: version.purge_after || null,
    payload: normalizePlanAcquisition(payload),
  };
}

/**
 * The common base of a divergence: the plan as it stood at [revision], the
 * revision the set-aside write was based on. Every write archives what it
 * replaces as `history` at that row's revision, so the earliest `history`
 * row of that revision is it (a later one at the same revision is a
 * resolved set-aside attempt, kept for « Versions précédentes »). `null`
 * when none exists (a plan older than its archive).
 */
async function planVersionBase(driver, { tenantId, planId, revision }) {
  if (!Number.isInteger(revision) || revision < 1) return null;
  const row = (
    await driver.query(
      "SELECT * FROM plan_versions WHERE tenant_id = ? AND plan_id = ? AND state = ? AND revision = ? ORDER BY created_at, id",
      [tenantId, planId, "history", revision],
    )
  ).rows[0];
  return row ? versionForRow(row).payload : null;
}

// Which side of a web divergence is the more recent (without a base, its
// settings are pre-selected): the browser's set-aside attempt unless the live
// plan was written after it.
function newerPlanSide(setAside, current) {
  const setAsideAt = Date.parse(setAside?.createdAt || "");
  const currentAt = Date.parse(current?.updatedAt || "");
  return Number.isFinite(setAsideAt) &&
    Number.isFinite(currentAt) &&
    currentAt > setAsideAt
    ? planFieldSideOther
    : planFieldSideLocal;
}

async function purgeExpiredSetAsideVersions(
  driver,
  { tenantId, planId = null, timestamp },
) {
  const clauses = [
    "tenant_id = ?",
    "state = ?",
    "purge_after IS NOT NULL",
    "purge_after <= ?",
  ];
  const params = [tenantId, "set_aside", timestamp];
  if (planId) {
    clauses.push("plan_id = ?");
    params.push(planId);
  }
  return await driver.run(
    `DELETE FROM plan_versions WHERE ${clauses.join(" AND ")}`,
    params,
  );
}

export async function planRowFor(
  driver,
  tenantId,
  planId,
  { includeDeleted = false } = {},
) {
  return (
    (
      await driver.query(
        `SELECT * FROM plans WHERE id = ? AND tenant_id = ?
         ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
        [planId, tenantId],
      )
    ).rows[0] || null
  );
}

// The insertion-order tiebreak for "the most recent plan_versions row":
// never `id`, which is a randomUUID() and gives no ordering at all between
// rows sharing a `created_at` millisecond (common when one request archives
// a history row and a set-aside row back to back — see migration 21's
// comment). SQLite's implicit `rowid` already is that order on this
// ordinary table; PostgreSQL has no safe equivalent system column, so it
// gets the real `seq` column migration 21 adds.
export function planVersionOrderTiebreak(dialect) {
  return dialect === "postgres" ? "seq" : "rowid";
}

async function latestPreservedPlanVersion(driver, tenantId, planId, dialect) {
  return (
    (
      await driver.query(
        `SELECT * FROM plan_versions
         WHERE tenant_id = ? AND plan_id = ?
         ORDER BY revision DESC, created_at DESC, ${planVersionOrderTiebreak(dialect)} DESC LIMIT 1`,
        [tenantId, planId],
      )
    ).rows[0] || null
  );
}

async function clientPlanIdTaken(driver, tenantId, clientId, planId = null) {
  const clauses = ["tenant_id = ?", "client_id = ?"];
  const params = [tenantId, clientId];
  if (planId) {
    clauses.push("id <> ?");
    params.push(planId);
  }
  return Boolean(
    (
      await driver.query(
        `SELECT id FROM plans WHERE ${clauses.join(" AND ")} LIMIT 1`,
        params,
      )
    ).rows[0],
  );
}

export async function replacePlanItems(
  driver,
  { tenantId, planId, items, timestamp },
) {
  await driver.run("DELETE FROM plan_items WHERE plan_id = ?", [planId]);
  for (const [index, item] of items.entries()) {
    const itemTimestamp = timestampAtOffset(timestamp, index);
    await driver.run(
      "INSERT INTO plan_items (id, tenant_id, plan_id, client_id, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        randomUUID(),
        tenantId,
        planId,
        item.id,
        canonicalJson(item),
        itemTimestamp,
        itemTimestamp,
      ],
    );
  }
}

async function insertPlanProjection(
  driver,
  { tenantId, userId, planId, fields, revision, timestamp },
) {
  await driver.run(
    "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, location_json, equipment_json, min_altitude, settings_json, status, archived_at, created_at, updated_at, revision, payload_json, night_start_at, night_end_at, night_bounds_resolved_at, frozen_at, guided_evening) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      planId,
      tenantId,
      userId,
      fields.clientId,
      fields.planDate,
      fields.name,
      fields.locationJson,
      fields.equipmentJson,
      fields.minAltitude,
      fields.settingsJson,
      fields.status,
      fields.archivedAt,
      timestamp,
      timestamp,
      revision,
      fields.payloadJson,
      fields.nightStartAt,
      fields.nightEndAt,
      timestamp,
      fields.frozenAt ?? null,
      fields.guidedEvening ?? 0,
    ],
  );
  await replacePlanItems(driver, {
    tenantId,
    planId,
    items: fields.items,
    timestamp,
  });
}

async function updatePlanProjection(
  driver,
  {
    tenantId,
    planId,
    expectedRevision,
    fields,
    nextRevision,
    timestamp,
    restoreDeleted = false,
  },
) {
  // `deleted_at = NULL` is a no-op on the ordinary write path, whose guard
  // already requires a live row; a restore deliberately targets the deleted
  // row instead and brings it back in the same statement. night_start_at/
  // night_end_at are re-derived from the payload that becomes current on
  // every call here (the write's WHERE clause already requires `status =
  // 'pending'`, i.e. active: a frozen plan never reaches this statement, so
  // it is never recomputed).
  return await driver.run(
    `UPDATE plans
     SET client_id = ?, plan_date = ?, name = ?, location_json = ?,
         equipment_json = ?, min_altitude = ?, settings_json = ?, status = ?,
         archived_at = ?, updated_at = ?, revision = ?, payload_json = ?,
         night_start_at = ?, night_end_at = ?, night_bounds_resolved_at = ?,
         frozen_at = COALESCE(?, frozen_at), guided_evening = ?,
         deleted_at = NULL
     WHERE id = ? AND tenant_id = ? AND revision = ? AND status = ?
       AND deleted_at IS ${restoreDeleted ? "NOT NULL" : "NULL"}`,
    [
      fields.clientId,
      fields.planDate,
      fields.name,
      fields.locationJson,
      fields.equipmentJson,
      fields.minAltitude,
      fields.settingsJson,
      fields.status,
      fields.archivedAt,
      timestamp,
      nextRevision,
      fields.payloadJson,
      fields.nightStartAt,
      fields.nightEndAt,
      timestamp,
      fields.frozenAt ?? null,
      fields.guidedEvening ?? 0,
      planId,
      tenantId,
      expectedRevision,
      "pending",
    ],
  );
}

async function setAsidePlanPayload(
  driver,
  { tenantId, planId, revision, originDeviceId, payloadJson, timestamp },
) {
  const versionId = randomUUID();
  await driver.run(
    "INSERT INTO plan_versions (id, tenant_id, plan_id, revision, state, origin_device_id, payload_json, created_at, purge_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      versionId,
      tenantId,
      planId,
      revision,
      "set_aside",
      originDeviceId || null,
      payloadJson,
      timestamp,
      timestampAfterDays(timestamp, setAsideRetentionDays),
    ],
  );
  return versionId;
}

/**
 * Granular v1 persistence operations. This shares the web planner's tables
 * and materialized payload representation, but never invokes the destructive
 * whole-document writer used by the legacy browser route.
 */
export async function createPlanResourceRepository({
  databasePath,
  databaseUrl,
  driver,
  // The driver knows what it speaks; the URL heuristic is only for the
  // case where this repository opens its own connection. A caller that
  // hands in a PostgresDriver without a URL used to be mis-detected as
  // SQLite — harmless while every migration was portable, fatal from
  // migration 21 on (`rowid` vs `seq`).
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  await db.transaction(
    async (transaction) => await backfillAllPlannerPayloadsFor(transaction),
  );

  async function listRows(transaction, tenantId) {
    return (
      await transaction.query(
        `SELECT * FROM plans WHERE tenant_id = ? AND deleted_at IS NULL
         ORDER BY plan_date, created_at, client_id`,
        [tenantId],
      )
    ).rows;
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async listPlanResources({ tenantId, timestamp = now() }) {
      const resources = await db.transaction(async (transaction) => {
        const rows = await listRows(transaction, tenantId);
        // A debriefed plan without a live session says so.
        const flags = await sessionFlagsForPlanRows(
          transaction,
          tenantId,
          rows,
        );
        // A plan whose night runs on a device says so.
        const executions = await executionStatesForPlanRows(
          transaction,
          tenantId,
          rows,
        );
        return rows.map((row) => ({
          ...resourceForPlanRow(row),
          ...(flags.get(row.id) ?? {}),
          ...(executions.get(row.id) ?? {}),
        }));
      });
      return await Promise.all(
        resources.map(async (resource) => ({
          ...resource,
          payload: await hydratedPayloadVia(db, tenantId, resource.payload),
        })),
      );
    },

    /**
     * The ids of the space's deleted plans (in the trash, or deleted before
     * it existed), for a device to drop the copies it keeps
     * (`GET /v1/plans`, `deletedPlanIds`). An erased plan is no longer named.
     */
    async deletedPlanIds({ tenantId }) {
      return (
        await db.query(
          `SELECT id FROM plans WHERE tenant_id = ? AND deleted_at IS NOT NULL
           ORDER BY id`,
          [tenantId],
        )
      ).rows.map((row) => row.id);
    },

    async getPlanResource({ tenantId, planId, timestamp = now() }) {
      const resource = await db.transaction(async (transaction) => {
        const plan = await planRowFor(transaction, tenantId, planId);
        if (!plan) return null;
        const flags = await sessionFlagsForPlanRows(transaction, tenantId, [
          plan,
        ]);
        const executions = await executionStatesForPlanRows(
          transaction,
          tenantId,
          [plan],
        );
        return {
          ...resourceForPlanRow(plan),
          ...(flags.get(plan.id) ?? {}),
          ...(executions.get(plan.id) ?? {}),
        };
      });
      if (!resource) return null;
      return {
        ...resource,
        payload: await hydratedPayloadVia(db, tenantId, resource.payload),
      };
    },

    async listPlanVersions({ tenantId, planId, timestamp = now() }) {
      return await db.transaction(async (transaction) => {
        await purgeExpiredSetAsideVersions(transaction, {
          tenantId,
          planId,
          timestamp,
        });
        return (
          await transaction.query(
            `SELECT * FROM plan_versions WHERE tenant_id = ? AND plan_id = ?
             ORDER BY created_at, id`,
            [tenantId, planId],
          )
        ).rows.map(versionForRow);
      });
    },

    async writePlanResource({
      tenantId,
      userId,
      planId,
      expectedRevision,
      payload,
      originDeviceId = null,
      originClientInstanceId = null,
      planLimit = 0,
      plannerMultiple = true,
      projectLinks = null,
      movingPlanIds = [],
      timestamp = now(),
    }) {
      const normalizedPayload = normalizePlanResourcePayload(payload);
      const result = await db.transaction(async (transaction) => {
        await lockTenantPlans(transaction, tenantId);
        // Whatever `target`/`target. framing` content a client sent
        // alongside a `framingId` is discarded here, before the payload is
        // ever stored — a plan write is never a backdoor to edit a
        // framing.
        const {
          items: dehydratedItems,
          framingIds,
          missingFramingIds: missing,
        } = await dehydrateAndCheckFramings(
          transaction,
          tenantId,
          normalizedPayload.items,
        );
        if (missing.length > 0)
          return { kind: "framing_missing", missingFramingIds: missing };
        normalizedPayload.items = dehydratedItems;
        const fields = normalizedPlanFields(normalizedPayload);
        const current = await planRowFor(transaction, tenantId, planId);

        if (expectedRevision === 0) {
          if (current)
            throw new PlanResourceStoreError(
              "invalid_creation_revision",
              "A plan already exists at this resource id.",
              { status: 409 },
            );
          const resourceIdTaken = (
            await transaction.query(
              "SELECT id, tenant_id, deleted_at FROM plans WHERE id = ?",
              [planId],
            )
          ).rows[0];
          // A plan of this space deleted at this id (in the trash, or
          // deleted before it existed) is replaced: erased, then created
          // anew — what a second sending of the same content after a
          // deletion means (Astro Sync derives the id from it). Another
          // space's id is refused as ever, and says nothing of it.
          let replaced = null;
          if (
            resourceIdTaken?.tenant_id === tenantId &&
            resourceIdTaken.deleted_at
          ) {
            replaced = await erasePlanRows(transaction, { tenantId, planId });
            await audit(transaction, {
              tenantId,
              userId,
              eventType: "plan.erased",
              details: { planId, replacedByCreation: true },
            });
          } else if (resourceIdTaken)
            throw new PlanResourceStoreError(
              "invalid_creation_revision",
              "A plan already exists at this resource id.",
              { status: 409 },
            );
          if (await clientPlanIdTaken(transaction, tenantId, fields.clientId))
            throw new PlanResourceStoreError(
              "client_id_conflict",
              "A plan already uses this browser client id.",
              { status: 409 },
            );
          await refuseBeyondPlanLimit(transaction, tenantId, planLimit, {
            plannerMultiple,
            date: fields.planDate,
            guidedEvening: fields.guidedEvening === 1,
          });
          await refuseNightPlaceConflict(transaction, tenantId, {
            fields,
            closedAs: normalizedPayload.closedAs,
            moving: movingPlanIds,
          });
          refuseClosureOfFutureNight({
            closedAs: normalizedPayload.closedAs,
            previousClosedAs: null,
            fields,
            timestamp,
          });
          const decided = freezeAbandonedClosure({
            closedAs: normalizedPayload.closedAs,
            fields,
            timestamp,
          });
          const links = await checkProjectLinks(
            transaction,
            tenantId,
            projectLinks,
            {
              previousItems: [],
              nextItems: fields.items,
              restUnchanged: false,
            },
          );
          await insertPlanProjection(transaction, {
            tenantId,
            userId,
            planId,
            fields,
            revision: 1,
            timestamp,
          });
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "plan.resource_created",
            details: { planId, originDeviceId: originDeviceId || null },
          });
          if (decided)
            await audit(transaction, {
              tenantId,
              userId,
              eventType: "plan.debriefed_abandoned",
              details: { planId, automatic: true },
              at: timestamp,
            });
          const linkDomains = await followProjectLinks(transaction, {
            tenantId,
            userId,
            planId,
            links,
            at: timestamp,
          });
          const framingsChanged = await replacePlanFramings(transaction, {
            tenantId,
            planId,
            framingIds,
          });
          return {
            created: true,
            framingsChanged: framingsChanged || Boolean(replaced?.framings),
            linkDomains: replaced?.sessions
              ? [...(linkDomains ?? []), "sessions"]
              : linkDomains,
            ...(decided ? { debriefDecided: true } : {}),
            resource: resourceForPlanRow({
              id: planId,
              revision: 1,
              status: fields.status,
              night_start_at: fields.nightStartAt,
              night_end_at: fields.nightEndAt,
              frozen_at: fields.frozenAt ?? null,
              updated_at: timestamp,
              payload_json: fields.payloadJson,
            }),
          };
        }

        if (!current) {
          const preserved = await latestPreservedPlanVersion(
            transaction,
            tenantId,
            planId,
            dialect,
          );
          if (!preserved) return { kind: "missing" };
          const versionId = await setAsidePlanPayload(transaction, {
            tenantId,
            planId,
            revision: expectedRevision,
            originDeviceId,
            payloadJson: fields.payloadJson,
            timestamp,
          });
          return {
            kind: "conflict",
            serverRevision: planRevision(preserved.revision),
            serverPayload: versionForRow(preserved).payload,
            versionId,
          };
        }

        const currentRevision = planRevision(current.revision);
        if (apiPlanStatus(current.status) !== "active")
          // serverRevision/serverPayload are additive here (plan.schema.json's
          // refused-write shape requires both on every entry of its oneOf,
          // the frozen-with-no-session bare body included): a client written
          // before these fields existed, reading only error.code, is unaffected,
          // and the debrief's own session-supplement enrichment (added by the PUT
          // route, see portal-app/routes/api/v1/plans/[planId]/route.js) layers
          // supplementId/sessionId on top of exactly this body.
          return {
            kind: "frozen",
            serverRevision: currentRevision,
            serverPayload: resourceForPlanRow(current).payload,
          };
        if (expectedRevision !== currentRevision) {
          const versionId = await setAsidePlanPayload(transaction, {
            tenantId,
            planId,
            revision: expectedRevision,
            originDeviceId,
            payloadJson: fields.payloadJson,
            timestamp,
          });
          return {
            kind: "conflict",
            serverRevision: currentRevision,
            serverPayload: resourceForPlanRow(current).payload,
            versionId,
          };
        }
        if (
          await clientPlanIdTaken(
            transaction,
            tenantId,
            fields.clientId,
            planId,
          )
        )
          throw new PlanResourceStoreError(
            "client_id_conflict",
            "A plan already uses this browser client id.",
            { status: 409 },
          );

        if (
          fields.status === "pending" &&
          current.plan_date !== fields.planDate
        )
          await refuseBeyondPlanLimit(transaction, tenantId, planLimit, {
            plannerMultiple,
            date: fields.planDate,
            guidedEvening: fields.guidedEvening === 1,
            planId,
          });
        await refuseNightPlaceConflict(transaction, tenantId, {
          planId,
          fields,
          closedAs: normalizedPayload.closedAs,
          current,
          moving: movingPlanIds,
        });
        refuseClosureOfFutureNight({
          closedAs: normalizedPayload.closedAs,
          previousClosedAs: storedClosedAs(current.settings_json),
          fields,
          timestamp,
        });
        const decided = freezeAbandonedClosure({
          closedAs: normalizedPayload.closedAs,
          previousClosedAs: storedClosedAs(current.settings_json),
          fields,
          timestamp,
        });
        const links = await checkProjectLinks(
          transaction,
          tenantId,
          projectLinks,
          {
            previousItems: storedItemsOf(current.payload_json),
            nextItems: fields.items,
            // Asked only in the read-only window, where only the links may
            // change.
            restUnchanged:
              projectLinks?.readOnly === true &&
              withoutProjectLinks(
                parseJson(current.payload_json, {}),
                canonicalJson,
              ) ===
                withoutProjectLinks(
                  parseJson(fields.payloadJson, {}),
                  canonicalJson,
                ),
          },
        );
        const nextRevision = currentRevision + 1;
        const updated = await updatePlanProjection(transaction, {
          tenantId,
          planId,
          expectedRevision,
          fields,
          nextRevision,
          timestamp,
        });
        if (!updated.rowCount) {
          const latest = await planRowFor(transaction, tenantId, planId);
          if (!latest) return { kind: "missing" };
          if (apiPlanStatus(latest.status) !== "active")
            return {
              kind: "frozen",
              serverRevision: planRevision(latest.revision),
              serverPayload: resourceForPlanRow(latest).payload,
            };
          const versionId = await setAsidePlanPayload(transaction, {
            tenantId,
            planId,
            revision: expectedRevision,
            originDeviceId,
            payloadJson: fields.payloadJson,
            timestamp,
          });
          return {
            kind: "conflict",
            serverRevision: planRevision(latest.revision),
            serverPayload: resourceForPlanRow(latest).payload,
            versionId,
          };
        }
        await archivePlannerPayload(transaction, {
          tenantId,
          plan: current,
          payloadJson: current.payload_json,
          timestamp,
        });
        await replacePlanItems(transaction, {
          tenantId,
          planId,
          items: fields.items,
          timestamp,
        });
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "plan.resource_updated",
          details: { planId, originDeviceId: originDeviceId || null },
        });
        if (decided)
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "plan.debriefed_abandoned",
            details: { planId, automatic: true },
            at: timestamp,
          });
        const framingsChanged = await replacePlanFramings(transaction, {
          tenantId,
          planId,
          framingIds,
        });
        const linkDomains = await followProjectLinks(transaction, {
          tenantId,
          userId,
          planId,
          links,
          at: timestamp,
        });
        return {
          created: false,
          framingsChanged,
          linkDomains,
          ...(decided ? { debriefDecided: true } : {}),
          resource: resourceForPlanRow({
            ...current,
            revision: nextRevision,
            status: fields.status,
            frozen_at: fields.frozenAt ?? current.frozen_at ?? null,
            updated_at: timestamp,
            payload_json: fields.payloadJson,
            night_start_at: fields.nightStartAt,
            night_end_at: fields.nightEndAt,
          }),
        };
      });
      // A conflict/missing/frozen/framing_missing refusal writes nothing:
      // only a returned `resource` (creation or update) is a validated write
      // worth a signal. `framings` rides along whenever the plan's own set
      // of referenced framings changed. Every payload the caller sees —
      // including a refusal's `serverPayload` — is hydrated.
      await hydrateResultPayloads(db, tenantId, result);
      if (result?.resource) {
        publishChange({
          tenantId,
          domains: [
            "plans",
            // A plan given up leaves the debrief queue at once.
            ...(result.debriefDecided ? ["debrief"] : []),
            ...(result.framingsChanged ? ["framings"] : []),
            ...(result.linkDomains ?? []),
          ],
          originClientInstanceId,
        });
        // A plan's place may carry an entered sky value.
        await calibrationValuesChanged(tenantId);
      }
      return result;
    },

    /**
     * A deletion is soft: the row keeps its identity, items and every
     * retained version, and only disappears from both read protocols. The
     * current payload is archived first so a later device write conflicts
     * against it and a set-aside version can restore the plan. The plan
     * goes to the trash (`purge_at`, 30 days later): « Plans supprimés »
     * restores it, the maintenance erases it.
     *
     * A plan whose night runs on a device (a live session open or paused)
     * is refused `plan_in_progress` when `refuseInProgress` (the web asks
     * first); with `force`, its open session goes to the trash with it, at
     * the same instant, and comes back with it. A device's deletion keeps
     * the rule it always had (neither refused nor followed).
     */
    async deletePlanResource({
      tenantId,
      userId,
      planId,
      expectedRevision,
      originClientInstanceId = null,
      refuseInProgress = false,
      force = false,
      timestamp = now(),
    }) {
      const result = await db.transaction(async (transaction) => {
        const current = await planRowFor(transaction, tenantId, planId);
        if (!current) return { kind: "missing" };
        if (!planResourceDeletable(current.status)) {
          const sessionIds = await liveSessionIdsOf(
            transaction,
            tenantId,
            planId,
          );
          if (sessionIds.length)
            throw planNotDeletableError(null, { sessionIds });
        }
        const currentRevision = planRevision(current.revision);
        if (expectedRevision !== currentRevision)
          return {
            kind: "conflict",
            serverRevision: currentRevision,
            serverPayload: resourceForPlanRow(current).payload,
          };
        const running = (
          await transaction.query(
            `SELECT id, updated_at FROM observation_sessions
             WHERE tenant_id = ? AND plan_id = ? AND deleted_at IS NULL
               AND finished_at IS NULL AND status IN ('open', 'paused')`,
            [tenantId, planId],
          )
        ).rows;
        if (running.length && refuseInProgress && !force)
          throw planInProgressError(running[0]);
        const deleted = await transaction.run(
          `UPDATE plans SET deleted_at = ?, purge_at = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ? AND revision = ? AND deleted_at IS NULL`,
          [
            timestamp,
            purgeAtOf(timestamp),
            timestamp,
            planId,
            tenantId,
            expectedRevision,
          ],
        );
        if (!deleted.rowCount) return { kind: "missing" };
        if (running.length && force)
          for (const session of running)
            await transaction.run(
              `UPDATE observation_sessions SET deleted_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
              [timestamp, timestamp, session.id, tenantId],
            );
        if (current.payload_json !== null && current.payload_json !== undefined)
          await archivePlannerPayload(transaction, {
            tenantId,
            plan: current,
            payloadJson: current.payload_json,
            timestamp,
          });
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "plan.resource_deleted",
          details: { planId, revision: currentRevision },
        });
        // A soft-deleted plan's `plan_framings` rows are left as-is (mirroring
        // `plans.deleted_at` itself): `framingUsage`'s own join already
        // excludes a deleted plan, so any framing this one referenced may
        // just have changed state (e.g. its last executed plan disappearing).
        const hadFramings = await planHasFramings(
          transaction,
          tenantId,
          planId,
        );
        return {
          deleted: true,
          revision: currentRevision,
          hadFramings,
          sessionsDeleted: force ? running.length : 0,
        };
      });
      await hydrateResultPayloads(db, tenantId, result);
      if (result?.deleted)
        publishChange({
          tenantId,
          domains: [
            "plans",
            ...(result.hadFramings ? ["framings"] : []),
            ...(result.sessionsDeleted ? ["sessions"] : []),
          ],
          originClientInstanceId,
        });
      if (result?.deleted) await calibrationValuesChanged(tenantId);
      return result;
    },

    async restorePlanResource({
      tenantId,
      userId,
      planId,
      versionId,
      originClientInstanceId = null,
      planLimit = 0,
      plannerMultiple = true,
      projectLinks = null,
      timestamp = now(),
    }) {
      const result = await db.transaction(async (transaction) => {
        await lockTenantPlans(transaction, tenantId);
        await purgeExpiredSetAsideVersions(transaction, {
          tenantId,
          planId,
          timestamp,
        });
        const version = (
          await transaction.query(
            `SELECT * FROM plan_versions
             WHERE id = ? AND tenant_id = ? AND plan_id = ? AND state = ?`,
            [versionId, tenantId, planId, "set_aside"],
          )
        ).rows[0];
        if (!version) return { kind: "missing" };
        const payload = normalizePlanResourcePayload(
          versionForRow(version).payload,
        );
        const fields = normalizedPlanFields(payload);
        const framingIds = referencedFramingIds(fields.items);
        if (framingIds.length > 0) {
          const missing = await missingFramingIds(
            transaction,
            tenantId,
            framingIds,
          );
          if (missing.length > 0)
            return { kind: "framing_missing", missingFramingIds: missing };
        }
        // A deleted plan is restorable in place: its row still holds the
        // resource identity that a recreation would otherwise collide with.
        const current = await planRowFor(transaction, tenantId, planId, {
          includeDeleted: true,
        });
        if (!current) {
          const resourceIdTaken = (
            await transaction.query("SELECT id FROM plans WHERE id = ?", [
              planId,
            ])
          ).rows[0];
          if (resourceIdTaken) return { kind: "missing" };
          const latest = await latestPreservedPlanVersion(
            transaction,
            tenantId,
            planId,
            dialect,
          );
          await refuseBeyondPlanLimit(transaction, tenantId, planLimit, {
            plannerMultiple,
            date: fields.planDate,
            guidedEvening: fields.guidedEvening === 1,
          });
          await refuseNightPlaceConflict(transaction, tenantId, {
            fields,
            closedAs: payload.closedAs,
          });
          const nextRevision = planRevision(latest?.revision) + 1;
          const links = await checkProjectLinks(
            transaction,
            tenantId,
            projectLinks,
            { previousItems: [], nextItems: fields.items },
          );
          await insertPlanProjection(transaction, {
            tenantId,
            userId,
            planId,
            fields,
            revision: nextRevision,
            timestamp,
          });
          await audit(transaction, {
            tenantId,
            userId,
            eventType: "plan.resource_restored",
            details: { planId, versionId, recreated: true },
          });
          const framingsChanged = await replacePlanFramings(transaction, {
            tenantId,
            planId,
            framingIds,
          });
          const linkDomains = await followProjectLinks(transaction, {
            tenantId,
            userId,
            planId,
            links,
            at: timestamp,
          });
          return {
            framingsChanged,
            linkDomains,
            resource: resourceForPlanRow({
              id: planId,
              revision: nextRevision,
              status: fields.status,
              night_start_at: fields.nightStartAt,
              night_end_at: fields.nightEndAt,
              frozen_at: null,
              updated_at: timestamp,
              payload_json: fields.payloadJson,
            }),
          };
        }
        if (apiPlanStatus(current.status) !== "active")
          return { kind: "frozen" };
        if (
          await clientPlanIdTaken(
            transaction,
            tenantId,
            fields.clientId,
            planId,
          )
        )
          throw new PlanResourceStoreError(
            "client_id_conflict",
            "A plan already uses this browser client id.",
            { status: 409 },
          );
        const recreated = Boolean(current.deleted_at);
        if (recreated || current.plan_date !== fields.planDate)
          await refuseBeyondPlanLimit(transaction, tenantId, planLimit, {
            plannerMultiple,
            date: fields.planDate,
            guidedEvening: fields.guidedEvening === 1,
            planId,
          });
        await refuseNightPlaceConflict(transaction, tenantId, {
          planId,
          fields,
          closedAs: payload.closedAs,
          current: recreated ? null : current,
        });
        const links = await checkProjectLinks(
          transaction,
          tenantId,
          projectLinks,
          {
            previousItems: storedItemsOf(current.payload_json),
            nextItems: fields.items,
          },
        );
        const nextRevision = planRevision(current.revision) + 1;
        const updated = await updatePlanProjection(transaction, {
          tenantId,
          planId,
          expectedRevision: planRevision(current.revision),
          fields,
          nextRevision,
          timestamp,
          restoreDeleted: recreated,
        });
        if (!updated.rowCount) {
          const latest = await planRowFor(transaction, tenantId, planId);
          if (!latest) return { kind: "missing" };
          if (apiPlanStatus(latest.status) !== "active")
            return { kind: "frozen" };
          return {
            kind: "conflict",
            serverRevision: planRevision(latest.revision),
            serverPayload: resourceForPlanRow(latest).payload,
          };
        }
        // The deletion already archived this exact payload at this exact
        // revision; archiving again would only duplicate that history row.
        if (!recreated)
          await archivePlannerPayload(transaction, {
            tenantId,
            plan: current,
            payloadJson: current.payload_json,
            timestamp,
          });
        await replacePlanItems(transaction, {
          tenantId,
          planId,
          items: fields.items,
          timestamp,
        });
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "plan.resource_restored",
          details: { planId, versionId, recreated },
        });
        const framingsChanged = await replacePlanFramings(transaction, {
          tenantId,
          planId,
          framingIds,
        });
        const linkDomains = await followProjectLinks(transaction, {
          tenantId,
          userId,
          planId,
          links,
          at: timestamp,
        });
        return {
          framingsChanged,
          linkDomains,
          resource: resourceForPlanRow({
            ...current,
            revision: nextRevision,
            status: fields.status,
            updated_at: timestamp,
            payload_json: fields.payloadJson,
            night_start_at: fields.nightStartAt,
            night_end_at: fields.nightEndAt,
          }),
        };
      });
      await hydrateResultPayloads(db, tenantId, result);
      if (result?.resource) {
        publishChange({
          tenantId,
          domains: [
            "plans",
            ...(result.framingsChanged ? ["framings"] : []),
            ...(result.linkDomains ?? []),
          ],
          originClientInstanceId,
        });
        // A plan's place may carry an entered sky value.
        await calibrationValuesChanged(tenantId);
      }
      return result;
    },

    /**
     * The lazy, durable catch-up api/v1.md's "The night boundaries of a
     * plan" describes: derives and persists nightStartAt/nightEndAt for
     * every ACTIVE, non-frozen plan of a tenant whose bounds were never
     * resolved — a row written before the column existed (night_end_at literally
     * NULL, never computed) or any row written before this migration.
     * `night_bounds_resolved_at IS NULL` is exactly that set: every write
     * that goes through writePlanResource/restorePlanResource stamps it,
     * whatever the two boundaries come out to be, so a plan already
     * resolved — even to a null pair — is never re-derived here, and a
     * frozen plan is never reached at all (its status is no longer
     * 'pending'). Runs in its own transaction; the caller (GET
     * /v1/plans/debrief-queue) is expected to call this before applying
     * the queue test, exactly as POST /v1/plans/{planId}/debrief must call
     * it for its one plan before anything else. Returns the number of
     * plans it resolved.
     */
    async catchUpNightBounds({ tenantId, timestamp = now() }) {
      return await db.transaction(async (transaction) => {
        const pending = (
          await transaction.query(
            `SELECT id, payload_json FROM plans
             WHERE tenant_id = ? AND status = ? AND deleted_at IS NULL
               AND night_bounds_resolved_at IS NULL`,
            [tenantId, "pending"],
          )
        ).rows;
        let resolved = 0;
        for (const row of pending) {
          const payload = parseJson(row.payload_json);
          const bounds = plainObject(payload)
            ? deriveNightBounds(payload)
            : { nightStartAt: null, nightEndAt: null };
          const updated = await transaction.run(
            `UPDATE plans SET night_start_at = ?, night_end_at = ?, night_bounds_resolved_at = ?
             WHERE id = ? AND tenant_id = ? AND night_bounds_resolved_at IS NULL`,
            [
              bounds.nightStartAt,
              bounds.nightEndAt,
              timestamp,
              row.id,
              tenantId,
            ],
          );
          resolved += updated.rowCount;
        }
        return { resolved };
      });
    },

    async briefing({ tenantId, timestamp = now() }) {
      return await db.transaction(async (transaction) => {
        const date = timestamp.slice(0, 10);
        const active = (await listRows(transaction, tenantId)).filter(
          (plan) => apiPlanStatus(plan.status) === "active",
        );
        const current = [...active]
          .filter((plan) => plan.plan_date <= date)
          .sort((left, right) =>
            right.plan_date.localeCompare(left.plan_date),
          )[0];
        const next =
          active.find((plan) => plan.plan_date > date) ||
          (!current ? active[0] : null);
        const summaryFor = (plan) => {
          if (!plan) return null;
          const payload = resourceForPlanRow(plan).payload;
          const item = payload.items[0] || null;
          return {
            id: plan.id,
            name: plan.name,
            status: apiPlanStatus(plan.status),
            nightEndAt: plan.night_end_at || null,
            countdownAt: plan.night_end_at || null,
            nextTarget: item
              ? String(item.designation || item.name || item.id || "") || null
              : null,
          };
        };
        return {
          generatedAt: timestamp,
          currentPlan: summaryFor(current),
          nextPlan: summaryFor(next),
        };
      });
    },
  };
}

/**
 * Reads and writes the complete private planner document through a shared
 * async driver. Plan items are fetched once for the whole tenant, then
 * associated in memory; this prevents a query per plan on large histories.
 */
export async function createPlannerStateRepository({
  databasePath,
  databaseUrl,
  driver,
  // The driver knows what it speaks; the URL heuristic is only for the
  // case where this repository opens its own connection. A caller that
  // hands in a PostgresDriver without a URL used to be mis-detected as
  // SQLite — harmless while every migration was portable, fatal from
  // migration 21 on (`rowid` vs `seq`).
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  // This is a data migration rather than a portable SQL statement: JSON
  // materialization must share the web projection and item ordering on both
  // database backends. Re-running it is harmless because it only fills NULLs.
  await db.transaction(
    async (transaction) => await backfillAllPlannerPayloadsFor(transaction),
  );
  // The browser's fusion modal reuses the granular v1 writer/restorer
  // wholesale (revision guard, history archiving, item projection,
  // `plans`-domain signal) instead of re-implementing any of that here.
  // Sharing `db` means this never opens a second connection/pool.
  const resourceStore = await createPlanResourceRepository({
    driver: db,
    dialect,
  });

  async function plannerStateFor(driverForRead, tenantId) {
    const { planRows: storedRows, itemsByPlanId } = await plannerRowsWithItems(
      driverForRead,
      tenantId,
    );
    // The internal plan of a guided evening is not a plan of the web planner
    // (no list, no night, no editing): the document leaves it out. Left out
    // is not deleted: a save names the plans it deletes (`deletedPlanIds`),
    // and a plan absent from the document stays as it is.
    const planRows = storedRows.filter(
      (plan) => Number(plan.guided_evening) !== 1,
    );
    // A PostgreSQL transaction owns one client. Keep these independent reads
    // serial on that client rather than issuing concurrent client.query calls.
    // The places of a space are no longer part of this document: they are read
    // and written by `/v1/places` (`place-repository.js`); `knownLocations`
    // stays the visitor's own store in the browser.
    const horizonRows = await driverForRead.query(
      `SELECT client_id, details_json, is_active FROM horizon_profiles
       WHERE tenant_id = ? ORDER BY created_at, client_id`,
      [tenantId],
    );
    const contextRow = await driverForRead.query(
      "SELECT details_json FROM planner_contexts WHERE tenant_id = ?",
      [tenantId],
    );
    const plans = planRows.map((plan) =>
      plannerPayloadFor(plan, itemsByPlanId.get(plan.id) || []),
    );
    const horizonProfiles = plannerHorizonProfiles(
      horizonRows.rows.map((row) => ({
        ...parseJson(row.details_json, {}),
        id: row.client_id,
      })),
    );
    const activeHorizonProfileId = horizonRows.rows.find((row) =>
      Boolean(row.is_active),
    )?.client_id;
    const context = parseJson(contextRow.rows[0]?.details_json, {});
    // The plan-list trigger ("Comparer") must survive a reload, not only
    // appear right after the save that first discovered the staleness
    // (`savePlannerState`'s own `divergentPlanIds`). A live browser-origin
    // set-aside row is exactly that discovery, so the plans list a fresh
    // `GET` returns already flags it.
    const divergentRows = await driverForRead.query(
      `SELECT DISTINCT p.client_id AS client_id
       FROM plan_versions v
       JOIN plans p ON p.id = v.plan_id AND p.tenant_id = v.tenant_id
       WHERE v.tenant_id = ? AND v.state = ? AND v.origin_device_id IS NULL
         AND p.deleted_at IS NULL`,
      [tenantId, "set_aside"],
    );
    // A phone never writes the document's `nights`, so the night of a plan
    // it made is completed here — what is served is written back as it is
    // (`PUT /api/plans` keeps validating strictly). The plans whose night
    // runs on a device, by the id the page knows them under — additive,
    // read-only, like `divergentPlanIds`; a write never stores it.
    const executions = await executionStatesForPlanRows(
      driverForRead,
      tenantId,
      planRows,
    );
    const executionByPlanId = {};
    for (const row of planRows) {
      const execution = executions.get(row.id);
      if (execution)
        executionByPlanId[row.client_id] = {
          state: execution.executionState,
          sessionId: execution.executionSessionId,
        };
    }
    return repairPlannerDocument({
      ...context,
      ...(Object.keys(executionByPlanId).length ? { executionByPlanId } : {}),
      plans,
      horizonProfiles,
      activeHorizonProfileId: horizonProfiles.some(
        (profile) => profile.id === activeHorizonProfileId,
      )
        ? activeHorizonProfileId
        : null,
      // Additive, like `savePlannerState`'s own field of the same name: an
      // older client simply never reads it.
      divergentPlanIds: divergentRows.rows.map((row) => row.client_id),
    });
  }

  return {
    async close() {
      if (ownsDriver) await db.close();
    },
    async plannerState(tenantId) {
      return await plannerStateFor(db, tenantId);
    },
    async backfillPlanPayloads(tenantId) {
      return await db.transaction(
        async (transaction) =>
          await backfillPlannerPayloadsFor(transaction, tenantId),
      );
    },
    /**
     * `planLimit` and `readOnly` are the v1 API's own rights, resolved by
     * the caller from the same entitlement provider: a new active plan
     * beyond `planLimit` is refused with `plan_limit_reached`, and while
     * `readOnly` (the read-only window) any plan created or
     * changed is refused with `entitlement_read_only` — deleting a plan, or
     * saving the rest of the planner, stays allowed. Nothing is written by
     * a refused save.
     */
    async savePlannerState({
      tenantId,
      userId,
      state,
      sourceHash = null,
      importOnly = false,
      originClientInstanceId = null,
      planLimit = 0,
      plannerMultiple = true,
      readOnly = false,
      projectLinks = null,
    }) {
      validatePlannerDocument(state);
      // The acquisition lines of every plan are checked as a v1 plan write
      // checks them, before anything is written, then kept as the reading
      // keeps them (`plan-acquisition.js`).
      for (const [index, plan] of state.plans.entries()) {
        const refused = planAcquisitionRefusal(plan);
        if (refused)
          throw new PlanResourceStoreError("invalid_payload", refused.message, {
            field: `plans[${index}].${refused.field}`,
            limit: refused.limit,
            planIds: [String(plan.id)],
          });
      }
      // Set inside the transaction below; read only after it has committed,
      // so `publishChange` never fires from inside an uncommitted write
      // (emit after the transaction, never during it).
      let didWrite = true;
      let framingsChanged = false;
      // Read only after the transaction returns, exactly like
      // `framingsChanged` above — assigned from inside the closure
      // below.
      let divergentPlanIds = [];
      // A plan whose items name a `framingId` this tenant's framing
      // library does not have is refused on its own — exactly like
      // `writePlanResource`'s `409 framing_missing` — without failing the
      // rest of this full-document save. Read only after the transaction
      // returns, same doctrine as `divergentPlanIds` above.
      let framingMissingPlanIds = [];
      // The domains the links written with the plans carry along (the
      // integrations that follow a night), signalled after the commit.
      const linkDomains = new Set();
      const result = await db.transaction(async (transaction) => {
        await lockTenantPlans(transaction, tenantId);
        let existingContext = parseJson(
          (
            await transaction.query(
              "SELECT details_json FROM planner_contexts WHERE tenant_id = ?",
              [tenantId],
            )
          ).rows[0]?.details_json,
          {},
        );
        if (existingContext.schemaVersion === 2 && state.schemaVersion !== 2)
          throw new Error(
            "This planner has been upgraded. Reload before saving or importing plans.",
          );
        if (sourceHash) {
          const existingImport = (
            await transaction.query(
              "SELECT id FROM planner_imports WHERE tenant_id = ? AND source_hash = ?",
              [tenantId, sourceHash],
            )
          ).rows[0];
          if (existingImport) {
            // This exact import already landed: nothing changed this time,
            // so no signal is worth emitting.
            didWrite = false;
            return {
              imported: false,
              state: await plannerStateFor(transaction, tenantId),
            };
          }
        }
        if (
          importOnly &&
          state.schemaVersion === 2 &&
          existingContext.schemaVersion !== 2
        ) {
          const existing = await plannerStateFor(transaction, tenantId);
          if (existing.plans.length) {
            const migrated = migratePlannerState(
              { ...state, ...existing, schemaVersion: 1, nights: [] },
              state,
            );
            existingContext = migrated;
            for (const plan of migrated.plans) {
              const { items: _items, ...settings } = plan;
              await transaction.run(
                "UPDATE plans SET settings_json = ? WHERE tenant_id = ? AND client_id = ?",
                [JSON.stringify(settings), tenantId, plan.id],
              );
            }
          }
        }
        if (sourceHash)
          await transaction.run(
            "INSERT INTO planner_imports (id, tenant_id, source_hash, created_at) VALUES (?, ?, ?, ?)",
            [randomUUID(), tenantId, sourceHash, now()],
          );

        const plans = state.plans.map(normalizePlanAcquisition);
        const horizonProfiles = plannerHorizonProfiles(
          Array.isArray(state?.horizonProfiles) ? state.horizonProfiles : [],
        );
        const activeHorizonProfileId = horizonProfiles.some(
          (profile) => profile.id === state?.activeHorizonProfileId,
        )
          ? state.activeHorizonProfileId
          : null;
        const timestamp = now();
        // A first post-migration web save may remove a legacy plan that the
        // browser no longer carries. Materialize every older row before the
        // deletion loop so its recoverable history is not lost.
        await backfillPlannerPayloadsFor(transaction, tenantId);
        const allStoredPlans = (
          await transaction.query(
            "SELECT id, client_id, name, location_json, settings_json, payload_json, revision, deleted_at, plan_date, status, frozen_at, archived_from FROM plans WHERE tenant_id = ?",
            [tenantId],
          )
        ).rows;
        // A plan deleted through v1 stays deleted. An older browser document
        // still carrying it must neither resurrect its row nor insert a
        // second row under the same client id.
        const deletedClientIds = new Set(
          allStoredPlans
            .filter((plan) => plan.deleted_at)
            .map((plan) => plan.client_id),
        );
        const storedPlans = allStoredPlans.filter((plan) => !plan.deleted_at);
        const storedPlansByClientId = new Map(
          storedPlans.map((plan) => [plan.client_id, plan]),
        );
        // A plan absent from the submitted document is not necessarily a
        // plan the browser wants gone: a device that writes plans through
        // /v1/plans/{planId} (never through this full-document save) can
        // create one this browser's in-memory document has simply never
        // learned about yet. Only a client_id the browser explicitly names
        // here as removed is a deletion; every other absent plan is left
        // untouched, exactly like `deletedClientIds` already leaves an
        // already-deleted plan untouched on the way in.
        const explicitlyDeletedClientIds = new Set(
          (Array.isArray(state?.deletedPlanIds) ? state.deletedPlanIds : [])
            .map((id) => identifier(id, null))
            .filter(Boolean),
        );
        const storedPlanIds = storedPlans.map((plan) => plan.id);
        const plansWithItems = new Set();
        if (importOnly && storedPlanIds.length) {
          const placeholders = storedPlanIds.map(() => "?").join(", ");
          const rows = (
            await transaction.query(
              `SELECT DISTINCT plan_id FROM plan_items
               WHERE plan_id IN (${placeholders})`,
              storedPlanIds,
            )
          ).rows;
          for (const row of rows) plansWithItems.add(row.plan_id);
        }
        // The plans this save leaves pending, by date, must agree on the
        // place — read on the document as it WILL be stored (the plans of the
        // document over the stored plans it does not carry), so that a night
        // moved to another place in one save is not refused halfway. A bulk
        // import of the browser's own plans is not a write of a night.
        if (!importOnly)
          refuseNightPlaceConflictOfDocument({
            plans,
            storedPlans,
            deletedClientIds,
            explicitlyDeletedClientIds,
          });
        // What the service serves for each stored plan: a plan the document
        // carries exactly as it is served is not written.
        const served = new Map();
        if (!importOnly) {
          const { planRows, itemsByPlanId } = await plannerRowsWithItems(
            transaction,
            tenantId,
          );
          for (const planRow of planRows)
            served.set(planRow.client_id, {
              row: planRow,
              items: itemsByPlanId.get(planRow.id) || [],
            });
        }
        const touchedPlanIds = new Set();
        let explicitlyRemovedCount = 0;
        const divergentClientIds = new Set();
        const framingMissingClientIds = new Set();
        for (const plan of plans) {
          const clientId = identifier(plan?.id, randomUUID());
          if (deletedClientIds.has(clientId)) continue;
          const status = plannerPlanStatus(plan?.status);
          const archivedAt =
            status === "archived"
              ? String(plan?.archivedAt || timestamp)
              : null;
          let row = storedPlansByClientId.get(clientId);
          // An archived plan is never brought back to a closed night's state
          // (executed, in part, abandoned) by a full-document save: the web
          // gives an archived plan back only as planned (« Restaurer »), so a
          // copy that still says « executed » is a copy that predates the
          // archive — another tab, a screen kept through a change signal —
          // and its revision, rebased on the last one the page was told
          // (`rebaseOnRevisions`), no longer tells it from a fresh one. The
          // way back to the outcome is `POST /v1/plans/{planId}/unarchive`.
          if (
            row &&
            !importOnly &&
            row.status === "archived" &&
            DEBRIEF_PLAN_OUTCOMES.includes(status)
          )
            continue;
          // A plan the document carries as the service serves it is left alone
          // — no revision, no `updated_at`, no history — whatever revision the
          // copy was read at (nothing differs, so nothing can conflict). A
          // plan that is history (executed, partial, abandoned, archived) is
          // never rewritten by a save that leaves it in the same state: the
          // web does not edit it, so a difference is only the copy's own
          // normalisation.
          if (row && !importOnly && served.has(clientId)) {
            const stored = served.get(clientId);
            if (row.status !== "pending" && row.status === status) continue;
            const { items: unchangedItems, missingFramingIds: unknown } =
              await dehydrateAndCheckFramings(
                transaction,
                tenantId,
                Array.isArray(plan?.items) ? plan.items : [],
              );
            if (
              !unknown.length &&
              planStoredAlready({
                plan,
                clientId,
                row: stored.row,
                storedItems: stored.items,
                items: unchangedItems,
                status,
              })
            )
              continue;
          }
          // Revision guard against overwriting ("règle de révision"): an
          // existing plan whose stored revision has moved on from the
          // revision this browser's copy was read at (another device wrote
          // it meanwhile) is not replaced. The browser's attempted content
          // is preserved as a set-aside version instead — the same doctrine
          // `writePlanResource` already applies per plan — and the plan id
          // is reported back as divergent so the caller can show the
          // merge-modal trigger. A plan with no `revision` field at all is
          // an older browser or a brand-new plan: handled exactly as before
          // this task, unconditionally.
          if (row && !importOnly) {
            const baseRevision = Number(plan?.revision);
            const knowsBaseRevision =
              Number.isInteger(baseRevision) && baseRevision > 0;
            const storedRevision = planRevision(row.revision);
            if (knowsBaseRevision && baseRevision !== storedRevision) {
              // One set-aside version per plan and per surface (here: the
              // web, which carries no device id): replace it rather than
              // accumulate one per stale autosave.
              const priorSetAsideRows = (
                await transaction.query(
                  "SELECT id FROM plan_versions WHERE tenant_id = ? AND plan_id = ? AND state = ? AND origin_device_id IS NULL",
                  [tenantId, row.id, "set_aside"],
                )
              ).rows;
              for (const version of priorSetAsideRows)
                await transaction.run(
                  "DELETE FROM plan_versions WHERE id = ?",
                  [version.id],
                );
              const { items: _items, ...settings } = plan;
              await setAsidePlanPayload(transaction, {
                tenantId,
                planId: row.id,
                revision: baseRevision,
                originDeviceId: null,
                payloadJson: canonicalJson({
                  ...settings,
                  id: clientId,
                  items: Array.isArray(plan?.items) ? plan.items : [],
                }),
                timestamp,
              });
              divergentClientIds.add(clientId);
              continue;
            }
          }
          // The same dehydrate-then- check step `writePlanResource` runs,
          // applied here per plan so one plan naming an unknown `framingId`
          // refuses only that plan — its previously stored row, if any, is
          // left untouched — rather than the whole document save.
          const {
            items: dehydratedItems,
            framingIds,
            missingFramingIds: missingForPlan,
          } = await dehydrateAndCheckFramings(
            transaction,
            tenantId,
            Array.isArray(plan?.items) ? plan.items : [],
          );
          if (missingForPlan.length > 0) {
            framingMissingClientIds.add(clientId);
            continue;
          }
          // The web planner's own marks: a plan whose night is too far
          // ahead is not marked executed, in part or abandoned. Only a change
          // of status is asked (a plan already marked is saved as it is), and
          // a bulk import of the browser's own plans is not a mark.
          if (
            !importOnly &&
            closuresOfAFinishedNight.has(status) &&
            row?.status !== status &&
            planNightIsTooFarAhead({
              planDate: String(plan?.date ?? ""),
              nightStartAt: deriveNightBounds(plan).nightStartAt,
              now: timestamp,
            })
          )
            throw planNightNotBegunError([clientId]);
          if (readOnly) {
            if (!row) throw planReadOnlyError();
            // An archive is written in the window, as
            // `POST /v1/plans/{planId}/archive` is: putting a plan aside is
            // not a new sending of content, and plan correctness is never
            // held by a right. Only the archive is written (the status, its
            // date, the state the plan had), nothing else the copy carries:
            // refused, the plan came back « Exécuté » at the next load
            // (PLAN-ARCHIVE-RETURN-01).
            if (status === "archived" && row.status !== "archived") {
              await transaction.run(
                "UPDATE plans SET status = ?, archived_at = ?, archived_from = ?, updated_at = ? WHERE id = ?",
                [
                  status,
                  archivedAt,
                  archivedFromOnSave({ row, status }),
                  timestamp,
                  row.id,
                ],
              );
              touchedPlanIds.add(row.id);
              continue;
            }
            const storedItemRecords = (
              await transaction.query(
                "SELECT details_json FROM plan_items WHERE plan_id = ? AND tenant_id = ?",
                [row.id, tenantId],
              )
            ).rows.map((item) => parseJson(item.details_json, {}));
            const storedItems = storedItemRecords
              .map((item) => canonicalJson(item))
              .sort();
            const submittedItems = dehydratedItems
              .map((item) => canonicalJson(item || {}))
              .sort();
            const { items: _submitted, ...settings } = plan || {};
            const sameSettings =
              comparablePlanSettings(settings) ===
              comparablePlanSettings(parseJson(row.settings_json, {}));
            if (
              sameSettings &&
              canonicalJson(storedItems) === canonicalJson(submittedItems)
            )
              // Unchanged: nothing to write for this plan.
              continue;
            // Only the links to a multi-night plan may change in the window,
            // and only for a space whose right is still held
            // (`isWriteRefused`); anything else is refused.
            const linkTolerated =
              sameSettings &&
              projectLinks?.allowed === true &&
              canonicalJson(
                dehydratedItems
                  .map((item) =>
                    withoutProjectLinks({ items: [item] }, canonicalJson),
                  )
                  .sort(),
              ) ===
                canonicalJson(
                  storedItemRecords
                    .map((item) =>
                      withoutProjectLinks({ items: [item] }, canonicalJson),
                    )
                    .sort(),
                );
            if (!linkTolerated) throw planReadOnlyError();
          }
          if (
            status === "pending" &&
            (!row ||
              (!importOnly &&
                (row.status !== "pending" ||
                  row.plan_date !== String(plan?.date || ""))))
          )
            await refuseBeyondPlanLimit(transaction, tenantId, planLimit, {
              plannerMultiple,
              date: String(plan?.date || ""),
              planId: row?.id,
              guidedEvening:
                plan?.guidedEvening === true ||
                storedGuidedEvening(row?.settings_json),
            });
          // The links to a multi-night plan this plan's items come with
          // (`plan-project-links.js`), checked before anything of the plan
          // is written; an import that leaves the items alone leaves their
          // links alone too.
          const writesItems =
            !importOnly || !row || !plansWithItems.has(row.id);
          const links = writesItems
            ? await checkProjectLinks(transaction, tenantId, projectLinks, {
                previousItems: row ? storedItemsOf(row.payload_json) : [],
                nextItems: dehydratedItems,
              })
            : null;
          if (!row) {
            row = {
              id: randomUUID(),
              client_id: clientId,
              settings_json: null,
              payload_json: null,
              revision: 1,
            };
            await transaction.run(
              "INSERT INTO plans (id, tenant_id, created_by_user_id, client_id, plan_date, name, location_json, equipment_json, min_altitude, status, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [
                row.id,
                tenantId,
                userId,
                clientId,
                String(plan?.date || ""),
                String(plan?.name || ""),
                JSON.stringify(plan?.location || null),
                JSON.stringify(plan?.equipment || null),
                plannerMinAltitude(plan?.minAltitude),
                status,
                archivedAt,
                timestamp,
                timestamp,
              ],
            );
            storedPlansByClientId.set(clientId, row);
          } else if (!importOnly)
            await transaction.run(
              "UPDATE plans SET plan_date = ?, name = ?, location_json = ?, equipment_json = ?, min_altitude = ?, status = ?, archived_at = ?, archived_from = ?, updated_at = ? WHERE id = ?",
              [
                String(plan?.date || ""),
                String(plan?.name || ""),
                JSON.stringify(plan?.location || null),
                JSON.stringify(plan?.equipment || null),
                plannerMinAltitude(plan?.minAltitude),
                status,
                archivedAt,
                archivedFromOnSave({ row, status }),
                timestamp,
                row.id,
              ],
            );
          if (!importOnly || !row.settings_json) {
            const { items: _items, ...settings } = plan;
            // The browser cannot close a night, so a copy that does not
            // carry the closure the phone recorded (a build that predates
            // the field) never takes it away.
            const keptClosure = storedClosedAs(row.settings_json);
            if (keptClosure && settings.closedAs === undefined)
              settings.closedAs = keptClosure;
            // Likewise a copy that does not carry the flag of a guided
            // evening's internal plan (a build that predates it) never takes
            // it away.
            if (
              settings.guidedEvening === undefined &&
              storedGuidedEvening(row.settings_json)
            )
              settings.guidedEvening = true;
            row.settings_json = JSON.stringify(settings);
            await transaction.run(
              "UPDATE plans SET settings_json = ?, guided_evening = ? WHERE id = ?",
              [
                row.settings_json,
                settings.guidedEvening === true ? 1 : 0,
                row.id,
              ],
            );
          }
          if (!importOnly || !plansWithItems.has(row.id)) {
            await transaction.run("DELETE FROM plan_items WHERE plan_id = ?", [
              row.id,
            ]);
            for (const item of dehydratedItems)
              await transaction.run(
                "INSERT INTO plan_items (id, tenant_id, plan_id, client_id, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                  randomUUID(),
                  tenantId,
                  row.id,
                  identifier(item?.id, randomUUID()),
                  JSON.stringify(item || {}),
                  timestamp,
                  timestamp,
                ],
              );
            // `plan_framings` is kept in the same transaction as the items
            // it describes, only when the items themselves were actually
            // rewritten above — an import that leaves a plan's own items
            // alone leaves its framing references alone too.
            const framingsChangedForPlan = await replacePlanFramings(
              transaction,
              { tenantId, planId: row.id, framingIds },
            );
            if (framingsChangedForPlan) framingsChanged = true;
            for (const domain of await followProjectLinks(transaction, {
              tenantId,
              userId,
              planId: row.id,
              links,
              at: timestamp,
            }))
              linkDomains.add(domain);
          }
          touchedPlanIds.add(row.id);
        }
        if (!importOnly) {
          const removed = storedPlans.filter((row) =>
            explicitlyDeletedClientIds.has(row.client_id),
          );
          // A plan that was executed — a session depends on it — is
          // not deleted from a copy that did not know it (the library
          // offers the deletion of a plan still an intention only); nor is
          // a plan a session or a capture still names, and a plan whose
          // night is running on a device (a session open or paused) is said
          // so (the database used to answer « FOREIGN KEY constraint failed
          // »). An archived plan a document no longer carries is cleared as
          // ever.
          const refused = [];
          const inProgress = [];
          for (const row of removed) {
            if (["executed", "partial"].includes(apiPlanStatus(row.status))) {
              refused.push(row.client_id);
              continue;
            }
            const sessions = (
              await transaction.query(
                "SELECT status FROM observation_sessions WHERE tenant_id = ? AND plan_id = ?",
                [tenantId, row.id],
              )
            ).rows;
            if (
              sessions.some((entry) =>
                ["open", "paused"].includes(entry.status),
              )
            ) {
              inProgress.push(row.client_id);
              continue;
            }
            const captures = (
              await transaction.query(
                "SELECT id FROM captures WHERE tenant_id = ? AND plan_id = ? LIMIT 1",
                [tenantId, row.id],
              )
            ).rows;
            if (sessions.length || captures.length) refused.push(row.client_id);
          }
          if (refused.length || inProgress.length)
            throw planNotDeletableError([...refused, ...inProgress], {
              inProgressPlanIds: inProgress,
            });
          explicitlyRemovedCount = removed.length;
          for (const row of removed) {
            // The browser explicitly named this plan as removed. Preserve
            // its current resource payload first; plan_versions
            // deliberately has no plan FK.
            if (row.payload_json !== null && row.payload_json !== undefined)
              await archivePlannerPayload(transaction, {
                tenantId,
                plan: row,
                payloadJson: row.payload_json,
                timestamp,
              });
            // To the trash, as a deletion through v1: hidden from every
            // read, restorable from « Plans supprimés » for 30 days, then
            // erased by the maintenance. Its items and framings stay with
            // the row until then (`framingUsage` already leaves a deleted
            // plan out).
            await transaction.run(
              `UPDATE plans SET deleted_at = ?, purge_at = ?, updated_at = ?
               WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
              [timestamp, purgeAtOf(timestamp), timestamp, row.id, tenantId],
            );
            if (await planHasFramings(transaction, tenantId, row.id))
              framingsChanged = true;
            await audit(transaction, {
              tenantId,
              userId,
              eventType: "plan.resource_deleted",
              details: {
                planId: row.id,
                revision: planRevision(row.revision),
              },
            });
          }
        }

        await refreshPlannerPayloadsFor(transaction, {
          tenantId,
          planIds: [...touchedPlanIds],
          timestamp,
        });

        // The document's `knownLocations` are never written for a space: a place of a space is written by
        // `/v1/places` alone, under the rule of the most recent edit, and a
        // place missing from this document is no longer deleted. The field
        // stays the visitor's store in the browser.

        const horizonProfileIds = new Set(
          horizonProfiles.map((profile) => profile.id),
        );
        // The horizon profiles as stored, before and after this save: a save
        // that writes them as they are is not a change to signal.
        const storedHorizons = async () =>
          JSON.stringify(
            (
              await transaction.query(
                "SELECT client_id, details_json, is_active FROM horizon_profiles WHERE tenant_id = ? ORDER BY client_id",
                [tenantId],
              )
            ).rows.map((row) => [
              row.client_id,
              row.details_json,
              Number(row.is_active),
            ]),
          );
        const horizonsBefore = await storedHorizons();
        if (!importOnly) {
          const storedProfiles = (
            await transaction.query(
              "SELECT id, client_id FROM horizon_profiles WHERE tenant_id = ?",
              [tenantId],
            )
          ).rows;
          for (const profile of storedProfiles)
            if (!horizonProfileIds.has(profile.client_id))
              await transaction.run(
                "DELETE FROM horizon_profiles WHERE id = ?",
                [profile.id],
              );
        }
        for (const profile of horizonProfiles)
          await transaction.run(
            "INSERT INTO horizon_profiles (id, tenant_id, client_id, details_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(tenant_id, client_id) DO UPDATE SET details_json = excluded.details_json, is_active = excluded.is_active, updated_at = excluded.updated_at",
            [
              randomUUID(),
              tenantId,
              profile.id,
              JSON.stringify(profile),
              profile.id === activeHorizonProfileId ? 1 : 0,
              timestamp,
              timestamp,
            ],
          );
        const horizonsChanged = (await storedHorizons()) !== horizonsBefore;
        // Whether the context (the nights, the active plan, the date…) holds
        // anything new; its sync stamp alone is not a change.
        let contextChanged = true;
        if (state.schemaVersion === 2) {
          const previous = existingContext;
          const context = {
            schemaVersion: 2,
            // Keep the client revision alongside the planner context. It
            // reconciles an offline browser cache after reconnecting.
            sync:
              state.sync && typeof state.sync === "object"
                ? {
                    version: Number(state.sync.version) || 1,
                    deviceId: String(state.sync.deviceId || ""),
                    updatedAt: String(state.sync.updatedAt || ""),
                  }
                : null,
            nights: importOnly
              ? [
                  ...new Map(
                    [...(state.nights || []), ...(previous.nights || [])].map(
                      (night) => [night.id, night],
                    ),
                  ).values(),
                ]
              : state.nights,
            activeNightId: importOnly
              ? previous.activeNightId || state.activeNightId
              : state.activeNightId,
            activePlanId: importOnly
              ? previous.activePlanId || state.activePlanId
              : state.activePlanId,
            date: importOnly ? previous.date || state.date : state.date,
            unassignedHorizonProfiles: importOnly
              ? [
                  ...new Map(
                    [
                      ...(state.unassignedHorizonProfiles || []),
                      ...(previous.unassignedHorizonProfiles || []),
                    ].map((profile) => [profile.id, profile]),
                  ).values(),
                ]
              : state.unassignedHorizonProfiles || [],
          };
          await transaction.run(
            "INSERT INTO planner_contexts (tenant_id, details_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET details_json = excluded.details_json, updated_at = excluded.updated_at",
            [tenantId, JSON.stringify(context), timestamp],
          );
          const withoutStamp = (value) =>
            JSON.stringify({ ...(value || {}), sync: null });
          contextChanged = withoutStamp(context) !== withoutStamp(previous);
        }
        // A save that leaves every plan, every horizon and the context as
        // they were (a page writing back what it read) signals nothing: every
        // other page and device open on the space read it again and, writing
        // in turn, kept the space in a loop of reads and writes
        // (PORTAL-SYNC-LOOP-01).
        didWrite =
          touchedPlanIds.size > 0 ||
          explicitlyRemovedCount > 0 ||
          horizonsChanged ||
          contextChanged;
        divergentPlanIds = [...divergentClientIds];
        framingMissingPlanIds = [...framingMissingClientIds];
        await audit(transaction, {
          tenantId,
          userId,
          eventType: sourceHash ? "planner.imported" : "planner.saved",
          details: {
            plans: plans.length,
            horizonProfiles: horizonProfiles.length,
            divergentPlans: divergentClientIds.size,
            framingMissingPlans: framingMissingClientIds.size,
          },
        });
        return {
          imported: Boolean(sourceHash),
          state: await plannerStateFor(transaction, tenantId),
        };
      });
      if (didWrite) {
        const domains = ["plans"];
        if (framingsChanged) domains.push("framings");
        domains.push(...linkDomains);
        publishChange({ tenantId, domains, originClientInstanceId });
        // The plans may carry entered sky values.
        await calibrationValuesChanged(tenantId);
      }
      // Additive: an older client simply never reads these fields, exactly
      // like every other additive addition this file makes to a refusal
      // shape. Always present (possibly empty) rather than omitted, so the
      // web never has to distinguish "no field" from "nothing diverged"/
      // "nothing refused".
      return { ...result, divergentPlanIds, framingMissingPlanIds };
    },

    /**
     * What the fusion modal needs to render "Deux versions de ce plan" for a
     * browser — the plan's current (already-live) revision, the most recent
     * version its own stale save set aside, and the permanently retained
     * `history` rows for the "Versions précédentes" section. `null` when
     * [clientId] names no live plan (deleted, or never existed) — the caller
     * (the route) turns that into a 404, exactly like a missing `/v1`
     * resource.
     */
    async planVersions({ tenantId, clientId, timestamp = now() }) {
      await purgeExpiredSetAsideVersions(db, { tenantId, timestamp });
      const row = (
        await db.query(
          "SELECT id FROM plans WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL",
          [tenantId, clientId],
        )
      ).rows[0];
      if (!row) return null;
      const current = resourceForPlanRow(
        await planRowFor(db, tenantId, row.id),
      );
      const versionRows = (
        await db.query(
          "SELECT * FROM plan_versions WHERE tenant_id = ? AND plan_id = ? ORDER BY created_at, id",
          [tenantId, row.id],
        )
      ).rows;
      const setAsideRow = versionRows
        .filter(
          (version) =>
            version.state === "set_aside" && version.origin_device_id === null,
        )
        .pop();
      const setAside = setAsideRow ? versionForRow(setAsideRow) : null;
      return {
        current,
        setAside,
        // Additive: the common base of the two versions and which one is
        // the more recent, so the modal's « Réglages du plan » pre-select
        // each row the way the server will compose it.
        base: setAside
          ? await planVersionBase(db, {
              tenantId,
              planId: row.id,
              revision: setAside.revision,
            })
          : null,
        newer: setAside ? newerPlanSide(setAside, current) : null,
        previous: versionRows
          .filter((version) => version.state === "history")
          .map(versionForRow),
      };
    },

    /**
     * Writes the fusion modal's choice — "Garder cette version" (the
     * browser's own set-aside attempt), "Garder l'autre version" (leave the
     * live plan untouched), or the composed "Résultat" — as the plan's next
     * revision. Delegates the actual write to
     * [resourceStore.writePlanResource] wholesale (the same revision guard,
     * `history` archiving and `plans`-domain signal every other plan write
     * already gets) rather than re-implementing any of it; this method's
     * own job is only to resolve [clientId] to a resource id and to retire
     * the set-aside row the resolution consumed.
     *
     * The set-aside row itself follows the same "never a silent overwrite"
     * doctrine as every other resolution in this codebase: "keepOther" and
     * "merged" flip it to a permanent `history` row (visible from "Versions
     * précédentes", never purged) rather than deleting it; only "keepBrowser"
     * deletes it outright, because its payload is now the live plan itself —
     * keeping a second copy would only duplicate identical content.
     */
    async resolvePlanDivergence({
      tenantId,
      userId,
      clientId,
      choice,
      items,
      // The « Réglages du plan » rows of the modal, row id → "local" (this
      // browser's set-aside version) or "other" (the live plan). Only read
      // for "merged".
      fields = null,
      originClientInstanceId = null,
      planLimit = 0,
      plannerMultiple = true,
      projectLinks = null,
      timestamp = now(),
    }) {
      const row = (
        await db.query(
          "SELECT id, revision FROM plans WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL",
          [tenantId, clientId],
        )
      ).rows[0];
      if (!row)
        throw new PlanResourceStoreError(
          "plan_not_found",
          "The plan was not found.",
          { status: 404 },
        );
      const setAsideRows = (
        await db.query(
          "SELECT * FROM plan_versions WHERE tenant_id = ? AND plan_id = ? AND state = ? AND origin_device_id IS NULL ORDER BY created_at",
          [tenantId, row.id, "set_aside"],
        )
      ).rows;
      const setAsideRow = setAsideRows[setAsideRows.length - 1];
      if (!setAsideRow)
        throw new PlanResourceStoreError(
          "plan_not_diverged",
          "This plan has no pending browser version to resolve.",
          { status: 409 },
        );
      if (choice === "keepOther") {
        await db.run(
          "UPDATE plan_versions SET state = ?, purge_after = NULL WHERE id = ?",
          ["history", setAsideRow.id],
        );
        return resourceForPlanRow(await planRowFor(db, tenantId, row.id));
      }
      let payload;
      if (choice === "keepBrowser") {
        payload = versionForRow(setAsideRow).payload;
      } else if (choice === "merged") {
        const current = resourceForPlanRow(
          await planRowFor(db, tenantId, row.id),
        );
        const mergedItems = Array.isArray(items) ? items : [];
        if (fields === null || fields === undefined) {
          // Compatibility rule: a client that sends no `fields` (a browser
          // build older than the `fields` parameter) keeps the behaviour it
          // was written for — the Résultat's targets on the live plan's own
          // settings (the server's copy of every other field). A phone
          // never comes through here: it composes the merged plan itself
          // and writes it with `PUT /v1/plans/{id}`.
          payload = { ...current.payload, items: mergedItems };
        } else {
          const setAside = versionForRow(setAsideRow);
          const merge = mergePlanFields(
            setAside.payload,
            current.payload,
            await planVersionBase(db, {
              tenantId,
              planId: row.id,
              revision: setAside.revision,
            }),
            fields,
            { items: mergedItems, newer: newerPlanSide(setAside, current) },
          );
          if (merge.unknown.length)
            throw new PlanResourceStoreError(
              "invalid_plan_field",
              `Unknown plan setting: ${merge.unknown.join(", ")}.`,
              { status: 400, fields: merge.unknown },
            );
          if (merge.missing.length)
            throw new PlanResourceStoreError(
              "plan_field_choice_required",
              `Both versions changed these settings; choose one value for each: ${merge.missing.join(", ")}.`,
              { status: 400, fields: merge.missing },
            );
          payload = merge.payload;
        }
      } else {
        throw new PlanResourceStoreError(
          "invalid_request",
          "Unknown plan-divergence resolution choice.",
          { status: 400 },
        );
      }
      const result = await resourceStore.writePlanResource({
        tenantId,
        userId,
        planId: row.id,
        expectedRevision: planRevision(row.revision),
        payload,
        originDeviceId: null,
        planLimit,
        plannerMultiple,
        projectLinks,
        originClientInstanceId,
        timestamp,
      });
      if (!result?.resource)
        throw new PlanResourceStoreError(
          result?.kind === "frozen" ? "plan_frozen" : "plan_conflict",
          "The plan changed before this resolution could be written.",
          {
            status: 409,
            serverRevision: result?.serverRevision,
            serverPayload: result?.serverPayload,
          },
        );
      if (choice === "keepBrowser")
        await db.run("DELETE FROM plan_versions WHERE id = ?", [
          setAsideRow.id,
        ]);
      else
        await db.run(
          "UPDATE plan_versions SET state = ?, purge_after = NULL WHERE id = ?",
          ["history", setAsideRow.id],
        );
      return result.resource;
    },

    /**
     * The "Versions précédentes" → "Restaurer" gesture.
     * [restorePlanResource] above only reads `set_aside` versions (a
     * `plan_conflict`'s own set-aside version, `/v1`'s own contract) — an accepted
     * limitation for `history` rows, so this stays consistent with it rather
     * than widening `/v1`'s own restore semantics. A `history` row is
     * restored the same way "Garder cette version"/"Résultat" already are
     * here: as an ordinary new revision via
     * [resourceStore.writePlanResource], which archives what it replaces.
     */
    async restorePreviousVersion({
      tenantId,
      userId,
      clientId,
      versionId,
      // The "Versions précédentes" section's own "Comparer" (reopening the
      // fusion modal against a `history` row instead of a live divergence):
      // when given, this
      // composes [items] onto the *current* plan's own settings, exactly
      // like the live-divergence "merged" resolution above; omitted (a plain
      // "Restaurer"), this restores [versionId]'s payload verbatim, settings
      // included, as a plain restore always has.
      items = null,
      originClientInstanceId = null,
      planLimit = 0,
      plannerMultiple = true,
      projectLinks = null,
      timestamp = now(),
    }) {
      const row = (
        await db.query(
          "SELECT id, revision FROM plans WHERE tenant_id = ? AND client_id = ? AND deleted_at IS NULL",
          [tenantId, clientId],
        )
      ).rows[0];
      if (!row)
        throw new PlanResourceStoreError(
          "plan_not_found",
          "The plan was not found.",
          { status: 404 },
        );
      const versionRow = (
        await db.query(
          "SELECT * FROM plan_versions WHERE id = ? AND tenant_id = ? AND plan_id = ? AND state = ?",
          [versionId, tenantId, row.id, "history"],
        )
      ).rows[0];
      if (!versionRow)
        throw new PlanResourceStoreError(
          "plan_version_not_found",
          "The version was not found.",
          { status: 404 },
        );
      const payload = Array.isArray(items)
        ? {
            ...resourceForPlanRow(await planRowFor(db, tenantId, row.id))
              .payload,
            items,
          }
        : versionForRow(versionRow).payload;
      const result = await resourceStore.writePlanResource({
        tenantId,
        userId,
        planId: row.id,
        expectedRevision: planRevision(row.revision),
        payload,
        originDeviceId: null,
        planLimit,
        plannerMultiple,
        projectLinks,
        originClientInstanceId,
        timestamp,
      });
      if (!result?.resource)
        throw new PlanResourceStoreError(
          result?.kind === "frozen" ? "plan_frozen" : "plan_conflict",
          "The plan changed before this version could be restored.",
          {
            status: 409,
            serverRevision: result?.serverRevision,
            serverPayload: result?.serverPayload,
          },
        );
      return result.resource;
    },
  };
}
