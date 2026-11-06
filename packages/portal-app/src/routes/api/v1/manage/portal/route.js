import { readJsonBody } from "portal/api/json-body.js";
import { webSessionV1Access } from "../../../../../lib/v1/access.js";
import {
  galleryOrigin,
  privateGalleryFailure,
  requirePrivateGalleryService,
} from "../../../../../lib/v1/private-gallery-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/manage/portal: the private gallery of the space of the web
 * session — its address (minted at the first read: the header's link
 * « Galerie privée » reads it), its mode, the public name and the gallery's
 * name, and the modes offered (`available` or `locked`, a mode absent when
 * neither). A web session only.
 */
export async function GET(request) {
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requirePrivateGalleryService();
    return v1Json(
      await service.settings({
        tenantId: access.tenantId,
        userId: access.userId,
        origin: await galleryOrigin(request.headers),
      }),
    );
  } catch (error) {
    return privateGalleryFailure(error);
  }
}

/**
 * PATCH /v1/manage/portal: exactly one of `{ mode }` (`none`, or `link` with
 * `confirmVerifiers: true`; a mode a composition adds is refused where it is
 * not offered), `{ publicName, portalName }`
 * (`422 name_forbidden` for a name holding a forbidden word) or
 * `{ regenerateToken: true }`. A web session with its CSRF token; the body
 * under the common ceiling of 1 MiB (`413 payload_too_large`).
 */
export async function PATCH(request) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  // The body is read under the common ceiling: past it, 413
  // `payload_too_large`; not JSON, 400.
  let changes;
  try {
    changes = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "The body is a JSON object.",
      status: 400,
    });
  }
  try {
    const service = await requirePrivateGalleryService();
    return v1Json(
      await service.update({
        tenantId: access.tenantId,
        userId: access.userId,
        changes,
        origin: await galleryOrigin(request.headers),
      }),
    );
  } catch (error) {
    return privateGalleryFailure(error);
  }
}
