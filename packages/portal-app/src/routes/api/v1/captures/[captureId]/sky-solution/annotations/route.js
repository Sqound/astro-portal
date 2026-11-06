import { deviceOrSessionReadV1Access } from "../../../../../../../lib/v1/access.js";
import { v1Json } from "../../../../../../../lib/v1/response.js";
import {
  captureIdOf,
  requireSkySolutionService,
  skySolutionFailure,
} from "../../../../../../../lib/v1/sky-solution-service.js";

/**
 * GET /v1/captures/{id}/sky-solution/annotations: the sky annotations of an image of the owner's own capture —
 * `?imageId=` a variant, the main image otherwise; `?magnitude=` the
 * faintest star, 10 by default — as `GET /v1/gallery/{id}/annotations` draws
 * them (`{ image: { width, height }, annotations }`, in the pixels of the
 * copy the gallery serves), whether the capture is public or not and
 * whatever the owner's switch says: the phone's full-screen viewer shows the
 * owner his own sky. A device token or the web session; `404
 * sky_solution_not_found` while the image has none, `404 capture_not_found`
 * for another space's capture.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  const search = new URL(request.url).searchParams;
  try {
    return v1Json(
      await (
        await requireSkySolutionService()
      ).ownerAnnotations({
        tenantId: access.tenantId,
        captureId: await captureIdOf(params),
        imageId: search.get("imageId") || null,
        magnitude: search.get("magnitude"),
      }),
    );
  } catch (error) {
    return skySolutionFailure(error);
  }
}
