import { requirePlanResourceService } from "../../../../../../lib/v1/plan-resource-service.js";
// Writes the fusion modal's choice — "Garder la version du
// navigateur", "Garder l'autre version", or the composed "Résultat" — as
// this plan's next revision. See `planner-state-repository.js`'s
// `resolvePlanDivergence` for the doctrine this delegates to (revision
// guard, `history` archiving, `plans`-domain signal via the change bus).
import { authEnabled, authService } from "../../../../../../lib/auth.server.js";
import { plannerStateRepository } from "../../../../../../lib/planner-state-repository.server.js";
import { readJsonBody } from "portal/api/json-body.js";

const unavailable = () =>
  Response.json(
    { error: "Planner persistence requires enabled authentication." },
    { status: 403 },
  );

const resolutionChoices = new Set(["keepBrowser", "keepOther", "merged"]);
const fieldSides = new Set(["local", "other"]);

// `fields` — the « Réglages du plan » rows of the modal,
// `{ <row id>: "local" | "other" }` ("local": this browser's version). Absent
// (an older browser build), the merged plan keeps the live plan's settings,
// as before that phase. "keepBrowser" and "keepOther" keep the whole version
// they name, settings included; they read no `fields`.
function requestedFields(body) {
  if (body?.fields === undefined || body?.fields === null) return null;
  const fields = body.fields;
  if (
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    !Object.values(fields).every((side) => fieldSides.has(side))
  )
    throw Object.assign(
      new Error('fields must map each plan setting to "local" or "other".'),
      { code: "invalid_plan_field", status: 400 },
    );
  return fields;
}

export async function POST(request, { params }) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().verifyCsrf(request.headers);
    const body = await readJsonBody(request);
    const choice = String(body?.choice || "");
    if (!resolutionChoices.has(choice))
      throw Object.assign(
        new Error(
          'A resolution choice ("keepBrowser", "keepOther" or "merged") is required.',
        ),
        { status: 400 },
      );
    const fields = requestedFields(body);
    // Soft-downgrade write gate: choosing a resolution writes the plan's
    // next revision — a new envoi, exactly like `PUT /v1/plans/{id}`.
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
    const { planId } = await params;
    const clientInstanceIdHeader = request.headers
      .get("x-astro-client-instance")
      ?.trim();
    const resource = await repository.resolvePlanDivergence({
      tenantId: session.tenant_id,
      userId: session.user_id,
      planLimit: rights.planLimit,
      plannerMultiple: rights.plannerMultiple,
      projectLinks: rights.projectLinks,
      clientId: planId,
      choice,
      items: Array.isArray(body?.items) ? body.items : [],
      fields,
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
        ...(Array.isArray(error.fields) ? { fields: error.fields } : {}),
      },
      { status: error.status || 400 },
    );
  }
}
