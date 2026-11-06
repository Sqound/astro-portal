import { applyMigrations } from "./migration-runner.js";

/**
 * The multi-night plans (`projects`, core migration 46) read, never
 * written: what « Exporter mes données » and its checks read. The routes
 * read and write them through the projects service (`planner-projects`),
 * on every server. Every query is bounded by the space
 * (`tenantId`); an archived project is listed, as the service lists it.
 */

function revisionOf(value) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 1 ? revision : 1;
}

/**
 * The resource of a stored row (`api/project.schema.json`, `resource`), or
 * `null` when its stored fields cannot be read.
 */
export function projectResourceForRow(row) {
  let fields;
  try {
    fields = JSON.parse(row.payload_json);
  } catch {
    fields = null;
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields))
    return null;
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

export async function createProjectReader({
  driver,
  dialect = driver?.dialect,
} = {}) {
  if (!driver) throw new Error("The projects reader needs a driver.");
  await applyMigrations(driver, dialect === "postgres" ? "postgres" : "sqlite");
  return {
    /** Every project of the space, the most recently updated first. */
    async list({ tenantId }) {
      const { rows } = await driver.query(
        "SELECT * FROM projects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC, id",
        [tenantId],
      );
      return { projects: rows.map(projectResourceForRow).filter(Boolean) };
    },

    /** The project, or `null` when this space has none of that id. */
    async get({ tenantId, projectId }) {
      const row = (
        await driver.query(
          "SELECT * FROM projects WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
          [String(projectId ?? ""), tenantId],
        )
      ).rows[0];
      return row ? projectResourceForRow(row) : null;
    },
  };
}
