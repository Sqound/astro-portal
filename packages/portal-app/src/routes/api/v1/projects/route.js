import { randomUUID } from "node:crypto";
import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../lib/v1/access.js";
import {
  projectNightFailure,
  requireProjectNightService,
} from "../../../../lib/v1/project-night-service.js";
import {
  projectResourceFailure,
  requireProjectResourceService,
} from "../../../../lib/v1/project-resource-service.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { parseNightsBody } from "portal/api/project-nights.js";

/**
 * A paired device or a web session lists its space's projects (« plans
 * multi-nuits »), archived ones included. Reading never needs a
 * capability.
 *
 * `?sessionId=` or `?planId=` keeps only the multi-night plans that
 * night, or that plan of one night, belongs to.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const projects = await requireProjectResourceService();
    const list = await projects.list({ tenantId: access.tenantId });
    const query = new URL(request.url).searchParams;
    const sessionId = query.get("sessionId");
    const planId = query.get("planId");
    if (!sessionId && !planId) return v1Json(list);
    const ids = await (
      await requireProjectNightService()
    ).projectIdsOf({ tenantId: access.tenantId, sessionId, planId });
    return v1Json({
      projects: list.projects.filter((project) => ids.has(project.id)),
    });
  } catch (error) {
    return projectResourceFailure(error);
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `POST /v1/projects` creates a multi-night plan — the body of a `PUT`
 * creation (`project.schema.json`, `create`), with an optional `id` — and,
 * « à partir de plans déjà existants », attaches the nights
 * (`fromSessionIds`) and plans of one night (`fromPlanIds`) of its target
 * in the same request: `201` with the project and its `nights`. Where a
 * provider gates them, creating needs `planner.mosaic`
 * (`403 capability_required`) and creating from existing nights also needs
 * the multi-night plans (`403 multi_night_not_active`); a private server
 * never restricts either. Every night and plan is checked first
 * (`409 target_mismatch`, `404 session_not_found` / `plan_not_found`):
 * nothing is created unless all can be attached.
 */
export async function POST(request) {
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
  if (!body || typeof body !== "object" || Array.isArray(body))
    return v1Json(
      {
        error: {
          code: "invalid_request",
          message: "A JSON project request is required.",
        },
      },
      { status: 400 },
    );
  const { id, fromSessionIds, fromPlanIds, ...write } = body;
  if (id !== undefined && (typeof id !== "string" || !uuidPattern.test(id)))
    return v1Json(
      { error: { code: "invalid_request", message: "id is a UUID." } },
      { status: 400 },
    );
  const fromExisting =
    (fromSessionIds !== undefined && fromSessionIds !== null) ||
    (fromPlanIds !== undefined && fromPlanIds !== null);
  let nights = null;
  let sources = null;
  try {
    if (fromExisting) {
      sources = parseNightsBody({
        sessionIds: fromSessionIds,
        planIds: fromPlanIds,
      });
      nights = await requireProjectNightService();
      await nights.requireMultiNight(access.userId);
      await nights.checkSources({
        tenantId: access.tenantId,
        target: write.target,
        ...sources,
      });
    }
  } catch (error) {
    return projectNightFailure(error);
  }
  const projectId = (id ?? randomUUID()).toLowerCase();
  let created;
  try {
    created = await (
      await requireProjectResourceService()
    ).write({
      tenantId: access.tenantId,
      userId: access.userId,
      projectId,
      ifMatch: '"0"',
      body: write,
      originDeviceId: access.deviceId || null,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
  } catch (error) {
    return projectResourceFailure(error);
  }
  try {
    const attached = nights
      ? await nights.attach({
          tenantId: access.tenantId,
          userId: access.userId,
          projectId,
          body: sources,
          originClientInstanceId: clientInstanceIdFrom(request),
        })
      : { nights: [] };
    return v1Json(
      {
        ...created.resource,
        nights: attached.nights,
        // Computed with `nights`.
        allSessionsDone: nights
          ? nights.allSessionsDone(attached.nights)
          : false,
      },
      { status: 201 },
    );
  } catch (error) {
    return projectNightFailure(error);
  }
}
