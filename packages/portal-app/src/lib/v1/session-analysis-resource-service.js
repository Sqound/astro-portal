import { createSessionAnalysisService } from "portal/api/session-analysis-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

// `analysis.logs` — the display and the storage of the night's analysis on
// the server — comes from `./entitlement-provider.js`: true in the
// open-source profile, else what the registered provider says. The
// analysis itself runs in Astro Sync, on the person's computer.
let sharedService = null;
let configurationKey = null;

/**
 * Keeps session-analysis operations on the process-owned persistence driver
 * every other v1 repository shares, on the exact pattern of
 * `session-package-import-service.js`.
 */
export async function sessionAnalysisService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Session analysis database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createSessionAnalysisService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider: entitlementProviderFor(driver),
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireSessionAnalysisService() {
  const service = await sessionAnalysisService();
  if (service) return service;
  throw Object.assign(new Error("Session analysis storage is unavailable."), {
    code: "session_analysis_unavailable",
    status: 503,
  });
}

/** Preserves the service's contractual error body, on the exact pattern of `sessionPackageImportFailure`. */
export function sessionAnalysisFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "session_analysis_unavailable",
    message: "Session analysis storage is unavailable.",
    status: 503,
  });
}
