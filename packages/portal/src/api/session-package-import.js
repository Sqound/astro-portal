import { randomUUID } from "node:crypto";
import { resolveWriteAccess, staticProfile } from "../capabilities/provider.js";
import { createDatabaseDriver } from "../persistence/database.js";
import {
  CaptureRepositoryError,
  createCaptureRepository,
} from "../persistence/capture-repository.js";
import {
  SessionPackageImportRepositoryError,
  createSessionPackageImportRepository,
} from "../persistence/session-package-import-repository.js";
import {
  SessionPackageManifestError,
  isCaptureLikeKind,
  pairAssetsWithChecksums,
  parseChecksumsText,
  parseManifestJson,
  verifyInlineDocumentBytes,
} from "../session-package/manifest.js";

/**
 * The stable application error for thin HTTP adapters, on the exact pattern
 * of `PlanResourceError`/`UploadResourceError`. `body` is already the
 * versioned v1 error envelope.
 */
export class SessionPackageImportError extends Error {
  constructor(code, message, { status = 400, ...details } = {}) {
    super(message);
    this.name = "SessionPackageImportError";
    this.code = code;
    this.status = status;
    this.body = { error: { code, message }, ...details };
    Object.assign(this, details);
  }
}

function statusForCode(code) {
  switch (code) {
    case "invalid_request":
    case "invalid_path":
      return 400;
    case "checksum_mismatch":
      return 422;
    case "asset_not_uploaded":
      return 409;
    case "session_not_found":
      return 404;
    case "entitlement_read_only":
      return 403;
    default:
      return 400;
  }
}

/** Turns any error this module's dependencies can throw into a `SessionPackageImportError`. */
function apiError(error) {
  if (error instanceof SessionPackageImportError) return error;
  if (
    error instanceof SessionPackageManifestError ||
    error instanceof CaptureRepositoryError ||
    error instanceof SessionPackageImportRepositoryError
  )
    return new SessionPackageImportError(error.code, error.message, {
      status: error.status || statusForCode(error.code),
      ...(error.path ? { path: error.path } : {}),
    });
  return new SessionPackageImportError(
    "session_package_import_unavailable",
    "Session package import storage is unavailable.",
    { status: 503 },
  );
}

function requiredIdentifier(value, label) {
  const result = String(value || "").trim();
  if (!result)
    throw new SessionPackageImportError(
      "invalid_request",
      `${label} is required.`,
    );
  return result;
}

/**
 * The shared analysis both `preview` and `confirm` run: schema/checksum/
 * path validation (`session-package/manifest.js`), then, per asset:
 *
 * - image/progression ("capture-like", stored media): resolved against the
 *   tenant's own capture store by `sha256`. **This module never receives
 *   these bytes itself.** They must already have been uploaded ahead of the
 *   import through the existing, already-hashed, already quota/entitlement
 *   gated `POST /v1/uploads` path — the simplest transport that stays
 *   testable (each asset sent through the upload route, then a
 *   manifest.json), and the only way this route can honour "SHA-256
 *   verification is mandatory" without re-implementing a ZIP reader: the finalize step that already
 *   ran for that upload recomputed and checked that exact digest. A missing
 *   asset is `409 asset_not_uploaded`, never silently skipped.
 * - metric-log/event-log/other ("document" kind, never stored media, never
 *   a capture): carried inline in this same request (`documents[path]`,
 *   base64) and hashed here, directly, against `checksums.sha256` — see
 *   `verifyInlineDocumentBytes`.
 *
 * Purely read-only: no write ever happens in here, which is exactly what
 * lets `preview` share this function with `confirm` while still persisting
 * nothing.
 */
async function analyzePackage({
  captureStore,
  tenantId,
  sessionId,
  manifestJson,
  checksums,
  documents,
}) {
  const manifest = parseManifestJson(manifestJson);
  const checksumsByPath = parseChecksumsText(checksums);
  const paired = pairAssetsWithChecksums(manifest.assets, checksumsByPath);

  const byKind = {};
  const warnings = [];
  const captureAssets = [];
  const documentAssets = [];
  let totalBytes = 0;

  for (const asset of paired) {
    totalBytes += asset.bytes;
    const bucket = byKind[asset.kind] || { count: 0, bytes: 0 };
    bucket.count += 1;
    bucket.bytes += asset.bytes;
    byKind[asset.kind] = bucket;

    if (isCaptureLikeKind(asset.kind)) {
      const existingCapture = await captureStore.findCaptureBySha256(
        tenantId,
        asset.sha256,
      );
      if (!existingCapture)
        throw new SessionPackageImportError(
          "asset_not_uploaded",
          `Asset "${asset.path}" (sha256 ${asset.sha256}) has not been uploaded yet. Upload it through POST /v1/uploads before importing this package.`,
          { status: 409, path: asset.path },
        );
      // The bytes held under this digest: those of the image itself. A
      // capture's other images (its variants) have their own size, not the
      // capture's.
      const held = await captureStore.findVariantBySha256?.(
        tenantId,
        asset.sha256,
      );
      const storedBytes = held?.variant?.byteSize ?? existingCapture.byteSize;
      if (storedBytes !== asset.bytes)
        throw new SessionPackageImportError(
          "checksum_mismatch",
          `Asset "${asset.path}" declares ${asset.bytes} bytes but the uploaded capture is ${storedBytes} bytes.`,
          { status: 422, path: asset.path },
        );
      if (existingCapture.sessionId && existingCapture.sessionId !== sessionId)
        warnings.push({
          code: "capture_attached_elsewhere",
          path: asset.path,
          message: `Asset "${asset.path}" is already attached to a different session; it will remain there — a capture's session association never changes once set.`,
        });
      else if (!existingCapture.sessionId)
        warnings.push({
          code: "capture_session_unset",
          path: asset.path,
          message: `Asset "${asset.path}" was uploaded without a session. Confirming this import will not retroactively attach it — re-upload it with this session's id to have it appear there.`,
        });
      captureAssets.push({ ...asset, existingCapture });
    } else {
      const content = verifyInlineDocumentBytes(asset, documents?.[asset.path]);
      documentAssets.push({ ...asset, content });
    }
  }

  return {
    manifest,
    manifestSha256: manifest.manifestSha256,
    assetCount: paired.length,
    totalBytes,
    byKind,
    warnings,
    captureAssets,
    documentAssets,
  };
}

function recognizedSummary(analysis) {
  return {
    assetCount: analysis.assetCount,
    totalBytes: analysis.totalBytes,
    byKind: analysis.byKind,
  };
}

/**
 * Framework-free v1 service for `POST /v1/sessions/{id}/imports/preview`
 * and `.../imports/confirm`, on the pattern of
 * `createUploadResourceService`. A route adapter supplies authenticated
 * identity and the parsed JSON body, and turns the returned value or thrown
 * `SessionPackageImportError` into HTTP.
 */
export async function createSessionPackageImportService({
  captureRepository = null,
  importRepository = null,
  databasePath,
  databaseUrl,
  driver,
  dialect,
  entitlementProvider = null,
  now = () => new Date().toISOString(),
  idGenerator = randomUUID,
} = {}) {
  const resolvedDriver =
    driver ||
    (databaseUrl || databasePath
      ? createDatabaseDriver({ databasePath, databaseUrl })
      : null);
  const ownsResolvedDriver = !driver && Boolean(resolvedDriver);
  const resolvedDialect =
    dialect || resolvedDriver?.dialect || (databaseUrl ? "postgres" : "sqlite");
  const captures =
    captureRepository ||
    (await createCaptureRepository({
      driver: resolvedDriver,
      dialect: resolvedDialect,
      databasePath,
      databaseUrl,
    }));
  const imports =
    importRepository ||
    (await createSessionPackageImportRepository({
      driver: resolvedDriver,
      dialect: resolvedDialect,
      databasePath,
      databaseUrl,
    }));
  const provider = entitlementProvider || staticProfile({});

  async function requireSessionRow(tenantId, sessionId) {
    const row = await imports.sessionRow(tenantId, sessionId);
    if (!row)
      throw new SessionPackageImportError(
        "session_not_found",
        "The session was not found.",
        { status: 404 },
      );
    return row;
  }

  return {
    async close() {
      await captures.close?.();
      await imports.close?.();
      if (ownsResolvedDriver) await resolvedDriver.close();
    },

    /**
     * Validates, checks idempotency, and reports exactly what would be
     * imported — recognized data by kind, warnings, visibility, and the
     * exact transfer volume — **without writing anything** (README, hard
     * rule 5). Every failure this throws is one `confirm` would throw too,
     * at the exact same step: a package that previews clean is guaranteed
     * to confirm the same way (barring a race with another confirm of the
     * same manifest in between).
     */
    async preview({ tenantId, sessionId, manifestJson, checksums, documents }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const session = requiredIdentifier(sessionId, "Session id");
      try {
        await requireSessionRow(tenant, session);
        const analysis = await analyzePackage({
          captureStore: captures,
          tenantId: tenant,
          sessionId: session,
          manifestJson,
          checksums,
          documents,
        });
        const previousImport = await imports.findImportByManifest(
          tenant,
          analysis.manifestSha256,
        );
        return {
          status: 200,
          body: {
            manifestSha256: analysis.manifestSha256,
            alreadyImported: Boolean(previousImport),
            ...(previousImport
              ? {
                  previousImport: {
                    sessionId: previousImport.sessionId,
                    importedAt: previousImport.importedAt,
                    assetCount: previousImport.assetCount,
                    bytes: previousImport.bytes,
                  },
                }
              : {}),
            recognized: recognizedSummary(analysis),
            warnings: analysis.warnings,
            visibility: "private",
          },
        };
      } catch (error) {
        throw apiError(error);
      }
    },

    /**
     * Idempotent by manifest fingerprint, at the tenant level (migration
     * 26's `UNIQUE(tenant_id, manifest_sha256)`): a second confirm of the
     * same manifest bytes — for this session or, per the README's literal
     * "re-importing the same package changes nothing", even one naming a
     * different session — replays the first result and writes nothing new.
     * On the first confirm: entitlement is checked (quota/max-file-bytes
     * are not — no new bytes are written here, every capture-like asset's
     * bytes were already accounted for at its own upload), then every
     * image/progression asset is linked through the exact same
     * `insertCaptureWithTargets` path a manual upload uses (dedup by
     * sha256: an asset already a capture is linked, never recopied), and
     * every metric/event/other asset is appended to the session's own
     * document list.
     */
    async confirm({
      tenantId,
      userId,
      sessionId,
      manifestJson,
      checksums,
      documents,
    }) {
      const tenant = requiredIdentifier(tenantId, "Tenant id");
      const session = requiredIdentifier(sessionId, "Session id");
      const normalizedUserId =
        userId === null || userId === undefined
          ? null
          : requiredIdentifier(userId, "User id");
      try {
        await requireSessionRow(tenant, session);
        const analysis = await analyzePackage({
          captureStore: captures,
          tenantId: tenant,
          sessionId: session,
          manifestJson,
          checksums,
          documents,
        });

        const existingImport = await imports.findImportByManifest(
          tenant,
          analysis.manifestSha256,
        );
        if (existingImport)
          return {
            status: 200,
            body: {
              manifestSha256: analysis.manifestSha256,
              alreadyImported: true,
              sessionId: existingImport.sessionId,
              importedAt: existingImport.importedAt,
              assetCount: existingImport.assetCount,
              bytes: existingImport.bytes,
              warnings: analysis.warnings,
            },
          };

        const writeAccess = await resolveWriteAccess(
          provider,
          normalizedUserId,
        );
        if (writeAccess.readOnly)
          throw new SessionPackageImportError(
            "entitlement_read_only",
            "This account's subscription has ended: new imports are suspended; existing sessions remain readable and exportable.",
            { status: 403 },
          );

        for (const asset of analysis.captureAssets)
          await captures.insertCaptureWithTargets({
            id: idGenerator(),
            tenantId: tenant,
            sessionId: session,
            originalName: asset.path,
            sha256: asset.sha256,
            byteSize: asset.bytes,
            status: "uploaded",
            // A device's capture is a draft; its main image comes from
            // Astro Sync.
            stage: "draft",
            source: "astro-sync",
            createdAt: now(),
          });

        const newDocuments = analysis.documentAssets.map((asset) => ({
          path: asset.path,
          kind: asset.kind,
          bytes: asset.bytes,
          sha256: asset.sha256,
          mimeType: asset.mimeType,
          capturedAt: asset.capturedAt,
          addedAt: asset.addedAt,
          content: asset.content.toString("base64"),
        }));
        if (newDocuments.length)
          await imports.appendDocuments(tenant, session, newDocuments);

        const { record } = await imports.recordImport({
          id: idGenerator(),
          tenantId: tenant,
          sessionId: session,
          manifestSha256: analysis.manifestSha256,
          assetCount: analysis.assetCount,
          bytes: analysis.totalBytes,
          importedAt: now(),
        });

        return {
          status: 200,
          body: {
            manifestSha256: record.manifestSha256,
            alreadyImported: false,
            sessionId: record.sessionId,
            importedAt: record.importedAt,
            assetCount: record.assetCount,
            bytes: record.bytes,
            capturesLinked: analysis.captureAssets.length,
            documentsAttached: newDocuments.length,
            warnings: analysis.warnings,
          },
        };
      } catch (error) {
        throw apiError(error);
      }
    },
  };
}
