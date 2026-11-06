import {
  clientInstanceIdFrom,
  webSessionV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  requireSessionTrashService,
  sessionTrashFailure,
} from "../../../../../../lib/v1/session-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * POST /v1/sessions/{id}/restore — a deleted session comes back: in the Journal, its statistics and its routes, with the
 * events and the captures it kept. `200 { session }`; a session that is not
 * deleted is returned as it is. `409 session_plan_taken` (naming the
 * `sessionId` that holds the plan) when the plan has another session since:
 * a plan holds one. Never held by a right. Reserved to the web: a web session of the space with its CSRF token only; a paired device's token
 * is refused `403 web_session_required`.
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: true });
    if (synthetic) return synthetic;
    return v1Json(
      await (
        await requireSessionTrashService()
      ).restore({
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: id,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return sessionTrashFailure(error);
  }
}
