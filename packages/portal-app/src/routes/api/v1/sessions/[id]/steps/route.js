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
 * `POST /v1/sessions/{id}/steps`: a
 * step added by hand (« Ajouter un palier »), origin `manual` — target,
 * filter (free text), frames, exposure, gain. By the owner's web session
 * or a device token of the space. 201 with the step.
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
      message: "A JSON object is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const step = await (
      await requireNightService()
    ).createStep({
      tenantId: access.tenantId,
      sessionId: id,
      step: body,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(step, { status: 201 });
  } catch (error) {
    return nightFailure(error);
  }
}
