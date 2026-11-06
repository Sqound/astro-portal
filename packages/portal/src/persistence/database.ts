import type { DatabaseDriver } from "./driver.js";
import { PostgresDriver } from "./postgres-driver.js";
import { SqliteDriver } from "./sqlite-driver.js";
import { startPostgresBridge } from "../api/change-bus.js";

export interface DatabaseConfiguration {
  databasePath?: string | null;
  databaseUrl?: string | null;
}

let sharedDriver: DatabaseDriver | null = null;
let sharedKey: string | null = null;

export function createDatabaseDriver({
  databasePath = null,
  databaseUrl = null,
}: DatabaseConfiguration = {}): DatabaseDriver {
  if (databaseUrl) return PostgresDriver.open(databaseUrl);
  if (databasePath) return SqliteDriver.open(databasePath);
  throw new Error(
    "ASTRO_PORTAL_DATABASE_URL or ASTRO_PORTAL_DATABASE_PATH is required.",
  );
}

/** Returns the single process-owned driver used by all repository factories. */
export function databaseDriver(
  env: Record<string, string | undefined> = process.env,
): DatabaseDriver {
  const configuration = {
    databasePath: env.ASTRO_PORTAL_DATABASE_PATH || null,
    databaseUrl: env.ASTRO_PORTAL_DATABASE_URL || null,
  };
  const key = configuration.databaseUrl
    ? `postgres:${configuration.databaseUrl}`
    : `sqlite:${configuration.databasePath || ""}`;
  if (!sharedDriver || sharedKey !== key) {
    if (sharedDriver)
      throw new Error("Database configuration cannot change during a process.");
    sharedDriver = createDatabaseDriver(configuration);
    sharedKey = key;
    // The reactive change bus relays writes between processes only under
    // PostgreSQL, and only by following this driver's own already-decided
    // dialect — never a guess re-derived from the URL's shape. SQLite is
    // mono-process, so the bridge is never started there.
    if (sharedDriver.dialect === "postgres" && configuration.databaseUrl) {
      void startPostgresBridge({
        databaseUrl: configuration.databaseUrl,
      });
    }
  }
  return sharedDriver;
}

export async function closeDatabaseDriver(): Promise<void> {
  if (sharedDriver) await sharedDriver.close();
  sharedDriver = null;
  sharedKey = null;
}
