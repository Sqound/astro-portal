import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  projectNightFailure,
  requireProjectNightService,
} from "../../../../../../lib/v1/project-night-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * `GET /v1/projects/{projectId}/nights`: the nights of a multi-night plan, the earliest
 * first, and the candidates — the nights of the journal and the plans of
 * one night of the same target that are not among them. Reading never
 * needs a capability, on any service; `404 project_not_found` for a plan
 * the space does not hold.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requireProjectNightService()
      ).list({ tenantId: access.tenantId, projectId }),
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}

/**
 * `POST` attaches nights (`sessionIds`) and plans of one night (`planIds`)
 * of the plan's target: `{ sessionIds?, planIds? }`, at least one id, and
 * answers `200` with the same body as `GET`. Refused
 * `403 multi_night_not_active` (`capability: "planner.mosaic"`)
 * without « Planification avancée » where a provider gates it (never on a
 * private server); `409 target_mismatch` for a night or a plan
 * of another target; `404 session_not_found` / `plan_not_found`. Nothing
 * is attached unless all can be.
 */
export async function POST(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON nights request is required.",
      status: 400,
    });
  }
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requireProjectNightService()
      ).attach({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        body,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}
