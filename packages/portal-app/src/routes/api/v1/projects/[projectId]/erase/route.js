import { webSessionV1Access } from "../../../../../../lib/v1/access.js";
import {
  planTrashFailure,
  requirePlanTrashService,
} from "../../../../../../lib/v1/plan-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";

/**
 * POST /v1/projects/{projectId}/erase — the definitive erasure of a
 * multi-night plan of the trash, with the plans that went with it and its
 * integrations; its image stays in the captures. `200 { projectId, erased:
 * true, plansErased }`; `409 project_not_deleted`; `404 project_not_found`.
 * Reserved to the web (CSRF), never held by a right.
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requirePlanTrashService()
      ).eraseProject({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
      }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
