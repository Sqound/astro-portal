import { createPlanTrashService } from "portal/api/plan-trash.js";
import { databaseDriver } from "portal/persistence/database.js";
import { requirePlanResourceService } from "./plan-resource-service.js";
import { v1Error, v1Json } from "./response.js";

// The deleted plans — of one night and multi-night: list, restore, erase,
// the deletion of a multi-night plan, and the hourly erasure of those past
// their 30 days. On the process-owned driver every other v1 service shares.
// A restored plan meets the plan service's own rights (`writeRightsFor`).

let shared = null;
let configurationKey = null;
let pending = null;

export async function requirePlanTrashService() {
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
      "Plan trash database configuration cannot change during a process.",
    );
  if (shared) return shared;
  if (!pending)
    pending = createPlanTrashService({
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
      rightsFor: async (userId) =>
        userId
          ? await (await requirePlanResourceService()).writeRightsFor(userId)
          : { planLimit: 0, plannerMultiple: true },
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
export function planTrashFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "plan_storage_unavailable",
    message: "Plan storage is unavailable.",
    status: 503,
  });
}

/**
 * The hourly erasure of the plans and multi-night plans deleted more than
 * 30 days ago (`server/start.js`); logs, never throws. Nothing without a
 * database.
 */
export async function purgeDeletedPlans({ log, at } = {}) {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    return null;
  try {
    const result = await (
      await requirePlanTrashService()
    ).purgeExpired(at ? { at } : {});
    if (result.plans || result.projects || result.failed)
      log?.info?.(
        "plans.purged",
        `${result.plans} deleted plan(s) and ${result.projects} multi-night plan(s) past their grace erased${result.failed ? `; ${result.failed} could not be erased and will be tried again` : ""}.`,
      );
    return result;
  } catch (error) {
    log?.warn?.(
      "plans.purged",
      `The deleted plans were not erased (${error.message}).`,
    );
    return null;
  }
}
