// "Versions précédentes" → "Restaurer" (a plain POST with no body, or `{}`),
// and, reopening the fusion modal from there, "Comparer" → confirm
// (`{items: [...]}`). See `planner-state-repository.js`'s
// `restorePreviousVersion` for why this restores a `history` row directly
// rather than reusing `/v1`'s own `restorePlanResource` (which only reads
// `set_aside` rows).
import {
  authEnabled,
  authService,
} from "../../../../../../../lib/auth.server.js";
import { plannerStateRepository } from "../../../../../../../lib/planner-state-repository.server.js";
import { requirePlanResourceService } from "../../../../../../../lib/v1/plan-resource-service.js";
import { readBodyText } from "portal/api/json-body.js";

const unavailable = () =>
  Response.json(
    { error: "Planner persistence requires enabled authentication." },
    { status: 403 },
  );

export async function POST(request, { params }) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().verifyCsrf(request.headers);
    // Soft-downgrade write gate: restoring a previous version writes the
    // plan's next revision — a new envoi, exactly like
    // `POST /v1/plans/{id}/versions/{versionId}/restore`.
    const rights = await (
      await requirePlanResourceService()
    ).writeRightsFor(session.user_id);
    if (rights.readOnly)
      throw Object.assign(
        new Error(
          "This account's subscription has ended: plan writes are suspended; existing plans remain readable and exportable.",
        ),
        { code: "entitlement_read_only", status: 403 },
      );
    const repository = await plannerStateRepository();
    if (!repository) throw new Error("Planner storage is unavailable.");
    const { planId, versionId } = await params;
    let body = {};
    const rawBody = await readBodyText(request);
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (error) {
        throw Object.assign(new Error("A JSON body is required."), {
          status: 400,
        });
      }
    }
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    const resource = await repository.restorePreviousVersion({
      tenantId: session.tenant_id,
      userId: session.user_id,
      planLimit: rights.planLimit,
      plannerMultiple: rights.plannerMultiple,
      projectLinks: rights.projectLinks,
      clientId: planId,
      versionId,
      items: Array.isArray(body?.items) ? body.items : null,
      originClientInstanceId: clientInstanceIdHeader
        ? clientInstanceIdHeader.slice(0, 200)
        : null,
    });
    return Response.json(resource, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.capability ? { capability: error.capability } : {}),
      },
      { status: error.status || 400 },
    );
  }
}
