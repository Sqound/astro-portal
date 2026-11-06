import { createSessionTrashService } from "portal/api/session-trash.js";
import { databaseDriver } from "portal/persistence/database.js";
import { enabledServiceExtension } from "../service-extensions.js";
import { requireOwnerCaptureService } from "./owner-capture-service.js";
import { v1Error, v1Json } from "./response.js";

// The deleted sessions: delete, restore, list, erase, and
// the hourly erasure of the sessions past their 30 days. On the process-owned
// driver every other v1 service shares. The captures of an erased session go
// through the owner's capture service, which removes their files.

let shared = null;
let configurationKey = null;
let pending = null;

export async function requireSessionTrashService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl)
    throw Object.assign(new Error("Session storage is unavailable."), {
      code: "observation_session_storage_unavailable",
      status: 503,
    });
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (shared && configurationKey !== nextKey)
    throw new Error(
      "Session trash database configuration cannot change during a process.",
    );
  if (shared) return shared;
  if (!pending)
    pending = createSessionTrashService({
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
      // The rows a composition keeps about a night (`sessions.erasure`),
      // looked up at each call: the service outlives the registration order.
      complement: {
        footprint: async (executor, night) =>
          await enabledServiceExtension("sessions.erasure")?.footprint(
            executor,
            night,
          ),
        erase: async (transaction, night) =>
          await enabledServiceExtension("sessions.erasure")?.erase(
            transaction,
            night,
          ),
      },
      removeCapture: async ({ tenantId, captureId }) =>
        await (
          await requireOwnerCaptureService()
        ).remove({
          tenantId,
          captureId,
          // The captures of a session in the trash are masked: the erasure
          // of the session is the one gesture that names them.
          sessionErased: true,
        }),
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
export function sessionTrashFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "observation_session_storage_unavailable",
    message: "Session storage is unavailable.",
    status: 503,
  });
}

/**
 * The hourly erasure of the sessions deleted more than 30 days ago
 * (`server/start.js`); logs, never throws. Nothing without a database.
 */
export async function purgeDeletedSessions({ log, at } = {}) {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    return null;
  try {
    const result = await (
      await requireSessionTrashService()
    ).purgeExpired(at ? { at } : {});
    if (result.sessions || result.failed)
      log?.info?.(
        "sessions.purged",
        `${result.sessions} deleted session(s) past their grace erased with ${result.captures} capture(s)${result.failed ? `; ${result.failed} could not be erased and will be tried again` : ""}.`,
      );
    return result;
  } catch (error) {
    log?.warn?.(
      "sessions.purged",
      `The deleted sessions were not erased (${error.message}).`,
    );
    return null;
  }
}
