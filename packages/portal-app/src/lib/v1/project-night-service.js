import { createProjectNightService } from "portal/api/project-nights.js";
import { databaseDriver } from "portal/persistence/database.js";
import { multiNightAttachActiveFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

/**
 * The nights of the multi-night plans on the process-owned database driver. Reading is
 * the core's on every service; attaching and detaching need the
 * multi-night plans (`multiNightAttachActiveFor`: `planner.mosaic` where a
 * provider is registered; always on a private server), asked at each call so
 * that a provider registered later is the one asked.
 */
let shared = null;

export async function requireProjectNightService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl)
    throw Object.assign(new Error("Project storage is unavailable."), {
      code: "project_storage_unavailable",
      status: 503,
    });
  const key = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (shared && shared.key === key) return shared.pending;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  const pending = createProjectNightService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    multiNightActive: (userId) => multiNightAttachActiveFor(driver, userId),
  });
  shared = { key, pending };
  pending.catch(() => {
    if (shared?.pending === pending) shared = null;
  });
  return pending;
}

/** Preserves the service's contractual error body. */
export function projectNightFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "project_storage_unavailable",
    message: "Project storage is unavailable.",
    status: 503,
  });
}
