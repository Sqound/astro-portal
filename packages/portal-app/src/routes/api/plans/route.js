import { createHash } from "node:crypto";
import { authEnabled, authService } from "../../../lib/auth.server.js";
import { plannerStateRepository } from "../../../lib/planner-state-repository.server.js";
import { requirePlanResourceService } from "../../../lib/v1/plan-resource-service.js";
import { readJsonBody } from "portal/api/json-body.js";
import { isConstraintViolation } from "portal/persistence/planner-state-repository.js";

const unavailable = () =>
  Response.json(
    { error: "Planner persistence requires enabled authentication." },
    { status: 403 },
  );

/**
 * The rights of the v1 plan API, resolved from the very same entitlement
 * provider: the person's `sync.plan_limit`, the
 * read-only window of an ended subscription and the right on the links to a
 * multi-night plan (`planner.mosaic`, a one-time purchase's included in the
 * window). A private server's owner has no limit and is never read-only.
 */
async function planRightsFor(userId) {
  return await (await requirePlanResourceService()).writeRightsFor(userId);
}

export async function GET(request) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().requireSession(request.headers);
    const repository = await plannerStateRepository();
    if (!repository) throw new Error("Planner storage is unavailable.");
    return Response.json(await repository.plannerState(session.tenant_id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 401 });
  }
}
export async function PUT(request) {
  if (!authEnabled()) return unavailable();
  // The plans the document names as removed, for a refusal in words.
  let removedPlanIds = [];
  try {
    const session = await authService().verifyCsrf(request.headers);
    const body = await readJsonBody(request, { limit: 4 * 1024 * 1024 });
    removedPlanIds = Array.isArray(body?.state?.deletedPlanIds)
      ? body.state.deletedPlanIds.map(String)
      : [];
    const serialized = JSON.stringify(body?.state || {});
    if (serialized.length > 1_000_000)
      throw new Error("Planner payload is too large.");
    const imported = body?.mode === "import";
    const repository = await plannerStateRepository();
    if (!repository) throw new Error("Planner storage is unavailable.");
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    const result = await repository.savePlannerState({
      tenantId: session.tenant_id,
      userId: session.user_id,
      state: body?.state || {},
      sourceHash: imported
        ? createHash("sha256").update(serialized).digest("hex")
        : null,
      importOnly: imported,
      originClientInstanceId: clientInstanceIdHeader
        ? clientInstanceIdHeader.slice(0, 200)
        : null,
      ...(await planRightsFor(session.user_id)),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // A refusal of the v1 rights keeps its v1 code and status; `error`
    // stays the message the planner already shows.
    if (
      error?.code === "plan_limit_reached" ||
      error?.code === "entitlement_read_only" ||
      error?.code === "payload_too_large" ||
      // The links to a multi-night plan: the v1 plan write's refusals,
      // in this route's `{ error, code }` shape.
      error?.code === "multi_night_not_active" ||
      error?.code === "project_not_found" ||
      error?.code === "target_mismatch" ||
      // A night too far ahead is not marked executed or
      // abandoned; a plan that is history is not deleted (`planIds` are the
      // browser's ids of the plans refused).
      error?.code === "plan_night_not_begun" ||
      error?.code === "plan_not_deletable" ||
      // A night has one place; the answer names the date and the place
      // and plans the night holds (`nightPlace`).
      error?.code === "plan_night_place_conflict" ||
      // An acquisition line out of bounds, its field named.
      (error?.code === "invalid_payload" && error.field)
    )
      return Response.json(
        {
          error: error.message,
          code: error.code,
          ...(error.capability ? { capability: error.capability } : {}),
          // The refused link: the
          // item of the plan and the multi-night plan it was to join, so
          // that the page can say which link was not kept.
          ...(error.planItemId ? { planItemId: error.planItemId } : {}),
          ...(error.projectId ? { projectId: error.projectId } : {}),
          ...(Array.isArray(error.planIds) ? { planIds: error.planIds } : {}),
          // Those of the plans whose night is running on a device (a
          // session open or paused).
          ...(Array.isArray(error.inProgressPlanIds)
            ? { inProgressPlanIds: error.inProgressPlanIds }
            : {}),
          ...(error.nightPlace
            ? { date: error.date, nightPlace: error.nightPlace }
            : {}),
          ...(error.field ? { field: error.field, limit: error.limit } : {}),
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    // The database's own words never reach a page. A constraint that
    // refuses the write is a refusal of the request, named: the removal of
    // a plan something still depends on, or a write the service could not
    // take.
    if (isConstraintViolation(error)) {
      const dependent =
        removedPlanIds.length > 0 &&
        /foreign ?key|\b23503\b/i.test(
          `${error?.code ?? ""} ${error?.message ?? ""}`,
        );
      return Response.json(
        dependent
          ? {
              error:
                "An executed or archived plan cannot be deleted: archive it instead.",
              code: "plan_not_deletable",
              planIds: removedPlanIds,
            }
          : {
              error: "The planner could not take this change. Reload the page.",
              code: "plan_write_refused",
            },
        {
          status: dependent ? 403 : 409,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    return Response.json({ error: error.message }, { status: 400 });
  }
}
