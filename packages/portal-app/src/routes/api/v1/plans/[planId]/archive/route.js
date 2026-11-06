import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../../lib/v1/access.js";
import {
  planSessionFailure,
  requirePlanSessionService,
} from "../../../../../../lib/v1/plan-session-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/**
 * POST /v1/plans/{planId}/archive — archives a plan the service froze (a
 * debriefing made it « exécuté », « en partie » or « abandonné », D-extra).
 * `PUT /v1/plans/{planId}` writes active plans only, so this is the archive
 * of a plan that is history: `200 { plan }` with the status `archived`; its
 * payload, its debriefing and its session do not move. Idempotent.
 * `409 plan_not_frozen` for an active plan (it is archived by writing it
 * with `closedAs: "archived"`). Either credential. Never held by a right.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanSessionService()
      ).archive({
        tenantId: access.tenantId,
        userId: access.userId,
        planId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return planSessionFailure(error);
  }
}
