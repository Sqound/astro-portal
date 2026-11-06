import { ensureTargetCatalogue } from "./target-library.server.js";
import { createTargetFavoriteRepository } from "portal/persistence/target-favorite-repository.js";
import { databaseDriver } from "portal/persistence/database.js";

let sharedRepository = null;
let configurationKey = null;

export async function targetFavoriteRepository() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return null;
  await ensureTargetCatalogue();
  const nextKey = databaseUrl
    ? `postgres:${databaseUrl}`
    : `sqlite:${databasePath}`;
  if (sharedRepository && configurationKey !== nextKey)
    throw new Error(
      "Favorite database configuration cannot change during a process.",
    );
  if (sharedRepository) return sharedRepository;
  sharedRepository = await createTargetFavoriteRepository({
    databasePath,
    databaseUrl,
    driver: databaseDriver({
      ASTRO_PORTAL_DATABASE_PATH: databasePath,
      ASTRO_PORTAL_DATABASE_URL: databaseUrl,
    }),
    dialect: databaseUrl ? "postgres" : "sqlite",
  });
  configurationKey = nextKey;
  return sharedRepository;
}
