import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  projectResourceFailure,
  requireProjectResourceService,
} from "../../../../../lib/v1/project-resource-service.js";
import { requireProjectIntegrationService } from "../../../../../lib/v1/project-integration-service.js";
import { requireProjectNightService } from "../../../../../lib/v1/project-night-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * The project read alone also carries the integrations Astro Sync sent for
 * it, their totals by filter and the image of the plan
 * (`integration.schema.json`), on every service — reading never needs a
 * capability. It also lists its `nights`.
 */
async function withIntegrations(tenantId, project) {
  const extras = await (
    await requireProjectIntegrationService()
  ).projectExtras({ tenantId, projectId: project.id });
  // And its nights — planned from it or attached since — and whether every
  // night of it is behind it.
  const { nights, allSessionsDone } = await (
    await requireProjectNightService()
  ).projectNights({ tenantId, projectId: project.id });
  return { ...project, ...extras, nights, allSessionsDone };
}

/** One project of the space, `404 project_not_found` when it holds none of
 * that id. */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    const project = await (
      await requireProjectResourceService()
    ).get({ tenantId: access.tenantId, projectId });
    return v1Json(await withIntegrations(access.tenantId, project));
  } catch (error) {
    return projectResourceFailure(error);
  }
}

/**
 * `PUT` creates (`If-Match: "0"`, `201`) or updates a project at exactly the
 * revision named (`200`). A stale write answers `409 project_conflict` with
 * the server's `project`. Where a provider gates the multi-night plans it
 * needs `planner.mosaic` (`403 capability_required`); a private server
 * never restricts it.
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
      message: "A JSON project request is required.",
      status: 400,
    });
  }
  try {
    const { projectId } = await params;
    const result = await (
      await requireProjectResourceService()
    ).write({
      tenantId: access.tenantId,
      userId: access.userId,
      projectId,
      ifMatch: request.headers.get("if-match"),
      body,
      originDeviceId: access.deviceId || null,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result.resource, { status: result.created ? 201 : 200 });
  } catch (error) {
    return projectResourceFailure(error);
  }
}

/**
 * `DELETE` archives, never deletes: `200 { archived: true, project }`. The
 * nights stay ordinary plans. Refused only in the read-only window of an
 * ended subscription, where a provider gates the multi-night plans.
 */
export async function DELETE(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { projectId } = await params;
    return v1Json(
      await (
        await requireProjectResourceService()
      ).archive({
        tenantId: access.tenantId,
        userId: access.userId,
        projectId,
        ifMatch: request.headers.get("if-match"),
        originDeviceId: access.deviceId || null,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return projectResourceFailure(error);
  }
}
