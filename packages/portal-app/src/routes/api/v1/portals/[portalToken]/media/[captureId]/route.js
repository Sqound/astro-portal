import { captureStore } from "portal/uploads/capture-store.js";
import {
  USER_FILE_SECURITY_HEADERS,
  userFileHeaders,
} from "portal/uploads/media-type.js";
import {
  capturedFileResponse,
  isExternalRequest,
  isTiff,
} from "../../../../../../../lib/media.server.js";
import {
  galleryViewer,
  requirePrivateGalleryService,
} from "../../../../../../../lib/v1/private-gallery-service.js";
import { v1Json } from "../../../../../../../lib/v1/response.js";

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
 * GET /v1/portals/{portalToken}/media/{captureId}: the file of one capture
 * of a private gallery, behind the gallery's one gate
 * (`resolveGalleryAccess`, the pages' own) — only a file without metadata (the
 * shared copy), **never the original**: `?variant=thumbnail` its thumbnail,
 * otherwise its shared copy (written at the first need), or its thumbnail
 * when the file cannot have one. Its type from its bytes, a person's file
 * served as everywhere (`USER_FILE_SECURITY_HEADERS`), a TIFF refused from
 * outside the local network, `X-Robots-Tag: noindex`, no referrer,
 * `Cache-Control: private, no-store`. Anything the gate refuses, a capture
 * the gallery does not show or one without such a file: one `404`.
 */
export async function GET(request, { params }) {
  const values = await params;
  const token = decoded(values?.portalToken);
  const captureId = decoded(values?.captureId);
  if (!token || !captureId) return notFound();
  const search = new URL(request.url).searchParams;
  const variant = search.get("variant") === "thumbnail" ? "thumbnail" : "image";
  let media = null;
  try {
    media = await (
      await requirePrivateGalleryService()
    ).media({
      token,
      captureId,
      viewer: await galleryViewer(request.headers),
      variant,
      // An alternative image the gallery shows.
      imageId: search.get("imageId") || null,
    });
  } catch {
    media = null;
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
    fileName: media.name,
    imageCacheControl: "private, no-store",
    attachmentCacheControl: "private, no-store",
  });
  if (
    isExternalRequest(request) &&
    (isTiff(media.name) || headers["Content-Type"] === "image/tiff")
  )
    return new Response("Les TIFF sont réservés au réseau local.", {
      status: 403,
      headers: {
        "Cache-Control": "no-store",
        ...NEVER_INDEXED,
        ...USER_FILE_SECURITY_HEADERS,
      },
    });
  return capturedFileResponse(
    reference,
    { ...headers, ...NEVER_INDEXED },
    request,
  );
}
