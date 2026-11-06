import { createPublicGalleryService } from "portal/captures/public-gallery.js";
import { databaseDriver } from "portal/persistence/database.js";
import { loadPlannerSkyQuality } from "portal/planner/sky-quality.server.js";
import { v1Error, v1Json } from "./response.js";

// The public gallery of the home page, on the process-owned persistence
// driver. The sky quality of a capture's place is the planner's own
// estimate (the installed raster; none installed: no estimate), read on the
// server and never sent with the place.
let shared = null;

export async function requirePublicGalleryService() {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    throw Object.assign(new Error("The gallery is unavailable."), {
      code: "gallery_unavailable",
      status: 503,
    });
  if (!shared)
    shared = createPublicGalleryService({
      driver: databaseDriver(),
      skyQuality: (place) => loadPlannerSkyQuality(place),
    });
  return await shared;
}

/**
 * The one answer of an identifier that is not a public capture — private,
 * unknown, removed, refused, of a closed space, unfinished: the same code,
 * the same body, so that nothing tells them apart.
 */
export const galleryNotFound = () =>
  v1Json(
    { error: { code: "capture_not_found", message: "Capture not found." } },
    { status: 404 },
  );

export function galleryFailure(error) {
  if (error?.code === "gallery_unavailable") return v1Error(error);
  return v1Error(error, {
    code: "gallery_unavailable",
    message: "The gallery is unavailable.",
    status: 503,
  });
}
