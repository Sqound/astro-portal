import { ensureTargetCatalogue } from "../target-library.server.js";
import { createNightService } from "portal/api/night-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import { v1Error, v1Json } from "./response.js";

// The structured night: its own
// fields, its steps, its summaries and « what is online » for it — never
// capability-gated (reading a night is never gated; `analysis.logs`
// gates the creation of an analysis only). On the process-owned driver
// every other v1 service shares, on the pattern of
// `observation-session-service.js`.

let sharedService = null;
let configurationKey = null;

export async function nightService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  await ensureTargetCatalogue();
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Night database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  sharedService = await createNightService({
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireNightService() {
  const service = await nightService();
  if (service) return service;
  throw Object.assign(new Error("Session storage is unavailable."), {
    code: "observation_session_storage_unavailable",
    status: 503,
  });
}

/**
 * The night's fields GET /v1/sessions/{id} adds (`night`, `steps`,
 * `qualitySummary`, `guidingSummary`, `guidingSeries`), or `{}` when the
 * storage cannot give them: a session's detail never fails over them.
 */
export async function nightFields({ tenantId, sessionId }) {
  try {
    const service = await nightService();
    if (!service) return {};
    return await service.read({ tenantId, sessionId });
  } catch {
    return {};
  }
}

/** Preserves the service's contractual error body (400, 404, 409, 422). */
export function nightFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "observation_session_storage_unavailable",
    message: "Session storage is unavailable.",
    status: 503,
  });
}
