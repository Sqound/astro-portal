import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
  eventSourceOf,
} from "../../../../../../lib/v1/access.js";
import {
  journalFailure,
  requireSessionReworkService,
} from "../../../../../../lib/v1/journal-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { sessionDetailBody } from "../../../../../../lib/v1/session-detail.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * PUT /v1/sessions/{id}/rework — « Remanier » (`session-rework.schema.json`). Corrects what a finished
 * night recorded, after the fact: the targets (order, figures, removals), events added, moved or removed — as a **correction
 * layer** read through, never an edit of the append-only log. `If-Match: "<reworkRevision>"` (428 without, 409
 * `session_rework_conflict` with the current session when stale). **Free**: no capability, any profile, a private server
 * included, and the read-only window of an ended subscription does not hold it either (reworking is free). Either
 * credential; a cookie session carries the CSRF token. Answers the session's detail, as `GET /v1/sessions/{id}`.
 */
export async function PUT(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON rework is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    await (
      await requireSessionReworkService()
    ).rework({
      tenantId: access.tenantId,
      userId: access.userId,
      sessionId: id,
      ifMatch: request.headers.get("if-match"),
      body,
      source: eventSourceOf(access),
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(
      await sessionDetailBody({
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: id,
      }),
    );
  } catch (error) {
    return journalFailure(error);
  }
}
