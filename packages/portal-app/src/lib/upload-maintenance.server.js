import { createUploadResourceService } from "portal/api/upload-resources.js";
import { databaseDriver } from "portal/persistence/database.js";

/**
 * The startup sweep of abandoned resumable uploads:
 * every upload session past its 72-hour expiry loses its row and the bytes
 * it held. The upload service then sweeps along its own requests, at most
 * once an hour (`ASTRO_PORTAL_UPLOAD_PURGE_INTERVAL_MS`): no timer, so an
 * idle service can sleep and a stopping one exits at once. A sleeping
 * service that wakes up starts here again. Resolves to the number of
 * uploads purged; never rejects.
 */
export async function purgeExpiredUploadsAtStartup() {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return 0;
  try {
    const service = await createUploadResourceService({
      driver: databaseDriver({
        ASTRO_PORTAL_DATABASE_PATH: databasePath,
        ASTRO_PORTAL_DATABASE_URL: databaseUrl,
      }),
      dialect: databaseUrl ? "postgres" : "sqlite",
    });
    return await service.purgeExpiredUploads();
  } catch {
    return 0;
  }
}
