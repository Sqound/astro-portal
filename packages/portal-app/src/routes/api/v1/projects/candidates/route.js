import { deviceOrSessionReadV1Access } from "../../../../../lib/v1/access.js";
import {
  projectNightFailure,
  requireProjectNightService,
} from "../../../../../lib/v1/project-night-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * `GET /v1/projects/candidates?targetId=…` or `?framingId=…`: the nights of the journal and the plans of one night of a
 * target that has **no multi-night plan yet**, the earliest first — what
 * « À partir de plans déjà existants » lists before the plan is created.
 * Each line is a `night` of `project.schema.json` (`link: null`,
 * `projectId` the multi-night plan it already belongs to, or `null`).
 * Reading never needs a capability, on any service.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const query = new URL(request.url).searchParams;
    return v1Json(
      await (
        await requireProjectNightService()
      ).candidates({
        tenantId: access.tenantId,
        targetId: query.get("targetId"),
        framingId: query.get("framingId"),
      }),
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}
