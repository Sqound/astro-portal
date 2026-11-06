import { resolveWriteAccess } from "portal/capabilities/provider.js";
import { databaseDriver } from "portal/persistence/database.js";
import { createProjectService } from "planner-projects/handlers.js";
import { enabledServiceExtension } from "../service-extensions.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

/**
 * The projects — shown to the observer as « plans multi-nuits » — are the
 * open core's (`planner-projects`): their contract, their table, the routes
 * below and their service. The server never restricts them by itself: on a
 * private server every write is open. A composition may register a gated
 * service at the `planner.projects` point (`../service-extensions.js`):
 * writing then needs the capability of the mosaics (`planner.mosaic`) — the
 * capability list read by the mobile clients and by Astro Sync stays the
 * same — outside a read-only window.
 */
export const PROJECTS_CAPABILITY = "planner.mosaic";

/** The registered projects extension when it is on, or `null`. */
export function projectsExtension(env = process.env) {
  return enabledServiceExtension("planner.projects", env);
}

/** The core's own extension: the same service, ungated (a private server). */
const unrestrictedProjects = Object.freeze({
  service: ({ driver, dialect }) => createProjectService({ driver, dialect }),
});

let shared = null;

/**
 * The projects service: the registered extension's when it is on (with the
 * entitlement provider of every resource service, read at each call, so that
 * a provider registered later is the one asked), else the core's own,
 * ungated — on the process-owned database driver.
 */
export async function requireProjectResourceService(
  extension = projectsExtension(),
) {
  const chosen = extension || unrestrictedProjects;
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
  if (shared && shared.key === key && shared.extension === chosen)
    return shared.service;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  const entitlementProvider = {
    capabilitiesFor: (userId) =>
      entitlementProviderFor(driver).capabilitiesFor(userId),
    writeAccessFor: (userId) =>
      resolveWriteAccess(entitlementProviderFor(driver), userId),
  };
  const service = await chosen.service({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider,
  });
  shared = { key, extension: chosen, service };
  return service;
}

/** Preserves the service's contractual error body, including a 409's project. */
export function projectResourceFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "project_storage_unavailable",
    message: "Project storage is unavailable.",
    status: 503,
  });
}
