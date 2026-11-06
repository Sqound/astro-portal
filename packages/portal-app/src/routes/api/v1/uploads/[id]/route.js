import { deviceOrSessionWriteV1Access } from "../../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../../lib/v1/upload-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

/** `GET /v1/uploads/{id}` (`api/uploads.md`): the resumable protocol's status query — `offset`, `byteSize`, `completed`, `expiresAt`. */
export async function GET(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const service = await requireUploadResourceService();
    const result = await service.getUploadStatus({
      tenantId: access.tenantId,
      uploadId: id,
    });
    return v1Json(result.body, { status: result.status });
  } catch (error) {
    return uploadResourceFailure(error);
  }
}

function parseNonNegativeInteger(value) {
  if (value === null) return null;
  if (!/^(0|[1-9][0-9]*)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * `PUT /v1/uploads/{id}` (`api/uploads.md`): one chunk of raw bytes, at the
 * exact offset the server last reported. `Upload-Offset` and
 * `Content-Length` are read here (the only place this route touches
 * headers); the package-level service only ever sees the parsed integers
 * and the raw byte stream, on the same framework-neutrality
 * `receiveUpload` already keeps.
 */
export async function PUT(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  const declaredOffset = parseNonNegativeInteger(
    request.headers.get("upload-offset"),
  );
  const declaredContentLength = parseNonNegativeInteger(
    request.headers.get("content-length"),
  );
  if (declaredOffset === null || declaredContentLength === null)
    return v1Error(
      Object.assign(
        new Error(
          "Upload-Offset and Content-Length headers, each a non-negative integer, are required.",
        ),
        { code: "invalid_request", status: 400 },
      ),
    );
  if (!request.body)
    return v1Error(
      Object.assign(new Error("A request body is required."), {
        code: "invalid_request",
        status: 400,
      }),
    );
  try {
    const { id } = await params;
    const service = await requireUploadResourceService();
    const result = await service.putUploadChunk({
      tenantId: access.tenantId,
      userId: access.userId,
      uploadId: id,
      declaredOffset,
      declaredContentLength,
      bodyChunks: request.body,
    });
    return v1Json(result.body, { status: result.status });
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
