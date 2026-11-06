import { createSessionPackageImportService } from "portal/api/session-package-import.js";
import { databaseDriver } from "portal/persistence/database.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

let sharedService = null;
let configurationKey = null;

/**
 * Keeps session-package-import operations on the process-owned persistence
 * driver every other v1 repository shares, on the exact pattern of
 * `upload-resource-service.js`. This service never gates on a capability,
 * only on the shared soft-downgrade `writeAccessFor` switch
 * — no new media bytes are ever written by a confirm, every
 * capture-like asset's bytes were already accounted for at its own upload.
 */
export async function sessionPackageImportService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Session package import database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createSessionPackageImportService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider: entitlementProviderFor(driver),
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireSessionPackageImportService() {
  const service = await sessionPackageImportService();
  if (service) return service;
  throw Object.assign(
    new Error("Session package import storage is unavailable."),
    { code: "session_package_import_unavailable", status: 503 },
  );
}

/** Preserves the package service's contractual error body, on the exact pattern of `uploadResourceFailure`. */
export function sessionPackageImportFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "session_package_import_unavailable",
    message: "Session package import storage is unavailable.",
    status: 503,
  });
}
