import { createDatabaseDriver } from "./database.js";
import { applyMigrations } from "./migration-runner.js";

const now = () => new Date().toISOString();

/** A package-level error that route adapters map to the v1 error envelope, on the exact pattern of `CaptureRepositoryError`. */
export class SessionPackageImportRepositoryError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionPackageImportRepositoryError";
    this.code = code;
    this.status = status;
    Object.assign(this, details);
  }
}

function toImportResource(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sessionId: row.session_id,
    manifestSha256: row.manifest_sha256,
    importedAt: row.imported_at,
    assetCount: Number(row.asset_count),
    bytes: Number(row.bytes),
  };
}

function parseDocuments(json) {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 5's persistence half: the `session_package_imports` idempotency ledger
 * (migration 26) and the small documents list
 * `observation_sessions. package_documents_json` carries for
 * metric/event/other package assets — see migration 26's own comment for
 * why the two live in this one small module rather than growing
 * `observation-session-repository.js` or `capture-repository.js`, neither
 * of which this concept is a natural extension of.
 */
export async function createSessionPackageImportRepository({
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
     * The tenant-scoped session row this import targets, with its current
     * documents list already decoded. `null` when the session does not
     * exist, or belongs to another tenant — the two cases a caller must
     * treat identically (never leak cross-tenant existence).
     */
    async sessionRow(tenantId, sessionId) {
      const row = (
        await db.query(
          "SELECT id, tenant_id, package_documents_json FROM observation_sessions WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL",
          [sessionId, tenantId],
        )
      ).rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        documents: parseDocuments(row.package_documents_json),
      };
    },

    /** A plain, read-only lookup by the `(tenant_id, manifest_sha256)` key `recordImport` is idempotent on. `null` when this manifest was never confirmed for this tenant. */
    async findImportByManifest(tenantId, manifestSha256) {
      const row = (
        await db.query(
          "SELECT * FROM session_package_imports WHERE tenant_id = ? AND manifest_sha256 = ?",
          [tenantId, manifestSha256],
        )
      ).rows[0];
      return row ? toImportResource(row) : null;
    },

    /**
     * Idempotent insert on `(tenant_id, manifest_sha256)` (migration 26's
     * unique index): a race, or a legitimate replay, is resolved by
     * re-reading whichever row actually won rather than failing — the same
     * doctrine `capture-repository.js#insertCaptureWithTargets` already
     * documents for `(tenant_id, sha256)`. The row's `session_id` is fixed
     * at its first creation and never updated by a later call, even one
     * naming a different session: "re-importing the same package changes
     * nothing" (README) is read literally, at the tenant level, not the
     * per-session level.
     */
    async recordImport({
      id,
      tenantId,
      sessionId,
      manifestSha256,
      assetCount,
      bytes,
      importedAt = now(),
    }) {
      const insert = await db.run(
        `INSERT INTO session_package_imports
           (id, tenant_id, session_id, manifest_sha256, imported_at, asset_count, bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(tenant_id, manifest_sha256) DO NOTHING`,
        [
          id,
          tenantId,
          sessionId,
          manifestSha256,
          importedAt,
          assetCount,
          bytes,
        ],
      );
      if (insert.rowCount === 1)
        return {
          created: true,
          record: toImportResource({
            id,
            tenant_id: tenantId,
            session_id: sessionId,
            manifest_sha256: manifestSha256,
            imported_at: importedAt,
            asset_count: assetCount,
            bytes,
          }),
        };
      const existing = await this.findImportByManifest(
        tenantId,
        manifestSha256,
      );
      if (!existing)
        throw new SessionPackageImportRepositoryError(
          "session_package_import_unavailable",
          "The import could not be recorded or re-read.",
          { status: 503 },
        );
      return { created: false, record: existing };
    },

    /**
     * Merges newly attached documents onto the session's own list,
     * deduplicated by `(path, sha256)` — a replay (or a package re-imported
     * after this call already ran once, though `recordImport`'s own
     * idempotency normally prevents that) never appends the same document
     * twice. Returns the full, updated list.
     */
    async appendDocuments(tenantId, sessionId, newDocuments) {
      if (!newDocuments.length) {
        const current = await this.sessionRow(tenantId, sessionId);
        return current?.documents || [];
      }
      return await db.transaction(async (tx) => {
        const row = (
          await tx.query(
            "SELECT package_documents_json FROM observation_sessions WHERE id = ? AND tenant_id = ?",
            [sessionId, tenantId],
          )
        ).rows[0];
        if (!row)
          throw new SessionPackageImportRepositoryError(
            "session_not_found",
            "The session was not found.",
            { status: 404 },
          );
        const existing = parseDocuments(row.package_documents_json);
        const seen = new Set(
          existing.map(
            (document) => `${document.path}\u0000${document.sha256}`,
          ),
        );
        const merged = [...existing];
        for (const document of newDocuments) {
          const key = `${document.path}\u0000${document.sha256}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(document);
        }
        await tx.run(
          "UPDATE observation_sessions SET package_documents_json = ? WHERE id = ? AND tenant_id = ?",
          [JSON.stringify(merged), sessionId, tenantId],
        );
        return merged;
      });
    },
  };
}
