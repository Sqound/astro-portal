import { captureStore } from "portal/uploads/capture-store.js";
import {
  USER_FILE_SECURITY_HEADERS,
  attachmentDisposition,
  userFileHeaders,
} from "portal/uploads/media-type.js";
import { capturedFileResponse } from "../../../../../../../lib/media.server.js";
import { webSessionV1Access } from "../../../../../../../lib/v1/access.js";
import {
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../../lib/v1/owner-capture-service.js";
import { v1Error } from "../../../../../../../lib/v1/response.js";

function notFound() {
  const response = v1Error(null, {
    code: "capture_not_found",
    message: "Capture not found.",
    status: 404,
  });
  for (const [name, value] of Object.entries(USER_FILE_SECURITY_HEADERS))
    response.headers.set(name, value);
  return response;
}

/**
 * GET /v1/manage/captures/{id}/media: the bytes of a capture of the space
 * of the web session, for its owner alone, served as a person's file is
 * everywhere: its type from its bytes, a raster
 * image shown, anything else an attachment, `nosniff` and the sandboxing
 * policy. Never kept by any cache (`private, no-store`). Another space's
 * capture: 404; a device token: refused by the web session's access.
 *
 * `?download=1`: the owner's download
 * of the original — the same bytes as an attachment under the name it was
 * sent with (`Content-Disposition: attachment; filename*=UTF-8''…`), a TIFF
 * included: the owner reads their own file, signed in, from a browser, so
 * the old refusal of a TIFF asked from the Internet is gone from this
 * route. One byte range is served (`Range`), so a long download resumes.
 * The galleries never serve the original (their routes serve `shared.jpg`).
 *
 * `?variant=thumbnail` serves the capture's thumbnail instead — WebP,
 * reduced, without metadata, written after the upload — and answers 404
 * while the capture has none (a file that cannot have one, or one not
 * processed yet).
 *
 * `?variant=preview` serves the copy without location a gallery serves —
 * JPEG, 4096 px at most, written at the first need — which the owner's
 * detail draws over the thumbnail; 404 for a file that cannot have one (a
 * FITS file keeps its thumbnail).
 */
export async function GET(request, { params }) {
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  let captureId = "";
  try {
    captureId = decodeURIComponent((await params)?.captureId || "");
  } catch {
    return notFound();
  }
  const search = new URL(request.url).searchParams;
  const requested = search.get("variant");
  const variant =
    requested === "thumbnail" || requested === "preview"
      ? requested
      : "original";
  const download = variant === "original" && search.get("download") === "1";
  // One image of the capture (`?imageId=`), its main one otherwise.
  const imageId = search.get("imageId") || null;
  let media;
  try {
    media = await (
      await requireOwnerCaptureService()
    ).media({ tenantId: access.tenantId, captureId, variant, imageId });
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
  if (download)
    headers["Content-Disposition"] = attachmentDisposition(media.originalName);
  return capturedFileResponse(reference, headers, request);
}
