import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  nightFailure,
  requireNightService,
} from "../../../../../../lib/v1/night-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * `PATCH /v1/sessions/{id}/night`: the owner corrects the night field by field —
 * `title`, `startedAt`, `finishedAt`, `place` (never a time zone),
 * `equipment`, `targetIds`, `notes`; `null` gives a field back to the plan.
 * By the owner's web session (with its CSRF token) or a device token of
 * the space (the phone). Answers `{ session, night }`.
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
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const result = await (
      await requireNightService()
    ).patchNight({
      tenantId: access.tenantId,
      sessionId: id,
      changes: body,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result);
  } catch (error) {
    return nightFailure(error);
  }
}
