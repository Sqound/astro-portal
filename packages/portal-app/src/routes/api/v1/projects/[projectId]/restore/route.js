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
 * POST /v1/projects/{projectId}/restore — a multi-night plan of the trash
 * comes back with the plans that went with it (`plansRestored`; one whose
 * night is taken since stays in the trash, `plansKept`) and the nights it was
 * detached from, when they are still free. `200 { project, plansRestored,
 * plansKept }`; `404 project_not_found`. Reserved to the web (CSRF).
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requirePlanTrashService()
      ).restoreProject({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
