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
 * POST /v1/plans/{planId}/session — « Recréer la session à partir du plan »: the plan of a deleted session stays
 * « exécuté » and says `sessionMissing`; this makes its session again. The
 * plan goes back to the debriefing (active, not frozen, its closure carried
 * by `payload.closedAs`, as a phone that ran the night carries it) and the
 * new session, finished, of origin `debrief`, is « À débriefer ».
 * `201 { plan, session }`. `409 plan_not_debriefed` (the plan was never
 * frozen by a debriefing), `409 plan_archived` (restore it first),
 * `409 session_exists` naming the `sessionId`. Either credential. Never held
 * by a right.
 */
export async function POST(request, { params }) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanSessionService()
      ).recreateSession({
        tenantId: access.tenantId,
        userId: access.userId,
        planId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
      { status: 201 },
    );
  } catch (error) {
    return planSessionFailure(error);
  }
}
