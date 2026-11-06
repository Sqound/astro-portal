import {
  clientInstanceIdFrom,
  eitherV1Access,
  eventSourceOf,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  observationSessionFailure,
  requireObservationSessionService,
} from "../../../../../../lib/v1/observation-session-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * POST /v1/sessions/{id}/events — at most 500 events per batch, idempotent
 * union on (sessionId, eventId). A faulty event is rejected ALONE; the
 * batch itself is refused whole, with nothing written, only for
 * envelope-level faults (malformed JSON, a missing/empty/oversized `events`
 * array) — api/v1.md, "Appending events".
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
      message: "A JSON event batch is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const result = await (
      await requireObservationSessionService()
    ).ingestEvents({
      tenantId: access.tenantId,
      sessionId: id,
      originDeviceId: access.deviceId,
      source: eventSourceOf(access),
      originClientInstanceId: clientInstanceIdFrom(request),
      events: body?.events,
    });
    return v1Json(result);
  } catch (error) {
    return observationSessionFailure(error);
  }
}

/**
 * GET /v1/sessions/{id}/events?since= — additive route (api/v1.md,
 * "Additive routes awaiting approval"). Ordered by receivedAt then
 * eventId; `since` is inclusive against receivedAt.
 */
export async function GET(request, { params }) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: false });
    if (synthetic) return synthetic;
    const url = new URL(request.url);
    const page = await (
      await requireObservationSessionService()
    ).listEvents({
      tenantId: access.tenantId,
      sessionId: id,
      since: url.searchParams.get("since"),
      limit: url.searchParams.get("limit"),
      includeReplaced: url.searchParams.get("includeReplaced") === "true",
    });
    return v1Json(page);
  } catch (error) {
    return observationSessionFailure(error);
  }
}
