import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  debriefFailure,
  requireDebriefService,
} from "../../../../../../lib/v1/debrief-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * POST /v1/plans/{planId}/debrief — the debriefing decision (api/v1.md,
 * "The debriefing decision"). A well-formed decision always answers `200`,
 * a first one and a replay alike; refusals are `400`/`404`/`409` per the error
 * codes of the sessions API in api/v1.md. Either credential; a cookie session
 * additionally carries the CSRF token, exactly like every other v1 write.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON debrief decision is required.",
      status: 400,
    });
  }
  try {
    const { planId } = await params;
    const result = await (
      await requireDebriefService()
    ).decide({
      tenantId: access.tenantId,
      userId: access.userId,
      planId,
      body,
      originDeviceId: access.deviceId,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result);
  } catch (error) {
    return debriefFailure(error);
  }
}
