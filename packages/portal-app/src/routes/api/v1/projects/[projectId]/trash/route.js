import {
  clientInstanceIdFrom,
  webSessionV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  planTrashFailure,
  requirePlanTrashService,
} from "../../../../../../lib/v1/plan-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * POST /v1/projects/{projectId}/trash — « Supprimer ce plan multi-nuits »: the
 * multi-night plan goes to the trash for 30 days with its nights still to come
 * (its plans of one night not run); every night already run is detached and
 * stays in the Journal as an ordinary session. `200 { project, deletedAt,
 * purgeAt, daysRemaining, planIds, detachedSessionCount }`. `409
 * project_in_progress` (with `planIds`) when one of its nights runs on a
 * device; `{ "force": true }` deletes it anyway, that night with it. `DELETE
 * /v1/projects/{projectId}` still archives. Reserved to the web (CSRF), never
 * held by a right.
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  let body = {};
  try {
    body = (await readJsonBody(request)) ?? {};
  } catch {
    body = {};
  }
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requirePlanTrashService()
      ).trashProject({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        force: body?.force === true,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return planTrashFailure(error);
  }
}
