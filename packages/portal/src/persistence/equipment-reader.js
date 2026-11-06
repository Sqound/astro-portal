import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { randomUUID } from "node:crypto";
import { PLATFORM_ORGANIZATION_ID } from "./default-equipment-seed.js";
import {
  isSpaceOrganization,
  spaceOrganizationCondition,
} from "./space-organizations.js";

// `equipment.scope` (migration 54): a space's own rows are `private`; the
// « Matériel par défaut » of the administration is `default`, held by the
// platform organisation (migration 55, `default-equipment-seed.js`).
const PRIVATE = "private";
const DEFAULT = "default";

const now = () => new Date().toISOString();

function equipmentType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    ![
      "telescope",
      "guide-scope",
      "camera",
      "eyepiece",
      "lens",
      "filter",
      "mount",
      "controller",
    ].includes(normalized)
  )
    throw new Error("Unsupported equipment type.");
  return normalized;
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function equipmentRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.equipment_type,
    name: row.name,
    manufacturer: row.manufacturer || "",
    model: row.model || "",
    isBinoculars: Boolean(row.is_binoculars),
    specifications: parseJson(row.specifications_json, {}),
    planner: parseJson(row.planner_json, {}),
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
    preferenceOrder: Number(row.preference_order || 0),
  };
}

/**
 * A default row as a space reads it (`defaults` of the equipment reads):
 * neither the organisation that holds it nor its notes.
 */
export function publicDefaultEquipment(record) {
  if (!record) return null;
  const { tenantId: _tenantId, notes: _notes, ...shown } = record;
  return shown;
}

async function audit(driver, { tenantId, userId = null, eventType, details }) {
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

/** Read-only private equipment access for catalogue and session enrichment. */
export async function createEquipmentReader({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);

  const listScope = async (tenantId, scope, { includeArchived = false } = {}) =>
    (
      await db.query(
        `SELECT * FROM equipment WHERE tenant_id = ? AND scope = ?
         ${includeArchived ? "" : "AND archived_at IS NULL"}
         ORDER BY equipment_type, preference_order, name, created_at, id`,
        [tenantId, scope],
      )
    ).rows.map(equipmentRecord);

  const getScope = async (tenantId, scope, equipmentId) =>
    equipmentRecord(
      (
        await db.query(
          "SELECT * FROM equipment WHERE id = ? AND tenant_id = ? AND scope = ?",
          [String(equipmentId || ""), tenantId, scope],
        )
      ).rows[0],
    );

  // A space's own equipment is never written under the platform
  // organisation, and the default list never under a space.
  const ownTenant = (tenantId) => {
    const id = String(tenantId || "");
    if (!isSpaceOrganization(id))
      throw new Error("Equipment belongs to a space.");
    return id;
  };

  async function saveScope({ tenantId, scope, userId = null, equipment }) {
    const type = equipmentType(equipment?.type);
    const name = String(equipment?.name || "").trim();
    if (!name || name.length > 200)
      throw new Error("Equipment name is required.");
    let id = String(equipment?.id || randomUUID()).trim();
    const timestamp = now();
    const specifications =
      equipment?.specifications && typeof equipment.specifications === "object"
        ? equipment.specifications
        : {};
    const planner =
      equipment?.planner && typeof equipment.planner === "object"
        ? equipment.planner
        : {};
    let existed = false;
    await db.transaction(async (transaction) => {
      const existing = (
        await transaction.query(
          "SELECT id FROM equipment WHERE id = ? AND tenant_id = ? AND scope = ?",
          [id, tenantId, scope],
        )
      ).rows[0];
      existed = Boolean(existing);
      // An identifier another space (or the default list) already uses is
      // treated like an unknown one: a new item under a fresh identifier;
      // the other row is never touched nor revealed.
      if (
        !existing &&
        (await transaction.query("SELECT id FROM equipment WHERE id = ?", [id]))
          .rows[0]
      )
        id = randomUUID();
      const values = [
        type,
        name,
        String(equipment?.manufacturer || "").trim() || null,
        String(equipment?.model || "").trim() || null,
        equipment?.isBinoculars ? 1 : 0,
        JSON.stringify(specifications),
        JSON.stringify(planner),
        String(equipment?.notes || "").trim() || null,
        timestamp,
      ];
      if (existing)
        await transaction.run(
          "UPDATE equipment SET equipment_type = ?, name = ?, manufacturer = ?, model = ?, is_binoculars = ?, specifications_json = ?, planner_json = ?, notes = ?, updated_at = ?, archived_at = NULL WHERE id = ? AND tenant_id = ? AND scope = ?",
          [...values, id, tenantId, scope],
        );
      else {
        const preferenceOrder = Number(
          (
            await transaction.query(
              "SELECT COALESCE(MAX(preference_order), -1) + 1 AS next_order FROM equipment WHERE tenant_id = ? AND scope = ? AND equipment_type = ?",
              [tenantId, scope, type],
            )
          ).rows[0].next_order,
        );
        await transaction.run(
          "INSERT INTO equipment (id, tenant_id, equipment_type, name, manufacturer, model, is_binoculars, specifications_json, planner_json, notes, created_at, updated_at, preference_order, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            id,
            tenantId,
            ...values.slice(0, 8),
            timestamp,
            timestamp,
            preferenceOrder,
            scope,
          ],
        );
      }
      await audit(transaction, {
        tenantId,
        userId,
        eventType: existed ? "equipment.updated" : "equipment.created",
        details: { equipmentId: id, type, scope },
      });
    });
    return getScope(tenantId, scope, id);
  }

  async function archiveScope({ tenantId, scope, userId = null, equipmentId }) {
    const timestamp = now();
    const result = await db.run(
      "UPDATE equipment SET archived_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND scope = ? AND archived_at IS NULL",
      [timestamp, timestamp, equipmentId, tenantId, scope],
    );
    if (result.rowCount !== 1) throw new Error("Equipment was not found.");
    await audit(db, {
      tenantId,
      userId,
      eventType: "equipment.archived",
      details: { equipmentId, scope },
    });
  }

  async function restoreScope({ tenantId, scope, userId = null, equipmentId }) {
    const result = await db.run(
      "UPDATE equipment SET archived_at = NULL, updated_at = ? WHERE id = ? AND tenant_id = ? AND scope = ? AND archived_at IS NOT NULL",
      [now(), equipmentId, tenantId, scope],
    );
    if (result.rowCount !== 1)
      throw new Error("Archived equipment was not found.");
    await audit(db, {
      tenantId,
      userId,
      eventType: "equipment.restored",
      details: { equipmentId, scope },
    });
  }

  async function reorderScope({
    tenantId,
    scope,
    userId = null,
    equipmentType: requestedType,
    equipmentIds,
  }) {
    const type = equipmentType(requestedType);
    const ids = [...new Set((equipmentIds || []).map(String))].filter(Boolean);
    await db.transaction(async (transaction) => {
      const active = (
        await transaction.query(
          "SELECT id FROM equipment WHERE tenant_id = ? AND scope = ? AND equipment_type = ? AND archived_at IS NULL ORDER BY preference_order, name, created_at, id",
          [tenantId, scope, type],
        )
      ).rows.map((row) => row.id);
      if (
        ids.length !== active.length ||
        ids.some((id) => !active.includes(id))
      )
        throw new Error("Invalid equipment preference order.");
      for (const [index, id] of ids.entries())
        await transaction.run(
          "UPDATE equipment SET preference_order = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND scope = ?",
          [index, now(), id, tenantId, scope],
        );
      await audit(transaction, {
        tenantId,
        userId,
        eventType: "equipment.reordered",
        details: { type, scope, equipmentIds: ids },
      });
    });
    return ids;
  }

  const platform = { tenantId: PLATFORM_ORGANIZATION_ID, scope: DEFAULT };

  return {
    async close() {
      if (ownsDriver) await db.close();
    },
    /**
     * Whether an organisation that is a space exists with this id: the
     * platform organisation, which holds the default equipment, is no one's
     * space.
     */
    async spaceExists(tenantId) {
      const id = String(tenantId || "");
      if (!isSpaceOrganization(id)) return false;
      return Boolean(
        (await db.query("SELECT id FROM organizations WHERE id = ?", [id]))
          .rows[0],
      );
    },
    /**
     * The oldest organisation that is a space: a private server's one space.
     * The platform organisation (migration 55) is never it. Never used by
     * itself to choose what public pages show on a service where anyone may
     * open a space (`portal-app/lib/equipment-reader.server.js`'s
     * `operatorSpaceId`).
     */
    async firstTenantId() {
      return (
        (
          await db.query(
            `SELECT id FROM organizations WHERE ${spaceOrganizationCondition()} ORDER BY created_at, id LIMIT 1`,
          )
        ).rows[0]?.id || null
      );
    },
    /**
     * « Masquer le matériel par défaut » of a space
     * (`organizations.hide_default_equipment`, migration 54).
     */
    async hideDefaultEquipment(tenantId) {
      const row = (
        await db.query(
          "SELECT hide_default_equipment FROM organizations WHERE id = ?",
          [String(tenantId || "")],
        )
      ).rows[0];
      return Boolean(Number(row?.hide_default_equipment || 0));
    },
    async setHideDefaultEquipment({ tenantId, userId = null, hidden }) {
      const id = ownTenant(tenantId);
      await db.run(
        "UPDATE organizations SET hide_default_equipment = ? WHERE id = ?",
        [hidden ? 1 : 0, id],
      );
      await audit(db, {
        tenantId: id,
        userId,
        eventType: "equipment.defaults-hidden",
        details: { hidden: Boolean(hidden) },
      });
      return Boolean(hidden);
    },
    /**
     * « Ma configuration par défaut » of a space (`default_configurations`,
     * migration 61): `{ configuration, updatedAt }`, or null when none is
     * set.
     */
    async defaultConfiguration(tenantId) {
      const row = (
        await db.query(
          "SELECT configuration, updated_at FROM default_configurations WHERE tenant_id = ?",
          [String(tenantId || "")],
        )
      ).rows[0];
      const configuration = parseJson(row?.configuration, null);
      if (
        !configuration ||
        typeof configuration !== "object" ||
        Array.isArray(configuration)
      )
        return null;
      return { configuration, updatedAt: row.updated_at };
    },
    /**
     * Writes the configuration of a space (an object already checked by
     * `normalizeDefaultConfiguration`), or removes it (`null`).
     */
    async setDefaultConfiguration({ tenantId, userId = null, configuration }) {
      const id = ownTenant(tenantId);
      const at = now();
      if (configuration === null)
        await db.run("DELETE FROM default_configurations WHERE tenant_id = ?", [
          id,
        ]);
      else
        await db.run(
          `INSERT INTO default_configurations (tenant_id, configuration, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT (tenant_id) DO UPDATE SET
             configuration = excluded.configuration,
             updated_at = excluded.updated_at`,
          [id, JSON.stringify(configuration), at],
        );
      await audit(db, {
        tenantId: id,
        userId,
        eventType: "equipment.default-configuration",
        details: { set: configuration !== null },
      });
      return configuration === null ? null : { configuration, updatedAt: at };
    },
    /** A space's own equipment (`scope = 'private'`). */
    async listEquipment(tenantId, { includeArchived = false } = {}) {
      return listScope(String(tenantId || ""), PRIVATE, { includeArchived });
    },
    /** One item of a space's own equipment, archived or not; null otherwise. */
    async getEquipment(tenantId, equipmentId) {
      return getScope(String(tenantId || ""), PRIVATE, equipmentId);
    },
    /**
     * « Matériel par défaut »: the default rows, as the administration edits
     * them (with their notes).
     */
    async listDefaultEquipment({ includeArchived = false } = {}) {
      return listScope(platform.tenantId, platform.scope, { includeArchived });
    },
    /** The active default rows as every space reads them. */
    async defaultEquipmentForSpaces() {
      return (await listScope(platform.tenantId, platform.scope)).map(
        publicDefaultEquipment,
      );
    },
    async getDefaultEquipment(equipmentId) {
      return getScope(platform.tenantId, platform.scope, equipmentId);
    },
    async saveDefaultEquipment({ userId = null, equipment }) {
      return saveScope({ ...platform, userId, equipment });
    },
    async archiveDefaultEquipment({ userId = null, equipmentId }) {
      return archiveScope({ ...platform, userId, equipmentId });
    },
    async restoreDefaultEquipment({ userId = null, equipmentId }) {
      return restoreScope({ ...platform, userId, equipmentId });
    },
    async reorderDefaultEquipment({
      userId = null,
      equipmentType,
      equipmentIds,
    }) {
      return reorderScope({ ...platform, userId, equipmentType, equipmentIds });
    },
    async equipmentAssignments(tenantId) {
      const rows = (
        await db.query(
          `SELECT capture_id, equipment_id FROM capture_equipment
           WHERE tenant_id = ? ORDER BY created_at, id`,
          [tenantId],
        )
      ).rows;
      return rows.reduce((result, row) => {
        (result[row.capture_id] ||= []).push(row.equipment_id);
        return result;
      }, {});
    },
    async captureEquipmentAssignments(tenantId) {
      const rows = (
        await db.query(
          `SELECT capture_id, equipment_id, assignment_role FROM capture_equipment
           WHERE tenant_id = ?
           ORDER BY CASE assignment_role WHEN 'main' THEN 0 ELSE 1 END, created_at, id`,
          [tenantId],
        )
      ).rows;
      return rows.reduce((result, row) => {
        (result[row.capture_id] ||= []).push({
          equipmentId: row.equipment_id,
          role: row.assignment_role === "guiding" ? "guiding" : "main",
        });
        return result;
      }, {});
    },
    async saveEquipment({ tenantId, userId = null, equipment }) {
      return saveScope({
        tenantId: ownTenant(tenantId),
        scope: PRIVATE,
        userId,
        equipment,
      });
    },
    async archiveEquipment({ tenantId, userId = null, equipmentId }) {
      return archiveScope({
        tenantId: ownTenant(tenantId),
        scope: PRIVATE,
        userId,
        equipmentId,
      });
    },
    async restoreEquipment({ tenantId, userId = null, equipmentId }) {
      return restoreScope({
        tenantId: ownTenant(tenantId),
        scope: PRIVATE,
        userId,
        equipmentId,
      });
    },
    async reorderEquipment({
      tenantId,
      userId = null,
      equipmentType: requestedType,
      equipmentIds,
    }) {
      return reorderScope({
        tenantId: ownTenant(tenantId),
        scope: PRIVATE,
        userId,
        equipmentType: requestedType,
        equipmentIds,
      });
    },
    async setCaptureEquipment({
      tenantId,
      userId = null,
      captureId,
      equipmentIds,
      assignments,
    }) {
      const id = String(captureId || "").trim();
      if (!id) throw new Error("A catalogue capture identifier is required.");
      const selection = new Map();
      const requested = Array.isArray(assignments)
        ? assignments
        : (equipmentIds || []).map((equipmentId) => ({
            equipmentId,
            role: "main",
          }));
      for (const assignment of requested) {
        const equipmentId = String(
          assignment?.equipmentId || assignment?.id || assignment || "",
        ).trim();
        if (equipmentId)
          selection.set(
            equipmentId,
            assignment?.role === "guiding" ? "guiding" : "main",
          );
      }
      const selectedIds = [...selection.keys()];
      await db.transaction(async (transaction) => {
        if (selectedIds.length) {
          const placeholders = selectedIds.map(() => "?").join(", ");
          const count = Number(
            (
              await transaction.query(
                `SELECT COUNT(*) AS count FROM equipment
                 WHERE tenant_id = ? AND archived_at IS NULL AND id IN (${placeholders})`,
                [tenantId, ...selectedIds],
              )
            ).rows[0].count,
          );
          if (count !== selectedIds.length)
            throw new Error("Unknown equipment selection.");
        }
        await transaction.run(
          "DELETE FROM capture_equipment WHERE tenant_id = ? AND capture_id = ?",
          [tenantId, id],
        );
        const timestamp = now();
        for (const equipmentId of selectedIds)
          await transaction.run(
            "INSERT INTO capture_equipment (id, tenant_id, capture_id, equipment_id, assignment_role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              randomUUID(),
              tenantId,
              id,
              equipmentId,
              selection.get(equipmentId),
              timestamp,
            ],
          );
        await audit(transaction, {
          tenantId,
          userId,
          eventType: "capture.equipment.updated",
          details: {
            captureId: id,
            equipmentCount: selectedIds.length,
            assignments: Object.fromEntries(selection),
          },
        });
      });
      return selectedIds;
    },
  };
}
