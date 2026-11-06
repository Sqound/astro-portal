import { captureStore } from "portal/uploads/capture-store.js";
import {
  USER_FILE_SECURITY_HEADERS,
  userFileHeaders,
} from "portal/uploads/media-type.js";
import { capturedFileResponse } from "../../../../../../lib/media.server.js";
import {
  galleryFailure,
  galleryNotFound,
  requirePublicGalleryService,
} from "../../../../../../lib/v1/public-gallery-service.js";

function notFound() {
  const response = galleryNotFound();
  for (const [name, value] of Object.entries(USER_FILE_SECURITY_HEADERS))
    response.headers.set(name, value);
  return response;
}

/**
 * GET /v1/gallery/{captureId}/media: the published file of a public capture
 * — the shared copy, without EXIF, XMP or IPTC (so without position),
 * 4096 px at most — never the original bytes; `?variant=thumbnail` its
 * thumbnail (the shared copy while it has none). Served as a person's
 * file is everywhere: its type from its bytes, `nosniff`, the sandboxing
 * policy; `no-cache`, so that a capture made private again stops being
 * served at once. Any identifier that is not a public capture answers the
 * same 404.
 */
export async function GET(request, { params }) {
  let captureId = "";
  try {
    captureId = decodeURIComponent((await params)?.captureId || "");
  } catch {
    return notFound();
  }
  const search = new URL(request.url).searchParams;
  const variant = search.get("variant") === "thumbnail" ? "thumbnail" : "image";
  let media;
  try {
    media = await (
      await requirePublicGalleryService()
    ).media({
      captureId,
      variant,
      // An alternative image its owner made public.
      imageId: search.get("imageId") || null,
    });
  } catch (error) {
    return galleryFailure(error);
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
  return capturedFileResponse(
    reference,
    userFileHeaders({
      head,
      fileName:
        media.variant === "thumbnail" ? "thumbnail.webp" : "capture.jpg",
      imageCacheControl: "no-cache",
      attachmentCacheControl: "no-store",
    }),
    request,
  );
}
