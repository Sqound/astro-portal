import { ensureTargetCatalogue } from "../target-library.server.js";
import { createJournalService } from "portal/api/journal.js";
import { createSessionReworkService } from "portal/api/session-rework.js";
import { databaseDriver } from "portal/persistence/database.js";
import { portalConfig } from "../config.server.js";
import { enabledServiceExtension } from "../service-extensions.js";
import { observationNights } from "../sessions.server.js";
import { v1Error, v1Json } from "./response.js";

// The Journal: the list of the sessions of a space and
// the rework of one of them, on the process-owned driver every other v1
// service shares, on the pattern of `observation-session-service.js`.
// **Neither asks an entitlement provider**: the list is a read never held by a
// right, and the rework is free (the general `entitlement_read_only` window is
// not applied to it: correcting one's own journal is never refused).

let shared = null;

function key() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  return {
    id: databaseUrl ? `postgres:${databaseUrl}` : `sqlite:${databasePath}`,
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  };
}

async function services() {
  const configuration = key();
  if (!configuration) return null;
  await ensureTargetCatalogue();
  if (shared && shared.id === configuration.id) return shared.services;
  if (shared)
    throw new Error(
      "Journal database configuration cannot change during a process.",
    );
  const { driver, dialect } = configuration;
  const created = {
    journal: await createJournalService({ driver, dialect }),
    rework: await createSessionReworkService({ driver, dialect }),
  };
  shared = { id: configuration.id, services: created };
  return created;
}

async function required() {
  const created = await services();
  if (created) return created;
  throw Object.assign(new Error("Session storage is unavailable."), {
    code: "observation_session_storage_unavailable",
    status: 503,
  });
}

export async function requireJournalService() {
  return (await required()).journal;
}

export async function requireSessionReworkService() {
  return (await required()).rework;
}

/**
 * The nights of the operator's catalogue, on a **private server** only (where
 * a composition registers an entitlement provider, the catalogue is the
 * gallery's and no one's journal).
 */
export async function catalogueNightsOfPrivateServer() {
  if (enabledServiceExtension("entitlements.provider")) return [];
  try {
    const configuration = await portalConfig();
    return await observationNights({
      canDownload: false,
      locale: configuration.defaultLocale,
      applicationDefault: configuration.defaultLocale,
      includeQuality: false,
    });
  } catch {
    return [];
  }
}

/** Preserves the services' contractual error body, including 404/409 details. */
export function journalFailure(error) {
  if (error?.body && Number.isInteger(error?.status))
    return v1Json(error.body, { status: error.status });
  return v1Error(error, {
    code: "observation_session_storage_unavailable",
    message: "Session storage is unavailable.",
    status: 503,
  });
}
