import { createPlaceResourceService } from "portal/api/place-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

let sharedService = null;
let configurationKey = null;

/** The places of a space on the
 * process-owned persistence driver, like `framing-resource-service.js`. A
 * process cannot switch its database configuration after its first service
 * has been created. */
export async function placeResourceService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Place resource database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createPlaceResourceService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
    entitlementProvider: entitlementProviderFor(driver),
  });
  configurationKey = nextKey;
  return sharedService;
}

export async function requirePlaceResourceService() {
  const service = await placeResourceService();
  if (service) return service;
  throw Object.assign(new Error("Place storage is unavailable."), {
    code: "place_storage_unavailable",
    status: 503,
  });
}

/** Keeps the package service's contractual error body (`pendingPlans`,
 * `limit`). */
export function placeResourceFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "place_storage_unavailable",
    message: "Place storage is unavailable.",
    status: 503,
  });
}
