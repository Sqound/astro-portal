import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  observationSessionFailure,
  requireObservationSessionService,
} from "../../../../../../lib/v1/observation-session-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readBodyText } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * POST /v1/sessions/{id}/reopen — « Reprendre la nuit »: a finished session is open again while its plan is not
 * debriefed (409 `session_debriefed` otherwise). Idempotent; a replay older
 * than the recorded finish changes nothing. Emits no event of its own.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body = {};
  let rawBody;
  try {
    rawBody = await readBodyText(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON reopen request is required.",
      status: 400,
    });
  }
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      return v1Error(error, {
        code: "invalid_request",
        message: "A JSON reopen request is required.",
        status: 400,
      });
    }
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const resource = await (
      await requireObservationSessionService()
    ).reopen({
      tenantId: access.tenantId,
      sessionId: id,
      reopenedAt: body?.reopenedAt ?? null,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(resource);
  } catch (error) {
    return observationSessionFailure(error);
  }
}
