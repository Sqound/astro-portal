import { APPLICATION_LOG_RETENTION_DAYS } from "portal/persistence/application-log-repository.js";
import { appLogRepository } from "./app-log.server.js";
import { spacesOpen } from "./auth.server.js";
import { v1Json } from "./v1/response.js";

/**
 * The application's error logs: sent by a mobile client whose person turned « Envoyer les journaux d'erreur de
 * l'application » on, kept in the administration's « Journaux » with the
 * source `mobile`.
 *
 * Where the server opens spaces the route takes them.
 * A private server takes them only when its operator says so,
 * `ASTRO_PORTAL_APP_LOGS=accept`: otherwise the route answers
 * `404 not_available` before any credential is read, and the client, which
 * asks first (`GET /api/v1/app-logs`), never sends one.
 */
export const APP_LOGS_SETTING = "ASTRO_PORTAL_APP_LOGS";

export function appLogsAccepted(env = process.env) {
  if (spacesOpen(env)) return true;
  return (
    String(env[APP_LOGS_SETTING] || "")
      .trim()
      .toLowerCase() === "accept"
  );
}

export const appLogsNotAvailable = () =>
  v1Json(
    {
      error: {
        code: "not_available",
        message: "This service does not take the application's error logs.",
      },
    },
    { status: 404 },
  );

/**
 * The hourly purge of the application's logs past their 30 days
 * (`server/start.js`), whatever their source: the phones' (`mobile`), the
 * service's (`server`) and the browsers' (`client`). Logs; never throws,
 * unless `rethrow` (the service's task tracker records the failure).
 */
export async function purgeExpiredAppLogs({
  log,
  now = new Date(),
  rethrow = false,
} = {}) {
  try {
    const repository = await appLogRepository();
    const purged = (await repository?.purgeExpiredLogs({ now })) || 0;
    if (purged)
      log?.info?.(
        "app-logs.purged",
        `${purged} application log line(s) older than ${APPLICATION_LOG_RETENTION_DAYS} days purged.`,
      );
    return purged;
  } catch (error) {
    log?.warn?.(
      "app-logs.purged",
      `The application logs were not purged (${error.message}).`,
    );
    if (rethrow) throw error;
    return 0;
  }
}
