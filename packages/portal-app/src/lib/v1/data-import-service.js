import { DataImportError } from "portal/data-import/reader.js";
import { createDataImportService } from "portal/data-import/service.js";
import { PayloadTooLargeError, readBodyBytes } from "portal/api/json-body.js";
import { databaseDriver } from "portal/persistence/database.js";
import { spacePageSettings } from "../space-pages.server.js";
import { deviceOrSessionWriteV1Access } from "./access.js";
import {
  entitlementProviderFor,
  writeAccessFor,
} from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

/**
 * What a service where spaces are open reads of a file. The export is a zip of a few
 * kilobytes to a few megabytes: above `DATA_IMPORT_MAX_BYTES` (the file
 * itself) or `DATA_IMPORT_MAX_CONTENT_BYTES` (what it inflates to) the
 * import is refused, `413` `payload_too_large`, saying which cap it met. A
 * private server reads under its own `storage.max_file_bytes` and the
 * reader's technical ceiling only, as before.
 */
export const DATA_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const DATA_IMPORT_MAX_CONTENT_BYTES = 64 * 1024 * 1024;

let shared = null;
let configurationKey = null;
let pending = null;

function databaseSettings() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl)
    throw Object.assign(new Error("Data import is unavailable."), {
      code: "data_import_unavailable",
      status: 503,
    });
  return { databasePath, databaseUrl };
}

/**
 * The service of « Importer mes données » on the process-owned database
 * driver, like `data-export-service.js`: created once, shared by the two
 * routes, never switched to another database during a process.
 */
export async function requireDataImportService() {
  const { databasePath, databaseUrl } = databaseSettings();
  const key = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (shared && configurationKey !== key)
    throw new Error(
      "Data import database configuration cannot change during a process.",
    );
  if (shared) return shared;
  if (!pending)
    pending = createDataImportService({
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    })
      .then((service) => {
        shared = service;
        configurationKey = key;
        return service;
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}

function entitlementProvider() {
  const { databasePath, databaseUrl } = databaseSettings();
  return entitlementProviderFor(
    databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
  );
}

/**
 * The largest file the credential's space may send, and why: its
 * `storage.max_file_bytes`, and where spaces are open no more than
 * `DATA_IMPORT_MAX_BYTES`.
 */
function fileCeiling(capabilities, hosted) {
  const storage = Number(capabilities["storage.max_file_bytes"]) || 0;
  if (hosted && DATA_IMPORT_MAX_BYTES < storage)
    return { limit: DATA_IMPORT_MAX_BYTES, reason: "data_import_max_bytes" };
  return { limit: storage, reason: "storage_max_file_bytes" };
}

function failure(error, reason = null) {
  if (error instanceof PayloadTooLargeError)
    return v1Json(
      {
        error: { code: "payload_too_large", message: error.message },
        ...(reason ? { reason } : {}),
        ...(error.limit ? { limitBytes: error.limit } : {}),
      },
      { status: 413 },
    );
  if (error instanceof DataImportError)
    return v1Json(
      {
        error: { code: error.code, message: error.message },
        // The file inflates beyond what the reader takes: the cap is the
        // content's, not the file's.
        ...(error.code === "payload_too_large"
          ? { reason: "data_import_max_content_bytes" }
          : {}),
        ...error.details,
      },
      { status: error.status },
    );
  return v1Error(error, {
    code: "data_import_unavailable",
    message: "Data import is unavailable.",
    status: 503,
  });
}

/**
 * The two routes of « Importer mes données »: the
 * body is the ZIP itself, read under the space's
 * `storage.max_file_bytes` (`413 payload_too_large` above it, and above
 * `DATA_IMPORT_MAX_BYTES` where spaces are open, which names the cap in
 * `reason`), for the credential's own space -- a web session with its CSRF
 * token, or a device. The space's offer is applied to what enters
 * (`./plan.js`: a plan beyond « one plan per night » or the plan guard, a
 * mosaic or a multi-night plan without `planner.mosaic`, enters archived and
 * the report says so). The import itself is a write: an account in the
 * read-only window of an ended subscription answers `403`
 * `entitlement_read_only`; the dry run writes nothing and stays open.
 */
export async function handleDataImport(request, action) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  const hosted = Boolean(spacePageSettings());
  let reason = null;
  try {
    const provider = entitlementProvider();
    if (action === "confirm") {
      const write = await writeAccessFor(access.userId);
      if (write.readOnly)
        return v1Json(
          {
            error: {
              code: "entitlement_read_only",
              message:
                "This account's subscription has ended: imports are suspended; existing data remains readable and exportable.",
            },
          },
          { status: 403 },
        );
    }
    const capabilities = await provider.capabilitiesFor(access.userId);
    const ceiling = fileCeiling(capabilities, hosted);
    reason = ceiling.reason;
    const bytes = await readBodyBytes(request, { limit: ceiling.limit });
    const service = await requireDataImportService();
    const offer = { capabilities };
    const contentLimit = hosted ? DATA_IMPORT_MAX_CONTENT_BYTES : undefined;
    const body =
      action === "confirm"
        ? await service.confirm({
            tenantId: access.tenantId,
            userId: access.userId,
            bytes,
            offer,
            contentLimit,
          })
        : await service.preview({
            tenantId: access.tenantId,
            bytes,
            offer,
            contentLimit,
          });
    return v1Json(body);
  } catch (error) {
    return failure(error, reason);
  }
}
