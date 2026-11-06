import { createFramingResourceService } from "portal/api/framing-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

let sharedService = null;
let configurationKey = null;

/** Keeps API resource operations on the process-owned persistence driver,
 * like `plan-resource-service.js`. A process cannot safely switch database
 * configuration after its first service has been created. */
export async function framingResourceService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Framing resource database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createFramingResourceService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider: entitlementProviderFor(driver),
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requireFramingResourceService() {
  const service = await framingResourceService();
  if (service) return service;
  throw Object.assign(new Error("Framing storage is unavailable."), {
    code: "framing_storage_unavailable",
    status: 503,
  });
}

/** Preserves the package service's contractual error body, including 409 details. */
export function framingResourceFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "framing_storage_unavailable",
    message: "Framing storage is unavailable.",
    status: 503,
  });
}
