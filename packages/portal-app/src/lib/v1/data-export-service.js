import { createDataExportService } from "portal/data-export/service.js";
import { databaseDriver } from "portal/persistence/database.js";
import { v1Error } from "./response.js";

let shared = null;
let configurationKey = null;
let pending = null;

/**
 * The service of « Exporter mes données » on the process-owned database
 * driver, like `plan-resource-service.js`: created once, shared by the two
 * routes, never switched to another database during a process.
 */
export async function requireDataExportService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl)
    throw Object.assign(new Error("Data export is unavailable."), {
      code: "data_export_unavailable",
      status: 503,
    });
  const key = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (shared && configurationKey !== key)
    throw new Error(
      "Data export database configuration cannot change during a process.",
    );
  if (shared) return shared;
  if (!pending)
    pending = createDataExportService({
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

/** The error body of the two routes. */
export function dataExportFailure(error) {
  return v1Error(error, {
    code: "data_export_unavailable",
    message: "Data export is unavailable.",
    status: 503,
  });
}
