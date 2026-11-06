import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

/** A package-level error that route adapters map to the v1 error envelope. */
export class UploadSessionRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "UploadSessionRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function toResource(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sha256: row.sha256,
    byteSize: Number(row.byte_size),
    contentType: row.content_type ?? null,
    sessionId: row.session_id ?? null,
    planId: row.plan_id ?? null,
    targetIds: JSON.parse(row.target_ids_json || "[]"),
    originalName: row.original_name,
    offset: Number(row.offset_bytes),
    chunkSize: Number(row.chunk_size),
    state: row.state,
    partPath: row.part_path,
    captureId: row.capture_id ?? null,
    // The capture this upload adds an image to, and the source the image
    // records (`null` for a new capture's own image source decided at
    // finalize).
    variantOf: row.variant_of ?? null,
    source: row.source ?? null,
    // The proposals declared at the create step (never answered).
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Open-source persistence for the resumable upload protocol
 * (`api/uploads.md`): dual SQLite/PostgreSQL, tenant-isolated, on the exact
 * pattern of `capture-repository.js`. `(tenant_id, sha256)` is the same kind
 * of natural, unique key `captures` already keys on — re-creating a session
 * for bytes already known (mid-transfer or finalized) always finds the one
 * row that already exists rather than starting a second, competing transfer
 * of the same content.
 */
export async function createUploadSessionRepository({
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

    /**
     * Idempotent insert on `(tenant_id, sha256)`, exactly like
     * `insertCaptureWithTargets`: a race between two callers creating a
     * session for the same bytes is resolved by re-reading whichever row
     * committed first, never a second row and never a failure.
     */
    async createOrGet(row) {
      const insert = await db.run(
        `INSERT INTO upload_sessions
           (id, tenant_id, sha256, byte_size, content_type, session_id, plan_id,
            target_ids_json, original_name, offset_bytes, chunk_size, state,
            part_path, created_at, updated_at, expires_at, variant_of, source,
            metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, sha256) DO NOTHING`,
        [
          row.id,
          row.tenantId,
          row.sha256,
          row.byteSize,
          row.contentType,
          row.sessionId,
          row.planId,
          JSON.stringify(row.targetIds || []),
          row.originalName,
          row.chunkSize,
          row.partPath,
          row.createdAt,
          row.createdAt,
          row.expiresAt,
          row.variantOf ?? null,
          row.source ?? null,
          row.metadata ? JSON.stringify(row.metadata) : null,
        ],
      );
      const created = insert.rowCount === 1;
      if (created)
        return {
          created,
          session: toResource({
            id: row.id,
            tenant_id: row.tenantId,
            sha256: row.sha256,
            byte_size: row.byteSize,
            content_type: row.contentType,
            session_id: row.sessionId,
            plan_id: row.planId,
            target_ids_json: JSON.stringify(row.targetIds || []),
            original_name: row.originalName,
            offset_bytes: 0,
            chunk_size: row.chunkSize,
            state: "in_progress",
            part_path: row.partPath,
            capture_id: null,
            variant_of: row.variantOf ?? null,
            source: row.source ?? null,
            metadata_json: row.metadata ? JSON.stringify(row.metadata) : null,
            created_at: row.createdAt,
            updated_at: row.createdAt,
            expires_at: row.expiresAt,
          }),
        };
      const existing = (
        await db.query(
          "SELECT * FROM upload_sessions WHERE tenant_id = ? AND sha256 = ?",
          [row.tenantId, row.sha256],
        )
      ).rows[0];
      return { created: false, session: toResource(existing) };
    },

    /**
     * Unions newly-declared targets onto a still in-progress session's own
     * list, so a create call repeated mid-transfer with one more target
     * does not silently lose it before `finalize` eventually unions the
     * list onto `capture_targets` (`insertCaptureWithTargets`'s own rule,
     * mirrored here). A no-op, no-write return when nothing is new.
     */
    async unionTargetIds(tenantId, id, targetIds, updatedAt) {
      const session = await this.get(tenantId, id);
      if (!session) return null;
      const merged = [...new Set([...session.targetIds, ...targetIds])];
      if (merged.length === session.targetIds.length) return session;
      if (merged.length > 16)
        throw new UploadSessionRepositoryError(
          "invalid_request",
          "A capture may show at most 16 targets.",
          { status: 400 },
        );
      await db.run(
        "UPDATE upload_sessions SET target_ids_json = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
        [JSON.stringify(merged), updatedAt, tenantId, id],
      );
      return { ...session, targetIds: merged, updatedAt };
    },

    /**
     * Aims a still in-progress session at the capture its latest create
     * names (`variantOf`, `null`: a new capture), with that create's night,
     * plan, source and declared metadata (the role and the frames of a
     * progression image, the proposals). The bytes already received and the
     * offset are kept: the content is the same, only where it goes changed
     * (a capture removed since the first create, the plan sent again).
     */
    async retarget(
      tenantId,
      id,
      { variantOf, sessionId, planId, source, metadata },
      updatedAt,
    ) {
      await db.run(
        `UPDATE upload_sessions
           SET variant_of = ?, session_id = ?, plan_id = ?, source = ?,
               metadata_json = ?, updated_at = ?
         WHERE tenant_id = ? AND id = ? AND state = 'in_progress'`,
        [
          variantOf ?? null,
          sessionId ?? null,
          planId ?? null,
          source ?? null,
          metadata ? JSON.stringify(metadata) : null,
          updatedAt,
          tenantId,
          id,
        ],
      );
      return await this.get(tenantId, id);
    },

    async findBySha256(tenantId, sha256) {
      const row = (
        await db.query(
          "SELECT * FROM upload_sessions WHERE tenant_id = ? AND sha256 = ?",
          [tenantId, sha256],
        )
      ).rows[0];
      return row ? toResource(row) : null;
    },

    async get(tenantId, id) {
      const row = (
        await db.query(
          "SELECT * FROM upload_sessions WHERE tenant_id = ? AND id = ?",
          [tenantId, id],
        )
      ).rows[0];
      return row ? toResource(row) : null;
    },

    async deleteRow(tenantId, id) {
      await db.run(
        "DELETE FROM upload_sessions WHERE tenant_id = ? AND id = ?",
        [tenantId, id],
      );
    },

    async setOffset(tenantId, id, offset, updatedAt) {
      await db.run(
        "UPDATE upload_sessions SET offset_bytes = ?, updated_at = ? WHERE tenant_id = ? AND id = ?",
        [offset, updatedAt, tenantId, id],
      );
    },

    /** Resets a session to accept a full re-upload from byte zero, after a hash mismatch discarded its part file. */
    async resetOffset(tenantId, id, updatedAt) {
      await db.run(
        "UPDATE upload_sessions SET offset_bytes = 0, updated_at = ? WHERE tenant_id = ? AND id = ?",
        [updatedAt, tenantId, id],
      );
    },

    async markCompleted(tenantId, id, captureId, updatedAt) {
      await db.run(
        `UPDATE upload_sessions
           SET state = 'completed', capture_id = ?, offset_bytes = byte_size, updated_at = ?
         WHERE tenant_id = ? AND id = ?`,
        [captureId, updatedAt, tenantId, id],
      );
    },

    /**
     * Marks an existing, already-completed `(tenant_id, sha256)` row's
     * capture — used only when `finalize` unions new targets onto a capture
     * that was itself created by an older, non-resumable single-request
     * upload, so this table still has a row to answer future
     * `GET/POST /v1/uploads` calls from.
     */
    async recordExistingCapture(row, captureId, now) {
      const existing = await this.findBySha256(row.tenantId, row.sha256);
      if (existing) {
        if (existing.state !== "completed")
          await this.markCompleted(row.tenantId, existing.id, captureId, now);
        return existing.state === "completed"
          ? existing
          : {
              ...existing,
              state: "completed",
              captureId,
              offset: existing.byteSize,
            };
      }
      const { session } = await this.createOrGet({
        ...row,
        createdAt: now,
        expiresAt: now,
      });
      await this.markCompleted(row.tenantId, session.id, captureId, now);
      return {
        ...session,
        state: "completed",
        captureId,
        offset: session.byteSize,
      };
    },

    /**
     * A space's unfinished uploads: how many are
     * open and how many bytes they already hold, for the quota and the cap
     * on open uploads. An expired one is not counted — it is purged.
     * `excludeId` leaves one session out (finalize counts its own bytes as
     * the file being stored, not as held).
     */
    async openUploads(tenantId, now, { excludeId = null } = {}) {
      const exclusion = excludeId ? " AND id <> ?" : "";
      const row = (
        await db.query(
          `SELECT COUNT(*) AS count,
                  COALESCE(SUM(CASE WHEN variant_of IS NULL THEN 1 ELSE 0 END), 0) AS captures,
                  COALESCE(SUM(offset_bytes), 0) AS received
             FROM upload_sessions
            WHERE tenant_id = ? AND state = 'in_progress' AND expires_at > ?${exclusion}`,
          excludeId ? [tenantId, now, excludeId] : [tenantId, now],
        )
      ).rows[0];
      return {
        count: Number(row?.count || 0),
        // The uploads that will make a new capture (not an image added to an
        // existing one), for `capture.count_limit`.
        captures: Number(row?.captures || 0),
        receivedBytes: Number(row?.received || 0),
      };
    },

    /** The maintenance sweep (`api/uploads.md`'s 72-hour expiry): returns what it purged, for a caller that also wants to remove their part files. Deletes exactly the rows it read, so a session created meanwhile is never removed without its file. */
    async purgeExpired(now) {
      const rows = (
        await db.query(
          "SELECT * FROM upload_sessions WHERE state = 'in_progress' AND expires_at <= ?",
          [now],
        )
      ).rows;
      for (const row of rows)
        await db.run(
          "DELETE FROM upload_sessions WHERE id = ? AND state = 'in_progress' AND expires_at <= ?",
          [row.id, now],
        );
      return rows.map(toResource);
    },
  };
}
