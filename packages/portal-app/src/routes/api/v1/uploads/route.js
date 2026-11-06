import {
  captureCallerOf,
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../lib/v1/upload-resource-service.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

function isJsonContentType(value) {
  return /^application\/json/i.test(String(value || "").trim());
}

/**
 * `POST /v1/uploads` answers two request shapes on the one route (`api/
 * uploads.md`), told apart by Content-Type — never by a query parameter or
 * a second path, so a caller only ever needs the one URL this contract has
 * always advertised:
 *
 * - `multipart/form-data` — the original, non-resumable form: a
 *   `metadata` part then a `file` part, streamed and hashed incrementally.
 * - `application/json` — the resumable protocol's create step:
 *   declares the same metadata (sha256, byteSize, originalName, …) with no
 *   file bytes at all, and answers an upload session to `PUT` chunks at.
 *
 * Both share every capability/entitlement gate and both write through the
 * same content-addressed capture store; see `upload-resources.js`'s
 * `checkWriteGates`.
 */
export async function POST(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  const contentType = request.headers.get("content-type");
  try {
    const service = await requireUploadResourceService();

    if (isJsonContentType(contentType)) {
      let body;
      try {
        body = await readJsonBody(request);
      } catch (error) {
        return v1Error(error, {
          code: "invalid_request",
          message: "A JSON request body is required.",
          status: 400,
        });
      }
      const result = await service.createUpload({
        ...(body && typeof body === "object" ? body : {}),
        tenantId: access.tenantId,
        userId: access.userId,
        caller: captureCallerOf(access),
      });
      return v1Json(result.body, { status: result.status });
    }

    if (!request.body)
      return v1Error(
        Object.assign(new Error("A multipart request body is required."), {
          code: "invalid_request",
          status: 400,
        }),
      );
    const result = await service.receiveUpload({
      tenantId: access.tenantId,
      userId: access.userId,
      contentType,
      // A Web ReadableStream (the Node "nodejs" runtime's Request.body) is
      // itself async-iterable; the package-level service never imports a
      // Next.js/web-platform type, so this route is the only place that
      // touches it directly.
      bodyChunks: request.body,
      originClientInstanceId: clientInstanceIdFrom(request),
      caller: captureCallerOf(access),
    });
    return v1Json(result.body, { status: result.status });
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
