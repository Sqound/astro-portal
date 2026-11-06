import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../../lib/v1/access.js";
import {
  nightFailure,
  requireNightService,
} from "../../../../../../../lib/v1/night-service.js";
import { v1Error, v1Json } from "../../../../../../../lib/v1/response.js";
import { syntheticSessionRefusal } from "../../../../../../../lib/v1/synthetic-session.js";

/**
 * `PATCH /v1/sessions/{id}/steps/{stepId}`: a step corrected by hand — it is marked `edited`
 * (« modifié ») and a later analysis keeps it. By the owner's web session
 * or a device token of the space.
 */
export async function PATCH(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON object is required.",
      status: 400,
    });
  }
  try {
    const { id, stepId } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const step = await (
      await requireNightService()
    ).patchStep({
      tenantId: access.tenantId,
      sessionId: id,
      stepId,
      changes: body,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(step);
  } catch (error) {
    return nightFailure(error);
  }
}

/** `DELETE /v1/sessions/{id}/steps/{stepId}`: 204. */
export async function DELETE(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { id, stepId } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    await (
      await requireNightService()
    ).deleteStep({
      tenantId: access.tenantId,
      sessionId: id,
      stepId,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return nightFailure(error);
  }
}
