import { USER_FILE_SECURITY_HEADERS } from "portal/uploads/media-type.js";
import {
  galleryViewer,
  requirePrivateGalleryService,
} from "../../../../../../../lib/v1/private-gallery-service.js";
import { v1Json } from "../../../../../../../lib/v1/response.js";
import { requireSkySolutionService } from "../../../../../../../lib/v1/sky-solution-service.js";

const NEVER_INDEXED = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return v1Json(
    { error: { code: "gallery_not_found", message: "Not found." } },
    {
      status: 404,
      headers: {
        ...NEVER_INDEXED,
        "Cache-Control": "private, no-store",
        ...USER_FILE_SECURITY_HEADERS,
      },
    },
  );
}

const decoded = (value) => {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return null;
  }
};

/**
 * GET /v1/portals/{portalToken}/annotations/{captureId}: the sky annotations of the image a visitor of a private
 * gallery sees — the main image, or a variant the gallery shows (`?imageId=`)
 * — drawn by the portal alone from the image's sky solution
 * (`{ image: { width, height }, annotations }`, the list `PlateOverlay`
 * reads; `?magnitude=` the faintest star), behind the gallery's one gate
 * (`resolveGalleryAccess`, the pages' own and the media route's): the capture
 * may be private, so the public gallery's route is no way in. Anything the
 * gate refuses, a capture or an image the gallery does not show, an image
 * without a solution or the owner's switch off: one `404`, like the media
 * route, `X-Robots-Tag: noindex`, no referrer,
 * `Cache-Control: private, no-store`.
 */
export async function GET(request, { params }) {
  const values = await params;
  const token = decoded(values?.portalToken);
  const captureId = decoded(values?.captureId);
  if (!token || !captureId) return notFound();
  const search = new URL(request.url).searchParams;
  let found = null;
  try {
    const shown = await (
      await requirePrivateGalleryService()
    ).shownImage({
      token,
      captureId,
      viewer: await galleryViewer(request.headers),
      imageId: search.get("imageId") || null,
    });
    if (shown)
      found = await (
        await requireSkySolutionService()
      ).privateGalleryAnnotations({
        ...shown,
        magnitude: search.get("magnitude"),
      });
  } catch {
    found = null;
  }
  if (!found) return notFound();
  return v1Json(found, {
    headers: {
      ...NEVER_INDEXED,
      "Cache-Control": "private, no-store",
    },
  });
}
