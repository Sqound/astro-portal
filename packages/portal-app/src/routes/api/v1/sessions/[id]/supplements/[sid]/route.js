import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../../lib/v1/access.js";
import {
  debriefFailure,
  requireDebriefService,
} from "../../../../../../../lib/v1/debrief-service.js";
import { v1Error, v1Json } from "../../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { syntheticSessionRefusal } from "../../../../../../../lib/v1/synthetic-session.js";

/**
 * POST /v1/sessions/{id}/supplements/{sid} — accept or dismiss a proposed
 * session supplement (api/v1.md, "Late field data: session supplements").
 * `accept` appends events for every supplement item no `target_started` of
 * this session already names; `dismiss` appends nothing and keeps the
 * payload. Replaying the same decision is `200` with `replayed: true`. A
 * dismissed supplement may still be accepted later; an accepted one can no
 * longer be dismissed (`409` `supplement_already_accepted`).
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
      message: "A JSON supplement decision is required.",
      status: 400,
    });
  }
  try {
    const { id, sid } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    const result = await (
      await requireDebriefService()
    ).decideSupplement({
      tenantId: access.tenantId,
      sessionId: id,
      supplementId: sid,
      body,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result);
  } catch (error) {
    return debriefFailure(error);
  }
}
