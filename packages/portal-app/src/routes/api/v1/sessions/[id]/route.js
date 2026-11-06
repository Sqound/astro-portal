import {
  clientInstanceIdFrom,
  eitherV1Access,
  eitherV1WriteAccess,
} from "../../../../../lib/v1/access.js";
import {
  observationSessionFailure,
  requireObservationSessionService,
} from "../../../../../lib/v1/observation-session-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readBodyText } from "portal/api/json-body.js";
import { sessionDetailBody } from "../../../../../lib/v1/session-detail.js";
import {
  requireSessionTrashService,
  sessionTrashFailure,
} from "../../../../../lib/v1/session-trash-service.js";
import { syntheticSessionRefusal } from "../../../../../lib/v1/synthetic-session.js";

/**
 * GET /v1/sessions/{id} — additive route (api/v1.md, "Additive routes
 * awaiting approval"). One session with its supplements, the first page of
 * its events (read through its rework), the plan projection and, for the
 * summary of its night, the stored debriefing; and the structured night: its own fields with their source, its
 * steps and the summaries of its analysis, computed now — never gated by a
 * capability. Its `targets` come in the order of the night.
 */
export async function GET(request, { params }) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    return v1Json(
      await sessionDetailBody({
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: id,
        includeReplaced:
          new URL(request.url).searchParams.get("includeReplaced") === "true",
      }),
    );
  } catch (error) {
    return observationSessionFailure(error);
  }
}

/**
 * DELETE /v1/sessions/{id} — the soft deletion of a session: it leaves the Journal, its statistics, the debriefing queue and
 * every route of a session, and the space keeps it `graceDays` (30) days in
 * the deleted sessions, restorable (`POST /v1/sessions/{id}/restore`), before
 * the maintenance erases it with its captures and its data. The plan it came
 * from is not touched. Answers `200 { session, graceDays, daysRemaining }`
 * (`session.deletedAt`, `session.purgeAt`); idempotent. A night in progress
 * is not deleted (`409 session_not_finished`). The credentials of a space
 * are its owner's: either credential, a cookie session carrying its CSRF
 * token. Never held by a right.
 */
export async function DELETE(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    return v1Json(
      await (
        await requireSessionTrashService()
      ).remove({
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: id,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return sessionTrashFailure(error);
  }
}

/**
 * PATCH /v1/sessions/{id} — the mode of a night changed (the piloting of « Nuit en cours »). Body `{ piloting }`, one of `mount`,
 * `smart_telescope`, `assisted` or `free` (the values `POST /v1/sessions`
 * takes at the creation, which never changes them afterwards). `200` the
 * session; the same value again changes nothing; any other value or no body
 * is `400 invalid_request`; a deleted session or another space's is `404
 * session_not_found`, a catalogue night `409 session_read_only`. Either
 * credential (+CSRF for a cookie session); never held by a right.
 */
export async function PATCH(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = JSON.parse(await readBodyText(request));
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON body with a piloting is required.",
      status: 400,
    });
  }
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    return v1Json(
      await (
        await requireObservationSessionService()
      ).setPiloting({
        tenantId: access.tenantId,
        sessionId: id,
        piloting: body?.piloting,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return observationSessionFailure(error);
  }
}
