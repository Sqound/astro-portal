import { captureStore } from "portal/uploads/capture-store.js";
import {
  USER_FILE_SECURITY_HEADERS,
  userFileHeaders,
} from "portal/uploads/media-type.js";
import {
  capturedFileResponse,
  isExternalRequest,
  isTiff,
} from "../../../../../../lib/media.server.js";
import { deviceOrSessionReadV1Access } from "../../../../../../lib/v1/access.js";
import {
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../lib/v1/owner-capture-service.js";
import { v1Error } from "../../../../../../lib/v1/response.js";

function withSecurityHeaders(response) {
  for (const [name, value] of Object.entries(USER_FILE_SECURITY_HEADERS))
    response.headers.set(name, value);
  return response;
}

const notFound = () =>
  withSecurityHeaders(
    v1Error(null, {
      code: "capture_not_found",
      message: "Capture not found.",
      status: 404,
    }),
  );

/**
 * GET /v1/captures/{id}/media: the files of a capture of the space for its
 * owner's devices and web session. `?variant=thumbnail` its thumbnail (WebP,
 * reduced, without metadata; 404 while it has none), `?variant=preview` its
 * copy without location (JPEG, 4096 px at most, no EXIF, XMP nor IPTC): both
 * to a device token or the web session. Without `variant`, the original —
 * the web session only on this route (`403 web_session_required` to a
 * device). `?imageId=` names one image of the capture, its main one
 * otherwise. Another space's capture: 404. Never kept by a cache (`private,
 * no-store`).
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  let captureId = "";
  try {
    captureId = decodeURIComponent((await params)?.captureId || "");
  } catch {
    return notFound();
  }
  const search = new URL(request.url).searchParams;
  const asked = search.get("variant");
  const variant =
    asked === "thumbnail" || asked === "preview" ? asked : "original";
  if (variant === "original" && access.device)
    return withSecurityHeaders(
      v1Error(null, {
        code: "web_session_required",
        message: "The original of a capture is served to the web session only.",
        status: 403,
      }),
    );
  let media;
  try {
    media = await (
      await requireOwnerCaptureService()
    ).media({
      tenantId: access.tenantId,
      captureId,
      variant,
      imageId: search.get("imageId") || null,
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
  if (!media) return notFound();
  const reference = {
    tenantId: media.tenantId,
    sha256: media.sha256,
    file: media.file,
  };
  let head;
  try {
    head = await captureStore().head(reference);
  } catch {
    head = null;
  }
  if (!head) return notFound();
  const headers = userFileHeaders({
    head,
    fileName: media.originalName,
    imageCacheControl: "private, no-store",
    attachmentCacheControl: "private, no-store",
  });
  if (
    variant === "original" &&
    isExternalRequest(request) &&
    (isTiff(media.originalName) || headers["Content-Type"] === "image/tiff")
  )
    return new Response("Les TIFF sont réservés au réseau local.", {
      status: 403,
      headers: { "Cache-Control": "no-store", ...USER_FILE_SECURITY_HEADERS },
    });
  return capturedFileResponse(reference, headers, request);
}
