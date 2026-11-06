import { createPlanSessionService } from "portal/api/plan-session.js";
import { databaseDriver } from "portal/persistence/database.js";
import { v1Error, v1Json } from "./response.js";

// What the owner does to a plan that is history: archive a debriefed
// plan, make the session of a plan again. On the process-owned driver
// every other v1 service shares, on the pattern of
// `observation-session-service.js`. Never held by a right.

let shared = null;
let configurationKey = null;
let pending = null;

export async function requirePlanSessionService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl)
    throw Object.assign(new Error("Plan storage is unavailable."), {
      code: "plan_storage_unavailable",
      status: 503,
    });
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (shared && configurationKey !== nextKey)
    throw new Error(
      "Plan session database configuration cannot change during a process.",
    );
  if (shared) return shared;
  if (!pending)
    pending = createPlanSessionService({
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    })
      .then((service) => {
        shared = service;
        configurationKey = nextKey;
        return service;
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}

/** Preserves the service's contractual error body, including 409 details. */
export function planSessionFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "plan_storage_unavailable",
    message: "Plan storage is unavailable.",
    status: 503,
  });
}
