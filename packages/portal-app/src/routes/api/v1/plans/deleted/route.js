import { webSessionV1Access } from "../../../../../lib/v1/access.js";
import {
  planTrashFailure,
  requirePlanTrashService,
} from "../../../../../lib/v1/plan-trash-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/plans/deleted — the plans in the trash, the most recently deleted
 * first: the plans of one night (`plans`, each `{ plan, deletedAt, purgeAt,
 * daysRemaining, projectId }`, `projectId` naming the multi-night plan it went
 * with) and the multi-night plans (`projects`, each `{ project, deletedAt,
 * purgeAt, daysRemaining, planIds, detachedSessionCount }`); `graceDays` is 30
 * (`plan.schema.json`, `deletedList`). A read never held by a right. Reserved
 * to the web: a paired device's token is refused `403 web_session_required`.
 */
export async function GET(request) {
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requirePlanTrashService()
      ).list({ tenantId: access.tenantId }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
