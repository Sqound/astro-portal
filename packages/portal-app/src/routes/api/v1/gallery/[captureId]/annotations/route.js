import {
  galleryNotFound,
  galleryFailure,
} from "../../../../../../lib/v1/public-gallery-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import {
  captureIdOf,
  requireSkySolutionService,
} from "../../../../../../lib/v1/sky-solution-service.js";

/**
 * GET /v1/gallery/{captureId}/annotations: the sky annotations of the image a
 * visitor sees — the main image, or a public variant (`?imageId=`) —
 * drawn by the portal alone from the image's sky solution, its target
 * catalogue and the HYG stars, in the pixels of the copy the gallery serves
 * (`{ image: { width, height }, annotations }`, the list `PlateOverlay`
 * reads; `?magnitude=` the faintest star, 10 by default). Open to anyone,
 * like the gallery; the same 404 as the gallery's whenever the capture is
 * not public, the image not shown, the image without a solution, or the
 * owner's switch off.
 */
export async function GET(request, { params }) {
  const captureId = await captureIdOf(params);
  if (!captureId) return galleryNotFound();
  const search = new URL(request.url).searchParams;
  try {
    const found = await (
      await requireSkySolutionService()
    ).galleryAnnotations({
      captureId,
      imageId: search.get("imageId") || null,
      magnitude: search.get("magnitude"),
    });
    return found ? v1Json(found) : galleryNotFound();
  } catch (error) {
    return galleryFailure(error);
  }
}
