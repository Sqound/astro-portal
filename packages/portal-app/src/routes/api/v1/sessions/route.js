import {
  clientInstanceIdFrom,
  eitherV1Access,
  eitherV1WriteAccess,
} from "../../../../lib/v1/access.js";
import {
  observationSessionFailure,
  requireObservationSessionService,
} from "../../../../lib/v1/observation-session-service.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * POST /v1/sessions — begins an observation session. `planId` is the server
 * plan UUID, never the browser client id carried inside a plan payload.
 * Idempotent: at most one session per plan (200 with the existing one), and
 * a direct session's own `clientSessionId` replays the same way.
 * `executionId`, `piloting` and `origin`, written at
 * creation only. Either credential; a cookie session additionally carries
 * the CSRF token.
 */
export async function POST(request) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON session request is required.",
      status: 400,
    });
  }
  try {
    const result = await (
      await requireObservationSessionService()
    ).create({
      tenantId: access.tenantId,
      planId: body?.planId ?? null,
      startedAt: body?.startedAt,
      clientSessionId: body?.clientSessionId ?? null,
      // Additive: an execution of several plans, and how this plan is
      // piloted.
      executionId: body?.executionId ?? null,
      piloting: body?.piloting ?? null,
      // `execution` or
      // `astro-sync`, written at creation only.
      origin: body?.origin ?? null,
      originDeviceId: access.deviceId,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(
      { session: result.resource, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return observationSessionFailure(error);
  }
}

/**
 * GET /v1/sessions?since=&limit=&deleted= — the membership's session page.
 * `deleted`: `exclude` (the default), `include` (a deleted session is listed
 * with its `deletedAt`: how a device learns a deletion) or `only`.
 */
export async function GET(request) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const url = new URL(request.url);
    const result = await (
      await requireObservationSessionService()
    ).list({
      tenantId: access.tenantId,
      since: url.searchParams.get("since"),
      limit: url.searchParams.get("limit"),
      deleted: url.searchParams.get("deleted"),
    });
    return v1Json(result);
  } catch (error) {
    return observationSessionFailure(error);
  }
}
