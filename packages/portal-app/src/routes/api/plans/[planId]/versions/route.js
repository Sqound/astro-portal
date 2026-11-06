// The browser's own "Deux versions de ce plan" modal and "Versions
// précédentes" section, over a cookie-authenticated web session rather than a
// paired-device bearer — this deliberately stays outside `/v1`.
import { authEnabled, authService } from "../../../../../lib/auth.server.js";
import { plannerStateRepository } from "../../../../../lib/planner-state-repository.server.js";

const unavailable = () =>
  Response.json(
    { error: "Planner persistence requires enabled authentication." },
    { status: 403 },
  );

/** [planId] is the browser's own plan id (`plans.client_id`), exactly like
 * every plan id already carried inside `GET`/`PUT /api/plans`'s document —
 * never the `/v1` resource UUID. */
export async function GET(request, { params }) {
  if (!authEnabled()) return unavailable();
  try {
    const session = await authService().requireSession(request.headers);
    const repository = await plannerStateRepository();
    if (!repository) throw new Error("Planner storage is unavailable.");
    const { planId } = await params;
    const versions = await repository.planVersions({
      tenantId: session.tenant_id,
      clientId: planId,
    });
    if (!versions)
      return Response.json(
        { error: "The plan was not found." },
        {
          status: 404,
        },
      );
    return Response.json(versions, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error.message },
      { status: error.status || 401 },
    );
  }
}
