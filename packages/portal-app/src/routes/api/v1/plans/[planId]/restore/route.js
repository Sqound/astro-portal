import {
  clientInstanceIdFrom,
  webSessionV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  planTrashFailure,
  requirePlanTrashService,
} from "../../../../../../lib/v1/plan-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/**
 * POST /v1/plans/{planId}/restore — a plan of the trash comes back: `200 {
 * plan }`, its revision up by one, the open session that went with it given
 * back, the link to a multi-night plan that is gone taken out. A plan still
 * to run meets the rules of a new plan: `409 plan_limit_reached`, `409
 * plan_night_place_conflict` (another plan holds its night at another place).
 * `404 plan_not_found` for a plan that is not in the trash. Reserved to the
 * web: a web session with its CSRF token; a device's token is refused `403
 * web_session_required`.
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanTrashService()
      ).restorePlan({
        tenantId: access.tenantId,
        userId: access.userId,
        planId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
