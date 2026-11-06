import { webSessionV1Access } from "../../../../../../lib/v1/access.js";
import {
  planTrashFailure,
  requirePlanTrashService,
} from "../../../../../../lib/v1/plan-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/**
 * POST /v1/plans/{planId}/erase — the immediate, definitive erasure of a plan
 * of the trash: its items, framings and versions go; a session or a capture
 * that names it keeps its night and loses the plan. It cannot be undone.
 * `200 { planId, erased: true }`; `409 plan_not_deleted` for a plan that is
 * not deleted; `404 plan_not_found`. Reserved to the web (CSRF), never held
 * by a right.
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const { planId } = await params;
    return v1Json(
      await (
        await requirePlanTrashService()
      ).erasePlan({
        tenantId: access.tenantId,
        userId: access.userId,
        planId,
      }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
