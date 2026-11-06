import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
  movingPlanIdsFrom,
  planReadV1Access,
} from "../../../../../lib/v1/access.js";
import {
  planResourceFailure,
  requirePlanResourceService,
} from "../../../../../lib/v1/plan-resource-service.js";
import { requireObservationSessionService } from "../../../../../lib/v1/observation-session-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

export async function GET(request, { params }) {
  const access = await planReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanResourceService()
      ).get({
        tenantId: access.tenantId,
        planId,
      }),
    );
  } catch (error) {
    return planResourceFailure(error);
  }
}

/**
 * Writes accept a paired-device bearer, or the web session of « Mon espace »
 * with its CSRF token (archiving and giving back a plan still active from the
 * tab « Plans »), and always carry If-Match.
 *
 * A frozen plan that already has an observation session refuses the write
 * the same way it always did (`409` `plan_frozen`) but does not discard the
 * submission: it is stored as a proposed session supplement and the
 * response names it with `supplementId`/`sessionId` (api/v1.md, "Late field
 * data: session supplements" and "Plan writes and divergence"). A frozen
 * plan with no session keeps the bare body unchanged — there is no journal
 * to append the payload to, and the client already holds it. A client that
 * reads neither field behaves exactly as before.
 */
export async function PUT(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: 2 * 1024 * 1024 });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON plan request is required.",
      status: 400,
    });
  }
  const { planId } = await params;
  try {
    const result = await (
      await requirePlanResourceService()
    ).write({
      tenantId: access.tenantId,
      userId: access.userId,
      planId,
      ifMatch: request.headers.get("if-match"),
      payload: body?.payload,
      originDeviceId: access.deviceId,
      originClientInstanceId: clientInstanceIdFrom(request),
      movingPlanIds: movingPlanIdsFrom(request),
    });
    return v1Json(result.resource, { status: result.created ? 201 : 200 });
  } catch (error) {
    const refused = planResourceFailure(error);
    if (error?.code !== "plan_frozen" || !body?.payload) return refused;
    try {
      const proposed = await (
        await requireObservationSessionService()
      ).proposeSupplementForFrozenPlan({
        tenantId: access.tenantId,
        planId,
        originDeviceId: access.deviceId,
        payload: body.payload,
      });
      if (!proposed) return refused;
      return v1Json(
        {
          ...error.body,
          supplementId: proposed.supplementId,
          sessionId: proposed.sessionId,
        },
        { status: 409 },
      );
    } catch {
      // The plan write already failed for its own reason; a failure to
      // propose the supplement must not hide that behind a different error.
      return refused;
    }
  }
}

/**
 * Deletion carries If-Match like every other plan write and sends the plan
 * to the trash: hidden from every read, restorable for 30 days from « Plans
 * supprimés » (`POST /v1/plans/{planId}/restore`), then erased. A paired
 * device, or the web session of « Mon espace » with its CSRF token. The web
 * is told first when the plan's night runs on a device (`409
 * plan_in_progress`); `?force=true` deletes it anyway, with its open
 * session.
 */
export async function DELETE(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    const force = new URL(request.url).searchParams.get("force") === "true";
    await (
      await requirePlanResourceService()
    ).remove({
      tenantId: access.tenantId,
      userId: access.userId,
      planId,
      ifMatch: request.headers.get("if-match"),
      originClientInstanceId: clientInstanceIdFrom(request),
      refuseInProgress: !access.deviceId,
      force,
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return planResourceFailure(error);
  }
}
