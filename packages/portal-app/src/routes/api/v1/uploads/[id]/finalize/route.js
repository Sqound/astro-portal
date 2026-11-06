import {
  captureCallerOf,
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../../../lib/v1/upload-resource-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/**
 * `POST /v1/uploads/{id}/finalize` (`api/uploads.md`): verifies the
 * assembled part file's digest, then passes through the exact same
 * capability/entitlement gates and capture creation the non-resumable
 * `POST /v1/uploads` always has. Idempotent — replaying it after success
 * answers the same `completed: true` result.
 */
export async function POST(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const service = await requireUploadResourceService();
    const result = await service.finalizeUpload({
      tenantId: access.tenantId,
      userId: access.userId,
      uploadId: id,
      originClientInstanceId: clientInstanceIdFrom(request),
      caller: captureCallerOf(access),
    });
    return v1Json(result.body, { status: result.status });
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
