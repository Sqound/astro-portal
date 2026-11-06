import { readJsonBody } from "portal/api/json-body.js";
import {
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../../lib/v1/upload-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/targets/personal: the personal targets of the space, newest
 * first, with their place, date and note (the owner's). A device token
 * or the web session.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requireUploadResourceService();
    return v1Json(
      await service.listPersonalTargets({ tenantId: access.tenantId }),
    );
  } catch (error) {
    return uploadResourceFailure(error);
  }
}

/**
 * POST /v1/targets/personal: a
 * « cible personnelle » of the space, in the target library — `name` (80
 * characters at most), `label` (a generic tag of the public gallery),
 * optional `raHours` and `decDegrees`, `placeName`, `date` and `note` (1 000
 * characters at most). A capture names it among its `targetIds` like a
 * catalogue target; another space's is `target_not_found`. A device token or
 * the web session (with its CSRF token). `201 { target }`.
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
      message: "The body is a JSON object.",
      status: 400,
    });
  }
  try {
    const service = await requireUploadResourceService();
    return v1Json(
      await service.createPersonalTarget({
        ...(body && typeof body === "object" && !Array.isArray(body)
          ? body
          : { body }),
        tenantId: access.tenantId,
        userId: access.userId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
