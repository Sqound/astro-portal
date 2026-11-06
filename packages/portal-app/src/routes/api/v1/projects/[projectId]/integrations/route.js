import {
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  projectIntegrationFailure,
  requireProjectIntegrationService,
} from "../../../../../../lib/v1/project-integration-service.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * `GET /v1/projects/{projectId}/integrations`: the integrations Astro Sync sent for a
 * multi-night plan, the earliest night first, with their totals by filter
 * (`integration.schema.json`). Reading never needs a capability, on any
 * service; `404 project_not_found` for a plan the space does not hold.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requireProjectIntegrationService()
      ).list({ tenantId: access.tenantId, projectId }),
    );
  } catch (error) {
    return projectIntegrationFailure(error);
  }
}

/**
 * `PUT` adds or replaces lines, idempotent per night, target and family
 * (`{ integrations: [...] }`, 1 to 200). Refused
 * `403 multi_night_not_active` without « Synchronisation avancée+ » where a
 * provider gates it (never on a private server);
 * `409 integration_outside_night` when a line
 * is not dated by its night.
 */
export async function PUT(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON integrations request is required.",
      status: 400,
    });
  }
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requireProjectIntegrationService()
      ).put({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        body,
      }),
    );
  } catch (error) {
    return projectIntegrationFailure(error);
  }
}
