import { randomUUID } from "node:crypto";
import { publishChange } from "portal/api/change-bus.js";
import { applyMigrations } from "portal/persistence/migration-runner.js";
import { eraseProjectRows } from "portal/persistence/trash-erasure.js";

/**
 * The `projects` table (core migration 46): one row per project of a space,
 * its resource fields as canonical JSON in `payload_json`, `revision` and
 * `status` as columns because every write tests them. This repository is
 * the only writer of the table. A project is archived here, never deleted
 * (the trash is `plan-trash-repository.js`); a creation at the id of a
 * project of the space in the trash erases it first. Each write records an audit event in the
 * same transaction, and publishes the `projects` change once it is
 * committed.
 *
 * Every method answers a value; the expected refusals are results, never
 * exceptions: `{ kind: "missing" }`, `{ kind: "conflict", project }`,
 * `{ kind: "taken" }`.
 */

// A revision represents the JSON content, not the property order a client
// serializer chose (the rule of the plans and the framings).
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

export const canonicalJson = (value) =>
  JSON.stringify(canonicalJsonValue(value));

function revisionOf(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : 1;
}

export class ProjectStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProjectStoreError";
  }
}

/** The resource of a stored row (`project.schema.json`, `resource`). */
export function resourceForProjectRow(row) {
  let fields;
  try {
    fields = JSON.parse(row.payload_json);
  } catch {
    fields = null;
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    throw new ProjectStoreError("The stored project is invalid.");
  return {
    id: row.id,
    revision: revisionOf(row.revision),
    status: row.status,
    target: fields.target,
    goalMinutes: fields.goalMinutes,
    place: fields.place,
    equipment: fields.equipment,
    constraints: fields.constraints,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rowFor(db, tenantId, projectId) {
  return (
    (
      await db.query(
        "SELECT * FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
        [projectId, tenantId],
      )
    ).rows[0] || null
  );
}

async function audit(db, { tenantId, userId, eventType, details, timestamp }) {
  await db.run(
    "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [
      randomUUID(),
      tenantId,
      userId || null,
      eventType,
      JSON.stringify(details),
      timestamp,
    ],
  );
}

function published(result, tenantId, originClientInstanceId) {
  if (result?.changed)
    publishChange({
      tenantId,
      // A creation that replaced a project of the trash erased what went
      // with it (`trash-erasure.js`).
      domains: result.replaced
        ? ["projects", "plans", "sessions", "captures"]
        : ["projects"],
      originClientInstanceId: originClientInstanceId || null,
    });
  return result;
}

export async function createProjectRepository({
  driver,
  dialect = driver?.dialect,
} = {}) {
  if (!driver) throw new Error("The projects repository needs a driver.");
  await applyMigrations(driver, dialect === "postgres" ? "postgres" : "sqlite");

  return {
    /** Every project of the space, archived ones included, the most
     * recently updated first. */
    async list({ tenantId }) {
      const { rows } = await driver.query(
        "SELECT * FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id",
        [tenantId],
      );
      return rows.map(resourceForProjectRow);
    },

    /** The project, or `null` when this space has none of that id. */
    async get({ tenantId, projectId }) {
      const row = await rowFor(driver, tenantId, projectId);
      return row ? resourceForProjectRow(row) : null;
    },

    /**
     * `expectedRevision === 0` creates (`status` defaults to `active`); any
     * other value updates at exactly that revision (`status` null keeps
     * the current one).
     */
    async write({
      tenantId,
      userId,
      projectId,
      expectedRevision,
      status,
      fields,
      originDeviceId = null,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const payloadJson = canonicalJson(fields);
      const result = await driver.transaction(async (db) => {
        if (expectedRevision === 0) {
          // Identifiers are global: one taken by another space answers
          // exactly like one taken in this space, and says nothing of it.
          const taken = (
            await db.query("SELECT * FROM projects WHERE id = ?", [projectId])
          ).rows[0];
          // A multi-night plan of this space in the trash at this id is
          // replaced: erased (the path of « Supprimer définitivement »),
          // then created anew — a second sending of the same content after
          // a deletion (Astro Sync derives the id from it).
          const replaced = Boolean(
            taken?.tenant_id === tenantId && taken.deleted_at,
          );
          if (replaced) {
            const { plansErased } = await eraseProjectRows(db, {
              tenantId,
              row: taken,
            });
            await audit(db, {
              tenantId,
              userId,
              eventType: "project.erased",
              details: { projectId, plansErased, replacedByCreation: true },
              timestamp,
            });
          } else if (taken) return { kind: "taken" };
          const row = {
            id: projectId,
            tenant_id: tenantId,
            revision: 1,
            status: status || "active",
            payload_json: payloadJson,
            created_at: timestamp,
            updated_at: timestamp,
          };
          await db.run(
            "INSERT INTO projects (id, tenant_id, revision, status, payload_json, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
            [
              row.id,
              row.tenant_id,
              row.revision,
              row.status,
              row.payload_json,
              row.created_at,
              row.updated_at,
            ],
          );
          await audit(db, {
            tenantId,
            userId,
            eventType: "project.created",
            details: { projectId, originDeviceId },
            timestamp,
          });
          return {
            changed: true,
            created: true,
            ...(replaced ? { replaced: true } : {}),
            project: resourceForProjectRow(row),
          };
        }

        const current = await rowFor(db, tenantId, projectId);
        if (!current) return { kind: "missing" };
        if (revisionOf(current.revision) !== expectedRevision)
          return { kind: "conflict", project: resourceForProjectRow(current) };
        const next = {
          ...current,
          revision: revisionOf(current.revision) + 1,
          status: status || current.status,
          payload_json: payloadJson,
          updated_at: timestamp,
        };
        const updated = await db.run(
          "UPDATE projects SET revision = ?, status = ?, payload_json = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND revision = ? AND deleted_at IS NULL",
          [
            next.revision,
            next.status,
            next.payload_json,
            next.updated_at,
            projectId,
            tenantId,
            expectedRevision,
          ],
        );
        if (!updated.rowCount) {
          const latest = await rowFor(db, tenantId, projectId);
          return latest
            ? { kind: "conflict", project: resourceForProjectRow(latest) }
            : { kind: "missing" };
        }
        await audit(db, {
          tenantId,
          userId,
          eventType: "project.updated",
          details: {
            projectId,
            revision: next.revision,
            status: next.status,
            originDeviceId,
          },
          timestamp,
        });
        return {
          changed: true,
          created: false,
          project: resourceForProjectRow(next),
        };
      });
      return published(result, tenantId, originClientInstanceId);
    },

    /**
     * Archives at exactly `expectedRevision`. An archived project answers
     * as it is, without a new revision.
     */
    async archive({
      tenantId,
      userId,
      projectId,
      expectedRevision,
      originDeviceId = null,
      originClientInstanceId = null,
      timestamp = new Date().toISOString(),
    }) {
      const result = await driver.transaction(async (db) => {
        const current = await rowFor(db, tenantId, projectId);
        if (!current) return { kind: "missing" };
        if (revisionOf(current.revision) !== expectedRevision)
          return { kind: "conflict", project: resourceForProjectRow(current) };
        if (current.status === "archived")
          return { changed: false, project: resourceForProjectRow(current) };
        const next = {
          ...current,
          revision: revisionOf(current.revision) + 1,
          status: "archived",
          updated_at: timestamp,
        };
        const updated = await db.run(
          "UPDATE projects SET revision = ?, status = 'archived', updated_at = ? WHERE id = ? AND tenant_id = ? AND revision = ? AND deleted_at IS NULL",
          [next.revision, timestamp, projectId, tenantId, expectedRevision],
        );
        if (!updated.rowCount) {
          const latest = await rowFor(db, tenantId, projectId);
          return latest
            ? { kind: "conflict", project: resourceForProjectRow(latest) }
            : { kind: "missing" };
        }
        await audit(db, {
          tenantId,
          userId,
          eventType: "project.archived",
          details: { projectId, revision: next.revision, originDeviceId },
          timestamp,
        });
        return { changed: true, project: resourceForProjectRow(next) };
      });
      return published(result, tenantId, originClientInstanceId);
    },
  };
}
