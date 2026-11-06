import { readJsonBody } from "portal/api/json-body.js";
import {
  captureCallerOf,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../../lib/v1/upload-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

/**
 * POST /v1/uploads/check (`api/uploads.md`): what an upload of these bytes
 * would meet, before a single byte is sent — the SHA-256 compared with
 * every image of the space (`present`), then the limits of the profile
 * (`accepted`, or `refused` with its code and its numbers). The body is an
 * upload's declared metadata (`sha256`, `byteSize`, `originalName`, the
 * optional `captureId`, `targetId`, `targetIds`, `sessionId`, `planId`,
 * `source`). A device token or the web session (with its CSRF token, as
 * for the upload). Nothing is written.
 */
export async function POST(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
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
  try {
    const service = await requireUploadResourceService();
    return v1Json(
      await service.checkUpload({
        ...(body && typeof body === "object" && !Array.isArray(body)
          ? body
          : {}),
        tenantId: access.tenantId,
        userId: access.userId,
        caller: captureCallerOf(access),
      }),
    );
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
