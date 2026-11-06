import { createPlanResourceService } from "portal/api/plan-resources.js";
import { databaseDriver } from "portal/persistence/database.js";
import {
  entitlementProviderFor,
  multiNightUnrestricted,
} from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

/**
 * The plan service of every route that reads or writes plans, and of the
 * planner page (the page reads its capabilities through
 * `capabilitiesFor`, never a copy). Its capabilities come from
 * `./entitlement-provider.js`: a private server's open-source profile, or
 * the provider a composition registers.
 */
let sharedService = null;
let configurationKey = null;
// The service being created: concurrent first requests (a map's tiles, all
// at once) share one creation instead of each running the migrations, which
// SQLite refuses as nested transactions.
let pendingService = null;

/**
 * Keeps API resource operations on the process-owned persistence driver, like
 * the existing auth and planner repositories. A process cannot safely switch
 * database configuration after its first service has been created.
 */
export async function planResourceService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Plan resource database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  if (!pendingService) {
    const driver = databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    });
    pendingService = createPlanResourceService({
      driver,
      dialect: databaseUrl ? "postgres" : "sqlite",
      entitlementProvider: entitlementProviderFor(driver),
      // A private server never restricts the multi-night plans: the links of its plans to them are always allowed.
      multiNightOpen: () => multiNightUnrestricted(),
    })
      .then((service) => {
        sharedService = service;
        configurationKey = nextKey;
        return service;
      })
      .finally(() => {
        pendingService = null;
      });
  }
  return pendingService;
}

export async function requirePlanResourceService() {
  const service = await planResourceService();
  if (service) return service;
  throw Object.assign(new Error("Plan storage is unavailable."), {
    code: "plan_storage_unavailable",
    status: 503,
  });
}

/** Preserves the package service's contractual error body, including 409 details. */
export function planResourceFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "plan_storage_unavailable",
    message: "Plan storage is unavailable.",
    status: 503,
  });
}
