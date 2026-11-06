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
 * POST /v1/plans/{planId}/unarchive — gives an archived plan back the status
 * it had before (« Rétablir »): `200 { plan }`. A plan that is not archived
 * is returned as it is. Either credential. Never held by a right.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanSessionService()
      ).unarchive({
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
