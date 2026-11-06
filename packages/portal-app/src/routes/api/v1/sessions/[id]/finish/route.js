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
 * POST /v1/sessions/{id}/finish — idempotent: a second call returns the
 * already-finished session and never moves a `finishedAt` already recorded.
 * `closedBy` (`automatic` | `manual`) says how the night was closed, kept as
 * sent and rendered as such. Emits no event of its own.
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
      message: "A JSON finish request is required.",
      status: 400,
    });
  }
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      return v1Error(error, {
        code: "invalid_request",
        message: "A JSON finish request is required.",
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
    ).finish({
      tenantId: access.tenantId,
      sessionId: id,
      finishedAt: body?.finishedAt ?? null,
      closedBy: body?.closedBy ?? null,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(resource);
  } catch (error) {
    return observationSessionFailure(error);
  }
}
