import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { publishChange } from "../api/change-bus.js";

const now = () => new Date().toISOString();
const favoriteMode = (value) =>
  ["photo", "visual"].includes(value) ? value : null;

export async function createTargetFavoriteRepository({
  databasePath,
  databaseUrl,
  driver,
  dialect = driver?.dialect ?? (databaseUrl ? "postgres" : "sqlite"),
} = {}) {
  const ownsDriver = !driver;
  const db = driver || createDatabaseDriver({ databasePath, databaseUrl });
  await applyMigrations(db, dialect);
  const favoriteTargetIds = async (userId, { mode = "" } = {}) => {
    const selectedMode = favoriteMode(mode);
    const rows = (
      await db.query(
        `SELECT ${selectedMode ? "target_id" : "target_id, MIN(created_at) AS created_at"}
         FROM user_target_favorite_modes
         WHERE user_id = ? ${selectedMode ? "AND favorite_mode = ?" : ""}
         ${selectedMode ? "" : "GROUP BY target_id"}
         ORDER BY created_at, target_id`,
        selectedMode ? [userId, selectedMode] : [userId],
      )
    ).rows;
    return rows.map((row) => row.target_id);
  };
  const favoriteTargetIdsByMode = async (userId) => ({
    photoTargetIds: await favoriteTargetIds(userId, { mode: "photo" }),
    visualTargetIds: await favoriteTargetIds(userId, { mode: "visual" }),
  });

  return {
    async close() {
      if (ownsDriver) await db.close();
    },
    favoriteTargetIds,
    favoriteTargetIdsByMode,
    async setTargetFavorite({
      tenantId = null,
      userId,
      targetId,
      mode,
      favorite = true,
      originClientInstanceId = null,
    }) {
      const selectedMode = favoriteMode(mode);
      if (!selectedMode) throw new Error("A valid favorite mode is required.");
      let changed = false;
      await db.transaction(async (transaction) => {
        const target = (
          await transaction.query(
            "SELECT id FROM target_catalogue_entries WHERE id = ? AND source_present = 1",
            [targetId],
          )
        ).rows[0];
        if (!target) throw new Error("Target was not found.");
        const result = favorite
          ? await transaction.run(
              "INSERT INTO user_target_favorite_modes (user_id, target_id, favorite_mode, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, target_id, favorite_mode) DO NOTHING",
              [userId, targetId, selectedMode, now()],
            )
          : await transaction.run(
              "DELETE FROM user_target_favorite_modes WHERE user_id = ? AND target_id = ? AND favorite_mode = ?",
              [userId, targetId, selectedMode],
            );
        if (result.rowCount) {
          changed = true;
          await transaction.run(
            "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              randomUUID(),
              tenantId,
              userId,
              favorite ? "target.favorite.added" : "target.favorite.removed",
              JSON.stringify({ targetId, mode: selectedMode }),
              now(),
            ],
          );
        }
      });
      // An add that was already a favorite, or a remove that already wasn't
      // one, changes nothing: no signal. `tenantId` is only absent for a
      // caller that predates tenant scoping (none left in this codebase) —
      // guarded rather than assumed, since publishChange requires one.
      if (changed && tenantId)
        publishChange({
          tenantId,
          domains: ["favorites"],
          originClientInstanceId,
        });
      return await favoriteTargetIdsByMode(userId);
    },
    /**
     * `POST /v1/favorites` `{ action: "import", items }`: the favorites a
     * phone kept, added to its owner's in one transaction. Additive and
     * idempotent: an item already a favorite in that mode changes nothing, a
     * target the catalogue no longer has is reported and skipped, nothing is
     * ever removed. One `imported` entry per distinct item, in order:
     * `added`, `kept` (already a favorite) or `unknown_target`.
     */
    async importTargetFavorites({
      tenantId = null,
      userId,
      items,
      originClientInstanceId = null,
    }) {
      const distinct = [];
      const seen = new Set();
      for (const item of items) {
        const selectedMode = favoriteMode(item?.mode);
        const targetId = String(item?.targetId || "");
        if (!selectedMode || !targetId)
          throw new Error("A valid favorite mode is required.");
        const key = `${selectedMode}:${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        distinct.push({ targetId, mode: selectedMode });
      }
      const imported = [];
      await db.transaction(async (transaction) => {
        for (const { targetId, mode } of distinct) {
          const target = (
            await transaction.query(
              "SELECT id FROM target_catalogue_entries WHERE id = ? AND source_present = 1",
              [targetId],
            )
          ).rows[0];
          if (!target) {
            imported.push({ targetId, mode, status: "unknown_target" });
            continue;
          }
          const result = await transaction.run(
            "INSERT INTO user_target_favorite_modes (user_id, target_id, favorite_mode, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, target_id, favorite_mode) DO NOTHING",
            [userId, targetId, mode, now()],
          );
          if (!result.rowCount) {
            imported.push({ targetId, mode, status: "kept" });
            continue;
          }
          imported.push({ targetId, mode, status: "added" });
          await transaction.run(
            "INSERT INTO audit_events (id, tenant_id, user_id, event_type, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [
              randomUUID(),
              tenantId,
              userId,
              "target.favorite.added",
              JSON.stringify({ targetId, mode, origin: "import" }),
              now(),
            ],
          );
        }
      });
      if (tenantId && imported.some((entry) => entry.status === "added"))
        publishChange({
          tenantId,
          domains: ["favorites"],
          originClientInstanceId,
        });
      return { ...(await favoriteTargetIdsByMode(userId)), imported };
    },
  };
}
