import { authEnabled, authService } from "../../../lib/auth.server.js";
import { requireManageEquipment } from "../../../lib/v1/manage-equipment-service.js";

// Planner profiles are private: an authenticated account can read its own
// inventory, while guest planning keeps using the bundled demonstration
// profiles and never receives this endpoint's data. With it come the
// « Matériel par défaut » every space is offered (`defaults`) and the
// option « Masquer le matériel par défaut » of the space.
export async function GET(request) {
  if (!authEnabled())
    return Response.json(
      { error: "Equipment inventory requires enabled authentication." },
      { status: 403 },
    );
  try {
    const session = await authService().requireSession(request.headers);
    const service = await requireManageEquipment();
    return Response.json(
      await service.plannerRead({ tenantId: session.tenant_id }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 401 });
  }
}
