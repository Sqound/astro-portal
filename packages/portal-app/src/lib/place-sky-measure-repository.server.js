import { createPlaceSkyMeasureRepository } from "portal/persistence/place-sky-measure-repository.js";
import { databaseDriver } from "portal/persistence/database.js";

let sharedRepository = null;
let configurationKey = null;

/**
 * The store of the measured sky background on the process-owned
 * database driver, or `null` without a database.
 */
export async function placeSkyMeasureRepository() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedRepository && configurationKey !== nextKey)
    throw new Error(
      "Sky measure database configuration cannot change during a process.",
    );
  if (sharedRepository) return sharedRepository;
  sharedRepository = await createPlaceSkyMeasureRepository({
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  });
  configurationKey = nextKey;
  return sharedRepository;
}
