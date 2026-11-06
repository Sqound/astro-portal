import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../../../lib/v1/access.js";
import {
  projectNightFailure,
  requireProjectNightService,
} from "../../../../../../../lib/v1/project-night-service.js";
import { v1Json } from "../../../../../../../lib/v1/response.js";

/**
 * `DELETE /v1/projects/{projectId}/nights/{nightId}` detaches a night —
 * `nightId` a night of the journal, or a plan of one night not run yet —
 * from the multi-night plan: its plan item no longer names the plan, and
 * its integrations leave it. Idempotent: a night that is not attached
 * changes nothing. Answers `200` with the body of `GET …/nights`;
 * `403 multi_night_not_active` as for attaching; `404 night_not_found`
 * when the space holds neither a night nor a plan of that id.
 */
export async function DELETE(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId, nightId } = await params;
    return v1Json(
      await (
        await requireProjectNightService()
      ).detach({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        nightId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}
