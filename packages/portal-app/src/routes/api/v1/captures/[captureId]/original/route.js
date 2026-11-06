import { packFileResponse } from "portal/offline-pack/file-response.js";
import { captureStore } from "portal/uploads/capture-store.js";
import {
  USER_FILE_SECURITY_HEADERS,
  attachmentDisposition,
  userFileHeaders,
} from "portal/uploads/media-type.js";
import { deviceV1Access } from "../../../../../../lib/v1/access.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import {
  captureIdOf,
  requireSkySolutionService,
  skySolutionFailure,
} from "../../../../../../lib/v1/sky-solution-service.js";

function withSecurityHeaders(response) {
  for (const [name, value] of Object.entries(USER_FILE_SECURITY_HEADERS))
    response.headers.set(name, value);
  return response;
}

/**
 * GET /v1/captures/{id}/original: the original of an image of a capture, for Astro Sync to solve it
 * on the person's computer — the captures sent from the phone and the web
 * included. A device token of the capture's space only: another space's
 * capture is 404, a request without a device token 401 (a visitor, a web
 * session: the owner downloads from « Mon espace », the media route). The
 * main image by default, `?imageId=` a variant. `Range` is honoured (one
 * range, `206`/`416`; `If-Range` on the ETag, the image's digest), so an
 * interrupted download resumes. The headers name the image: `ETag` and
 * `X-Astro-Image-Sha256` its SHA-256, `X-Astro-Image-Id` its id,
 * `X-Astro-Original-Name` the name it was sent with (percent-encoded UTF-8),
 * `Content-Disposition` an attachment of that name. Never kept by a cache.
 * The bytes are read from the capture store (whatever the store it lives in), the
 * range included, like the owner's download.
 */
export async function GET(request, { params }) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  let original;
  try {
    original = await (
      await requireSkySolutionService()
    ).original({
      tenantId: access.tenantId,
      captureId: await captureIdOf(params),
      imageId: new URL(request.url).searchParams.get("imageId") || null,
    });
  } catch (error) {
    return withSecurityHeaders(skySolutionFailure(error));
  }
  const store = captureStore();
  const { reference } = original;
  let size;
  let head;
  try {
    const info = await store.stat(reference);
    if (!info) throw new Error("not stored");
    size = info.size;
    head = await store.head(reference);
    if (!head) throw new Error("not stored");
  } catch {
    return withSecurityHeaders(
      v1Error(null, {
        code: "original_not_found",
        message: "The original of this image is not stored.",
        status: 404,
      }),
    );
  }
  const typed = userFileHeaders({ head, fileName: original.originalName });
  const response = packFileResponse(request, {
    body: {
      size,
      open: async (start, end) => {
        const read = await store.read(reference, { start, end });
        if (!read) throw new Error("The original is no longer stored.");
        return read.stream;
      },
    },
    etag: `"${original.sha256}"`,
    contentType: typed["Content-Type"],
    cacheControl: "private, no-store",
  });
  response.headers.set(
    "Content-Disposition",
    attachmentDisposition(original.originalName),
  );
  response.headers.set("X-Astro-Image-Sha256", original.sha256);
  response.headers.set("X-Astro-Image-Id", original.imageId);
  response.headers.set(
    "X-Astro-Original-Name",
    encodeURIComponent(original.originalName),
  );
  return withSecurityHeaders(response);
}
