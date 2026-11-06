import { captureOrphanReport } from "portal/captures/orphans.js";
import { databaseDriver } from "portal/persistence/database.js";
import { captureStore } from "portal/uploads/capture-store.js";

/**
 * The report of the orphans of the capture store (`portal/captures/
 * orphans.js`) for the administration: the files with no row and the rows
 * with no file, by space, on this process's driver and store. Read only —
 * deleting the orphans is `scripts/captures-orphans.mjs --apply`. `null`
 * when this process has no database. A store that cannot list its files
 * throws a `CaptureOrphanError` (`listing_unsupported`).
 */
export async function captureOrphans(options = {}) {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    return null;
  return await captureOrphanReport({
    db: databaseDriver(),
    files: captureStore(),
    ...options,
  });
}
