import { createCaptureSkySolutionService } from "portal/captures/capture-sky-solutions.js";
import { SkySolutionError } from "portal/captures/sky-solution.js";
import { databaseDriver } from "portal/persistence/database.js";
import { createHygStarsSource } from "portal/sky-annotations/hyg-stars-source.js";
import { recordBackendLog } from "../app-log.server.js";
import { hygCatalog } from "../config.server.js";
import { v1Error } from "./response.js";

// The sky solutions of the captures, on the process-owned persistence driver.
// The stars the annotations name are those of the HYG catalogue the server has
// installed (`ASTRO_PORTAL_HYG_CATALOG`; the start of the service fetches it
// when it is missing: `server/start.js`). Read once it was read; while the
// file is missing the answers say `starsAvailable: false`, one line of the log
// says so, and nothing empty is kept: the file is looked for again.
let shared = null;
const installedStars = createHygStarsSource({
  path: hygCatalog,
  log: recordBackendLog,
});

export async function requireSkySolutionService() {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    throw new SkySolutionError(
      "capture_storage_unavailable",
      "Capture storage is unavailable.",
      503,
    );
  if (!shared)
    shared = createCaptureSkySolutionService({
      driver: databaseDriver(),
      stars: installedStars,
    });
  return await shared;
}

/** The v1 error envelope of a refusal of the sky solutions. */
export function skySolutionFailure(error) {
  if (error instanceof SkySolutionError) return v1Error(error);
  return v1Error(error, {
    code: "capture_storage_unavailable",
    message: "Capture storage is unavailable.",
    status: 503,
  });
}

/** The capture id of a route's parameters, `""` when it cannot be decoded. */
export async function captureIdOf(params) {
  try {
    return decodeURIComponent((await params)?.captureId || "");
  } catch {
    return "";
  }
}
