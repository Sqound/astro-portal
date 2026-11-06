import { createObservationSessionService } from "portal/api/observation-sessions.js";
import { databaseDriver } from "portal/persistence/database.js";
import { v1Error, v1Json } from "./response.js";

// "Session" here is always an OBSERVATION session; see the naming note at
// the top of packages/portal/src/persistence/observation-session-repository.js.
// Sessions, events and the debriefing are never capability-gated, so unlike
// plan-resource-service.js this module needs no entitlement provider.

let sharedService = null;
let configurationKey = null;

/**
 * Keeps the observation-session service on the same process-owned
 * persistence driver every other v1 repository shares
 * (portal/persistence/database.js#databaseDriver is itself a process
 * singleton), on the exact pattern of ./plan-resource-service.js.
 */
export async function observationSessionService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Observation session database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  sharedService = await createObservationSessionService({
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireObservationSessionService() {
  const service = await observationSessionService();
  if (service) return service;
  throw Object.assign(new Error("Session storage is unavailable."), {
    code: "observation_session_storage_unavailable",
    status: 503,
  });
}

/** Preserves the package service's contractual error body, including 404/409 details. */
export function observationSessionFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "observation_session_storage_unavailable",
    message: "Session storage is unavailable.",
    status: 503,
  });
}
