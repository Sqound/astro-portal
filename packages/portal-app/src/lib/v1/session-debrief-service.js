import { createSessionDebriefService } from "portal/api/session-debrief.js";
import { databaseDriver } from "portal/persistence/database.js";

// What GET /v1/sessions/{id} adds for the summary of a night
// (`portal/api/session-debrief.js`), on the process-owned driver every other v1
// service shares — the pattern of `session-analysis-resource-service.js`.
let sharedService = null;
let configurationKey = null;

export async function sessionDebriefService() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedService && configurationKey !== nextKey)
    throw new Error(
      "Session debrief database configuration cannot change during a process.",
    );
  if (sharedService) return sharedService;
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  sharedService = await createSessionDebriefService({
    driver,
    dialect: databaseUrl ? "postgres" : "sqlite",
  });
  configurationKey = nextKey;
  return sharedService;
}

/**
 * The summary fields of one session, or `{}` when the storage cannot give
 * them: a session's detail never fails over its summary.
 */
export async function sessionDebriefFields({ tenantId, userId, sessionId }) {
  try {
    const service = await sessionDebriefService();
    if (!service) return {};
    return (await service.read({ tenantId, userId, sessionId })) || {};
  } catch {
    return {};
  }
}

/**
 * The input of the summary of a session's night, trimmed to what the browser
 * needs to compute the summary again as the person corrects the targets, or
 * `null` when the storage cannot give it.
 */
export async function sessionSummaryInput({ tenantId, userId, sessionId }) {
  try {
    const service = await sessionDebriefService();
    if (!service) return null;
    const input = await service.summaryInput({ tenantId, userId, sessionId });
    if (!input) return null;
    return {
      ...input,
      events: input.events.map(
        ({ eventId, type, recordedAt, timing, payload }) => ({
          eventId,
          type,
          recordedAt,
          ...(timing ? { timing } : {}),
          payload,
        }),
      ),
    };
  } catch {
    return null;
  }
}
