import { randomUUID } from "node:crypto";
import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";
import { replaceProposedSteps, touchSession } from "./night-repository.js";
import { publishChange } from "../api/change-bus.js";

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope, on the exact pattern of `SessionPackageImportRepositoryError`. */
export class SessionAnalysisRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionAnalysisRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function toAnalysisResource(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    reportVersion: Number(row.report_version),
    createdAt: row.created_at,
    originDeviceId: row.origin_device_id ?? null,
    deviceName: row.device_name ?? null,
    report: JSON.parse(row.report_json),
  };
}

const SELECT_ANALYSIS = `SELECT a.id, a.session_id, a.report_version, a.report_json,
       a.created_at, a.origin_device_id, d.label AS device_name
FROM session_analyses a
LEFT JOIN device_tokens d ON d.id = a.origin_device_id
WHERE a.tenant_id = ? AND a.session_id = ?`;

/**
 * The night's analysis (migration 67, report v2): one per night, `UNIQUE(session_id)`. `replace` deletes the
 * previous one and writes the new one in the same transaction as the
 * night's steps it proposes (`replaceProposedSteps`); `remove` deletes it,
 * leaving the steps (the frames were taken: only the measures go).
 */
export async function createSessionAnalysisRepository({
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

    /** Whether `sessionId` exists in this tenant -- callers must treat "does not exist" and "belongs to another tenant" identically, never leaking cross-tenant existence. */
    async sessionExists(tenantId, sessionId) {
      const row = (
        await db.query(
          "SELECT id FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
          [sessionId, tenantId],
        )
      ).rows[0];
      return Boolean(row);
    },

    /** The night's analysis, report included, or null. */
    async get(tenantId, sessionId) {
      const row = (await db.query(SELECT_ANALYSIS, [tenantId, sessionId]))
        .rows[0];
      return row ? toAnalysisResource(row) : null;
    },

    /**
     * Writes `reportJson` as the night's analysis, replacing the previous
     * one, and the steps it proposes (`steps`, the report's
     * `acquisitionSteps`, with the origin `stepOrigin`). Two sendings
     * racing on the same night end with one analysis: the delete and the
     * insert share a transaction and `UNIQUE(session_id)` refuses the
     * second insert, retried.
     *
     * -> { analysis, replaced, steps: { proposed, keptEdited } }
     */
    async replace({
      tenantId,
      sessionId,
      reportVersion,
      reportJson,
      steps,
      stepOrigin,
      originDeviceId = null,
      originClientInstanceId = null,
      createdAt = now(),
    }) {
      let result = null;
      for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
        try {
          result = await db.transaction(async (tx) => {
            const removed = await tx.run(
              "DELETE FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
              [tenantId, sessionId],
            );
            await tx.run(
              `INSERT INTO session_analyses
                 (id, tenant_id, session_id, report_version, report_json,
                  origin_device_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                randomUUID(),
                tenantId,
                sessionId,
                reportVersion,
                reportJson,
                originDeviceId,
                createdAt,
              ],
            );
            const counts = await replaceProposedSteps(tx, {
              tenantId,
              sessionId,
              steps,
              origin: stepOrigin,
              timestamp: createdAt,
            });
            await touchSession(tx, {
              tenantId,
              sessionId,
              timestamp: createdAt,
            });
            const row = (await tx.query(SELECT_ANALYSIS, [tenantId, sessionId]))
              .rows[0];
            return {
              analysis: toAnalysisResource(row),
              replaced: removed.rowCount > 0,
              steps: counts,
            };
          });
        } catch (error) {
          if (
            attempt === 2 ||
            !/unique|duplicate/i.test(String(error?.message))
          )
            throw error;
        }
      }
      if (!result)
        throw new SessionAnalysisRepositoryError(
          "session_analysis_unavailable",
          "The analysis could not be recorded.",
          { status: 503 },
        );
      publishChange({
        tenantId,
        domains: ["sessions"],
        originClientInstanceId,
      });
      return result;
    },

    /** Deletes the night's analysis. -> true when there was one. */
    async remove({
      tenantId,
      sessionId,
      originClientInstanceId = null,
      timestamp = now(),
    }) {
      const removed = await db.transaction(async (tx) => {
        const result = await tx.run(
          "DELETE FROM session_analyses WHERE tenant_id = ? AND session_id = ?",
          [tenantId, sessionId],
        );
        if (result.rowCount > 0)
          await touchSession(tx, { tenantId, sessionId, timestamp });
        return result.rowCount > 0;
      });
      if (removed)
        publishChange({
          tenantId,
          domains: ["sessions"],
          originClientInstanceId,
        });
      return removed;
    },
  };
}
