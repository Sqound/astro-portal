import {
  GALLERY_JSON_HEADERS,
  galleryViewer,
  privateGalleryFailure,
  requirePrivateGalleryService,
} from "../../../../../lib/v1/private-gallery-service.js";
import { enabledServiceExtension } from "../../../../../lib/service-extensions.js";
import { v1Json } from "../../../../../lib/v1/response.js";
import { requestedLocale } from "../../../../../lib/v1/targets-query.js";

const NOT_FOUND = {
  code: "gallery_not_found",
  message: "Gallery not found.",
  status: 404,
};

/**
 * GET /v1/portals/{portalToken}: the private gallery as its viewer reads it — its
 * name, the owner's public name, every capture it shows, newest first, and the tags
 * of its filter bar — behind the gallery's one gate (`resolveGalleryAccess`): the
 * composition's own refusals (`401` signed out, `403` signed in and not admitted),
 * `404` for anything else it refuses. A web session or none; never indexed, never cached.
 */
export async function GET(request, { params }) {
  let token = "";
  try {
    token = decodeURIComponent((await params)?.portalToken || "");
  } catch {
    token = "";
  }
  try {
    const service = await requirePrivateGalleryService();
    const { access, view } = await service.gallery({
      token,
      viewer: await galleryViewer(request.headers),
      locale: requestedLocale(new URL(request.url)),
    });
    if (access.outcome !== "open") {
      // The refusals of a composition's own gates, else « not found ».
      const refusal =
        enabledServiceExtension("gallery.audience")?.refusal(access.outcome) ??
        NOT_FOUND;
      return v1Json(
        { error: { code: refusal.code, message: refusal.message } },
        { status: refusal.status, headers: GALLERY_JSON_HEADERS },
      );
    }
    return v1Json(
      {
        gallery: {
          portalName: view.portalName,
          publicName: view.publicName,
          captures: view.captures,
          // The filter bar's tags: the generic ones and the owner's own, shown
          // here only.
          tags: view.tags,
          ownTags: view.ownTags,
        },
      },
      { headers: GALLERY_JSON_HEADERS },
    );
  } catch (error) {
    return privateGalleryFailure(error, GALLERY_JSON_HEADERS);
  }
}
