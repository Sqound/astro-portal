import { deviceOrSessionReadV1Access } from "../../../../../../lib/v1/access.js";
import {
  projectNightFailure,
  requireProjectNightService,
} from "../../../../../../lib/v1/project-night-service.js";
import { requireNightService } from "../../../../../../lib/v1/night-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import { projectAnalysesBody } from "portal/api/project-analyses.js";

/**
 * `GET /v1/projects/{projectId}/analyses`: the statistics of the nights of a
 * multi-night plan, night by night (guiding, frames, the place's zone) and
 * together (`cumulative`: RMS weighted by the guided time, frames summed).
 * Reading never needs a capability; `404 project_not_found` for a plan the
 * space does not hold.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    const projects = await requireProjectNightService();
    // The plan must be the space's (404 otherwise), as its nights' read.
    await projects.list({ tenantId: access.tenantId, projectId });
    const nights = await requireNightService();
    return v1Json(
      await projectAnalysesBody({
        tenantId: access.tenantId,
        projectId,
        projectNights: (query) => projects.projectNights(query),
        readNight: (query) => nights.read(query),
      }),
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}
