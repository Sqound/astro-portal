import { framingUsage } from "astro-core/framing-usage.js";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { publishChange } from "../api/change-bus.js";

/**
 * A framing is an account-wide entity of its own, stored in the `framings`
 * table (migration 22), independent of the plans that reference it through
 * `plan_framings`. This repository is the ONLY writer of both tables and the
 * only place `framingUsage` (`packages/astro-core/src/framing-usage.ts`) is
 * enforced — every client only calls the same function to render the right
 * warning before writing, including offline.
 *
 * A framing carries no `plan_versions`-style journal: unlike a plan, a stale
 * or too-late write is never set aside — the caller turns the returned
 * `409`'s current `framing` into a new, unattached library copy, which is a
 * client-side gesture, not a server-held version.
 */

export class FramingResourceStoreError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "FramingResourceStoreError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function parseJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

// A framing's revision must represent its own JSON content rather than the
// property order chosen by a client serializer, exactly like a plan's.
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

function canonicalJson(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new FramingResourceStoreError(
      "invalid_request",
      `${label} is required.`,
    );
  return result;
}

/**
 * `payload` normalization: `target` is required and must carry a J2000 centre
 * (a framing is defined in absolute coordinates, never a night or a place).
 * `angleDegrees` is the framing's position angle (N.I.N.A.'s, north towards
 * east), kept as sent in `[0, 360)` — missing reads as `0`, anything else is
 * refused. A non-zero angle is mirrored at `target.framing.angleDegrees`,
 * where the previews, the targets under the frame and the exports read it; a
 * `0°` framing keeps the shape it always had.
 */
function normalizeFramingPayload(payload) {
  if (!plainObject(payload))
    throw new FramingResourceStoreError(
      "invalid_request",
      "A framing payload is required.",
    );
  const target = payload.target;
  const ra = Number(target?.center?.ra ?? target?.coordinate?.ra);
  const dec = Number(target?.center?.dec ?? target?.coordinate?.dec);
  if (!plainObject(target) || !Number.isFinite(ra) || !Number.isFinite(dec))
    throw new FramingResourceStoreError(
      "invalid_request",
      "A framing payload requires a target with a J2000 centre.",
    );
  const catalogueTargetId =
    typeof payload.catalogueTargetId === "string" &&
    payload.catalogueTargetId.trim()
      ? payload.catalogueTargetId.trim()
      : null;
  const angleDegrees = framingAngleDegrees(payload.angleDegrees);
  return {
    ra,
    dec,
    catalogueTargetId,
    angleDegrees,
    payload: {
      target: targetWithAngle(target, angleDegrees),
      catalogueTargetId,
      angleDegrees,
    },
  };
}

/** The payload's angle: a number in `[0, 360)`, `0` when absent. */
function framingAngleDegrees(value) {
  if (value === undefined || value === null) return 0;
  const angle = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(angle) || angle < 0 || angle >= 360)
    throw new FramingResourceStoreError(
      "invalid_request",
      "A framing angle is a number of degrees in [0, 360).",
    );
  return angle;
}

/** `target.framing.angleDegrees` mirrors the payload's angle when it is not
 * `0`; a `0°` framing carries no key there, as before the rotation existed. */
function targetWithAngle(target, angleDegrees) {
  const framing = target.framing;
  if (!plainObject(framing)) return target;
  const rest = { ...framing };
  delete rest.angleDegrees;
  return {
    ...target,
    framing: angleDegrees === 0 ? rest : { ...rest, angleDegrees },
  };
}

function normalizedName(value) {
  const result = String(value || "").trim();
  if (!result || result.length > 300)
    throw new FramingResourceStoreError(
      "invalid_request",
      "A framing name of 1 to 300 characters is required.",
    );
  return result;
}

function framingRevision(value) {
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 1 ? result : 1;
}

/** The bare resource, without `usage` — callers batch usage separately so a
 * list read costs one extra query rather than one per row. */
function resourceForFramingRow(row) {
  const payload = parseJson(row.payload_json);
  if (!plainObject(payload))
    throw new FramingResourceStoreError(
      "invalid_stored_payload",
      "The stored framing payload is invalid.",
      { status: 500 },
    );
  return {
    id: row.id,
    name: row.name,
    revision: framingRevision(row.revision),
    payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
  };
}

async function framingRowFor(
  driver,
  tenantId,
  framingId,
  { includeDeleted = false } = {},
) {
  return (
    (
      await driver.query(
        `SELECT * FROM framings WHERE id = ? AND tenant_id = ?
         ${includeDeleted ? "" : "AND deleted_at IS NULL"}`,
        [framingId, tenantId],
      )
    ).rows[0] || null
  );
}

/**
 * `framingUsage`'s inputs for every framing id in `framingIds`, in one query:
 * every non-deleted plan referencing each framing (via `plan_framings`), and
 * which of those plans already has an observation session. Framings with no
 * referencing plan at all are simply absent from the query result and get an
 * empty usage below.
 */
async function usageInputsFor(driver, tenantId, framingIds) {
  const inputs = new Map(
    framingIds.map((id) => [id, { plans: [], sessionPlanIds: [] }]),
  );
  if (framingIds.length === 0) return inputs;
  const placeholders = framingIds.map(() => "?").join(", ");
  const rows = (
    await driver.query(
      `SELECT pf.framing_id AS framing_id, p.id AS plan_id, p.name AS name,
              p.plan_date AS plan_date, p.status AS status,
              EXISTS (
                SELECT 1 FROM observation_sessions os WHERE os.plan_id = p.id
              ) AS has_session
       FROM plan_framings pf
       JOIN plans p ON p.id = pf.plan_id AND p.deleted_at IS NULL
       WHERE pf.tenant_id = ? AND pf.framing_id IN (${placeholders})`,
      [tenantId, ...framingIds],
    )
  ).rows;
  for (const row of rows) {
    const entry = inputs.get(row.framing_id);
    if (!entry) continue;
    entry.plans.push({
      planId: row.plan_id,
      name: row.name,
      planDate: row.plan_date || null,
      status: apiPlanStatusFor(row.status),
    });
    // SQLite returns 0/1 for an EXISTS(...) projection; PostgreSQL returns a
    // real boolean. Both are truthy/falsy the same way in JS, so no
    // dialect branch is needed here.
    if (row.has_session) entry.sessionPlanIds.push(row.plan_id);
  }
  return inputs;
}

// The API status spelling (never the internally stored "pending"), matching
// `apiPlanStatus` in planner-state-repository.js. Duplicated narrowly here
// (rather than imported) to keep this repository free of a dependency edge
// back onto planner-state-repository.js, which itself depends on this
// module for plan-write hydration/dehydration.
function apiPlanStatusFor(status) {
  const known = ["pending", "executed", "partial", "abandoned", "archived"];
  const stored = known.includes(status) ? status : "pending";
  return stored === "pending" ? "active" : stored;
}

/** `{ framingId -> { state, executedPlans, pendingPlans } }` for every id in
 * `framingIds`, honoring each framing's own `archivedAt`. */
async function usageFor(driver, tenantId, framingIds, archivedAtById) {
  const inputs = await usageInputsFor(driver, tenantId, framingIds);
  const usage = new Map();
  for (const framingId of framingIds) {
    const input = inputs.get(framingId) || { plans: [], sessionPlanIds: [] };
    usage.set(
      framingId,
      framingUsage({
        framingId,
        plans: input.plans,
        sessionPlanIds: input.sessionPlanIds,
        archivedAt: archivedAtById.get(framingId) || null,
      }),
    );
  }
  return usage;
}

function resourceWithUsage(row, usage) {
  return {
    ...resourceForFramingRow(row),
    state: usage.state,
    usage: {
      executedPlans: usage.executedPlans,
      pendingPlans: usage.pendingPlans,
    },
  };
}

/**
 * `{ framingId -> { target, name, revision, state } }`, the exact shape
 * `plan-framing-hydration.js`'s `hydratePlanItems` needs, for every
 * `framingId` a plan's items reference — archived framings included ("an
 * archived framing stays readable wherever a plan references it"), deleted
 * ones simply absent from the map (the same tolerance on the reading side
 * as for legacy items).
 */
export async function loadFramingHydrationRecords(
  driver,
  tenantId,
  framingIds,
) {
  const records = new Map();
  if (!framingIds || framingIds.length === 0) return records;
  const placeholders = framingIds.map(() => "?").join(", ");
  const rows = (
    await driver.query(
      `SELECT * FROM framings WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
      [tenantId, ...framingIds],
    )
  ).rows;
  const archivedAtById = new Map(rows.map((row) => [row.id, row.archived_at]));
  const usage = await usageFor(
    driver,
    tenantId,
    rows.map((row) => row.id),
    archivedAtById,
  );
  for (const row of rows) {
    const resource = resourceForFramingRow(row);
    records.set(row.id, {
      target: resource.payload.target,
      name: resource.name,
      revision: resource.revision,
      state: usage.get(row.id)?.state || "free",
    });
  }
  return records;
}

/** Every `framingId` in `framingIds` that does NOT name a live framing of
 * this tenant — what a plan write's `409 framing_missing` refusal lists. */
export async function missingFramingIds(driver, tenantId, framingIds) {
  if (!framingIds || framingIds.length === 0) return [];
  const placeholders = framingIds.map(() => "?").join(", ");
  const found = new Set(
    (
      await driver.query(
        `SELECT id FROM framings WHERE tenant_id = ? AND id IN (${placeholders}) AND deleted_at IS NULL`,
        [tenantId, ...framingIds],
      )
    ).rows.map((row) => row.id),
  );
  return framingIds.filter((id) => !found.has(id));
}

/** Replaces a plan's `plan_framings` rows with exactly `framingIds` (a plan
 * write is the only place this changes, in the same transaction as the plan
 * write itself). Returns whether the referenced set actually changed, so
 * the caller knows whether to add `framings` to its change signal. */
export async function replacePlanFramings(
  driver,
  { tenantId, planId, framingIds },
) {
  const before = new Set(
    (
      await driver.query(
        "SELECT framing_id FROM plan_framings WHERE plan_id = ? AND tenant_id = ?",
        [planId, tenantId],
      )
    ).rows.map((row) => row.framing_id),
  );
  const after = new Set(framingIds);
  const changed =
    before.size !== after.size || [...before].some((id) => !after.has(id));
  if (!changed) return false;
  await driver.run("DELETE FROM plan_framings WHERE plan_id = ?", [planId]);
  for (const framingId of after)
    await driver.run(
      "INSERT INTO plan_framings (tenant_id, plan_id, framing_id) VALUES (?, ?, ?)",
      [tenantId, planId, framingId],
    );
  return true;
}

/** Whether any row of `plan_framings` currently names `planId` — used to
 * decide whether deleting/restoring a plan should also signal `framings`. */
export async function planHasFramings(driver, tenantId, planId) {
  return Boolean(
    (
      await driver.query(
        "SELECT 1 FROM plan_framings WHERE plan_id = ? AND tenant_id = ? LIMIT 1",
        [planId, tenantId],
      )
    ).rows[0],
  );
}

export async function createFramingResourceRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  return {
    async close() {
      if (ownsDriver) await db.close();
    },

    async list({ tenantId } = {}) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      return await db.transaction(async (transaction) => {
        const rows = (
          await transaction.query(
            "SELECT * FROM framings WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id",
            [normalizedTenantId],
          )
        ).rows;
        const archivedAtById = new Map(
          rows.map((row) => [row.id, row.archived_at]),
        );
        const usage = await usageFor(
          transaction,
          normalizedTenantId,
          rows.map((row) => row.id),
          archivedAtById,
        );
        return rows.map((row) => resourceWithUsage(row, usage.get(row.id)));
      });
    },

    async get({ tenantId, framingId }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedFramingId = requiredIdentifier(framingId, "Framing id");
      return await db.transaction(async (transaction) => {
        const row = await framingRowFor(
          transaction,
          normalizedTenantId,
          normalizedFramingId,
        );
        if (!row) return null;
        const usage = await usageFor(
          transaction,
          normalizedTenantId,
          [row.id],
          new Map([[row.id, row.archived_at]]),
        );
        return resourceWithUsage(row, usage.get(row.id));
      });
    },

    /**
     * `expectedRevision === 0` creates; any other value updates at exactly
     * that revision. `capabilityGranted` (evaluated by the caller, which
     * alone knows the tenant's profile) gates every write — a `403` never
     * reaches this repository as a distinct code, it is refused before this
     * is even called (see `framing-resources.js`).
     */
    async write({
      tenantId,
      userId,
      framingId,
      expectedRevision,
      name,
      payload,
      originDeviceId = null,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedFramingId = requiredIdentifier(framingId, "Framing id");
      const resourceName = normalizedName(name);
      const normalizedPayload = normalizeFramingPayload(payload);

      const result = await db.transaction(async (transaction) => {
        const current = await framingRowFor(
          transaction,
          normalizedTenantId,
          normalizedFramingId,
          { includeDeleted: true },
        );

        if (expectedRevision === 0) {
          // Identifiers are global: one taken by another space answers
          // exactly like one taken in this space — never a database error,
          // never anything about the other row.
          const taken =
            current ||
            (
              await transaction.query("SELECT id FROM framings WHERE id = ?", [
                normalizedFramingId,
              ])
            ).rows[0];
          if (taken)
            throw new FramingResourceStoreError(
              "invalid_creation_revision",
              "A framing already exists at this resource id.",
              { status: 409 },
            );
          await transaction.run(
            `INSERT INTO framings (id, tenant_id, created_by_user_id, origin_device_id, name, revision, catalogue_target_id, center_ra, center_dec, angle_degrees, payload_json, archived_at, deleted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
            [
              normalizedFramingId,
              normalizedTenantId,
              userId || null,
              originDeviceId,
              resourceName,
              normalizedPayload.catalogueTargetId,
              normalizedPayload.ra,
              normalizedPayload.dec,
              normalizedPayload.angleDegrees,
              canonicalJson(normalizedPayload.payload),
              timestamp,
              timestamp,
            ],
          );
          return {
            created: true,
            resource: resourceWithUsage(
              {
                id: normalizedFramingId,
                name: resourceName,
                revision: 1,
                payload_json: canonicalJson(normalizedPayload.payload),
                created_at: timestamp,
                updated_at: timestamp,
                archived_at: null,
              },
              { state: "free", executedPlans: [], pendingPlans: [] },
            ),
          };
        }

        if (!current || current.deleted_at) return { kind: "missing" };

        const usage = (
          await usageFor(
            transaction,
            normalizedTenantId,
            [current.id],
            new Map([[current.id, current.archived_at]]),
          )
        ).get(current.id);

        if (current.revision !== expectedRevision)
          return {
            kind: "conflict",
            framing: resourceWithUsage(current, usage),
          };

        if (current.archived_at)
          return {
            kind: "archived",
            framing: resourceWithUsage(current, usage),
          };

        if (usage.state === "locked") {
          // Renaming a locked framing is allowed,
          // directly, without a copy — everything else about it (geometry,
          // reference equipment, mosaic) stays frozen.
          const payloadUnchanged =
            canonicalJson(normalizedPayload.payload) === current.payload_json;
          if (!payloadUnchanged)
            return {
              kind: "locked",
              framing: resourceWithUsage(current, usage),
            };
        }

        const nextRevision = framingRevision(current.revision) + 1;
        const updated = await transaction.run(
          `UPDATE framings
           SET name = ?, catalogue_target_id = ?, center_ra = ?, center_dec = ?,
               angle_degrees = ?, payload_json = ?, revision = ?, updated_at = ?
           WHERE id = ? AND tenant_id = ? AND revision = ? AND deleted_at IS NULL`,
          [
            resourceName,
            normalizedPayload.catalogueTargetId,
            normalizedPayload.ra,
            normalizedPayload.dec,
            normalizedPayload.angleDegrees,
            canonicalJson(normalizedPayload.payload),
            nextRevision,
            timestamp,
            current.id,
            normalizedTenantId,
            expectedRevision,
          ],
        );
        if (!updated.rowCount) {
          const latest = await framingRowFor(
            transaction,
            normalizedTenantId,
            normalizedFramingId,
          );
          if (!latest) return { kind: "missing" };
          const latestUsage = (
            await usageFor(
              transaction,
              normalizedTenantId,
              [latest.id],
              new Map([[latest.id, latest.archived_at]]),
            )
          ).get(latest.id);
          return {
            kind: "conflict",
            framing: resourceWithUsage(latest, latestUsage),
          };
        }
        return {
          created: false,
          resource: resourceWithUsage(
            {
              ...current,
              name: resourceName,
              revision: nextRevision,
              payload_json: canonicalJson(normalizedPayload.payload),
              updated_at: timestamp,
            },
            usage,
          ),
        };
      });

      if (result?.resource)
        publishChange({
          tenantId: normalizedTenantId,
          domains: ["framings"],
          originClientInstanceId,
        });
      return result;
    },

    /**
     * `free` deletes outright; `shared` refuses `409 framing_in_use` naming
     * the still-referencing pending plans (the client removes the framing
     * from them, then replays); `locked` archives instead of deleting.
     */
    async remove({
      tenantId,
      framingId,
      expectedRevision,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedFramingId = requiredIdentifier(framingId, "Framing id");

      const result = await db.transaction(async (transaction) => {
        const current = await framingRowFor(
          transaction,
          normalizedTenantId,
          normalizedFramingId,
        );
        if (!current) return { kind: "missing" };
        const usage = (
          await usageFor(
            transaction,
            normalizedTenantId,
            [current.id],
            new Map([[current.id, current.archived_at]]),
          )
        ).get(current.id);
        if (current.revision !== expectedRevision)
          return {
            kind: "conflict",
            framing: resourceWithUsage(current, usage),
          };
        if (current.archived_at)
          return {
            kind: "archived",
            framing: resourceWithUsage(current, usage),
          };

        if (usage.state === "shared")
          return { kind: "in_use", pendingPlans: usage.pendingPlans };

        if (usage.state === "locked") {
          const nextRevision = framingRevision(current.revision) + 1;
          await transaction.run(
            "UPDATE framings SET archived_at = ?, revision = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
            [
              timestamp,
              nextRevision,
              timestamp,
              current.id,
              normalizedTenantId,
            ],
          );
          return {
            archived: true,
            resource: resourceWithUsage(
              {
                ...current,
                revision: nextRevision,
                archived_at: timestamp,
                updated_at: timestamp,
              },
              usage,
            ),
          };
        }

        await transaction.run(
          "UPDATE framings SET deleted_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
          [timestamp, timestamp, current.id, normalizedTenantId],
        );
        return { deleted: true };
      });

      if (result?.deleted || result?.archived)
        publishChange({
          tenantId: normalizedTenantId,
          domains: ["framings"],
          originClientInstanceId,
        });
      return result;
    },

    async restore({
      tenantId,
      framingId,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const normalizedTenantId = requiredIdentifier(tenantId, "Tenant id");
      const normalizedFramingId = requiredIdentifier(framingId, "Framing id");

      const result = await db.transaction(async (transaction) => {
        const current = await framingRowFor(
          transaction,
          normalizedTenantId,
          normalizedFramingId,
        );
        if (!current) return { kind: "missing" };
        if (!current.archived_at) return { kind: "not_archived" };
        const nextRevision = framingRevision(current.revision) + 1;
        await transaction.run(
          "UPDATE framings SET archived_at = NULL, revision = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
          [nextRevision, timestamp, current.id, normalizedTenantId],
        );
        const usage = (
          await usageFor(
            transaction,
            normalizedTenantId,
            [current.id],
            new Map([[current.id, null]]),
          )
        ).get(current.id);
        return {
          resource: resourceWithUsage(
            {
              ...current,
              revision: nextRevision,
              archived_at: null,
              updated_at: timestamp,
            },
            usage,
          ),
        };
      });

      if (result?.resource)
        publishChange({
          tenantId: normalizedTenantId,
          domains: ["framings"],
          originClientInstanceId,
        });
      return result;
    },
  };
}
