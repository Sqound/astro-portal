import { registerCalibrationRefresher } from "portal/calibration/refresh-hook.js";
import { createCalibrationContributionRepository } from "portal/persistence/calibration-contribution-repository.js";
import { databaseDriver } from "portal/persistence/database.js";
import { loadSkyQualityRaster } from "portal/planner/sky-quality.server.js";
import { hostedSignInMode } from "./auth.server.js";

let sharedRepository = null;
let configurationKey = null;

/**
 * The store of the project's calibration set on the process-owned database
 * driver, reading the installed sky-quality raster, or `null` without a
 * database.
 */
export async function calibrationContributionRepository() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedRepository && configurationKey !== nextKey)
    throw new Error(
      "Calibration database configuration cannot change during a process.",
    );
  if (sharedRepository) return sharedRepository;
  sharedRepository = await createCalibrationContributionRepository({
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
    skyQualityGrid: async () => (await loadSkyQualityRaster())?.grid ?? null,
  });
  configurationKey = nextKey;
  return sharedRepository;
}

/**
 * Whether this service offers the calibration set: only where spaces are
 * open (sign-in by e-mail, where any address gets a space). A private server
 * offers no consent and never contributes.
 */
export const calibrationAvailable = (env = process.env) =>
  Boolean(hostedSignInMode(env));

/**
 * Registers the refresher the writes of sky values call
 * (`portal/calibration/refresh-hook.js`). It does nothing on a service that
 * does not offer the set.
 */
export function registerHostedCalibrationRefresher() {
  registerCalibrationRefresher(async (tenantId) => {
    if (!calibrationAvailable()) return;
    const repository = await calibrationContributionRepository();
    await repository?.refresh(tenantId);
  });
}
