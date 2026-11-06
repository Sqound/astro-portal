import {
  galleryFailure,
  galleryNotFound,
  requirePublicGalleryService,
} from "../../../../../lib/v1/public-gallery-service.js";
import { requestedLocale } from "../../../../../lib/v1/targets-query.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/gallery/{captureId}: one public capture, as its detail page
 * draws it (`gallery.schema.json`, `#/$defs/capture`). Any identifier that
 * is not a public capture answers the same 404.
 */
export async function GET(request, { params }) {
  let captureId = "";
  try {
    captureId = decodeURIComponent((await params)?.captureId || "");
  } catch {
    return galleryNotFound();
  }
  try {
    const capture = await (
      await requirePublicGalleryService()
    ).get({ captureId, locale: requestedLocale(new URL(request.url)) });
    return capture ? v1Json(capture) : galleryNotFound();
  } catch (error) {
    return galleryFailure(error);
  }
}
