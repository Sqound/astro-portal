import { webSessionV1Access } from "../../../../../../lib/v1/access.js";
import {
  requireSessionTrashService,
  sessionTrashFailure,
} from "../../../../../../lib/v1/session-trash-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * POST /v1/sessions/{id}/erase — the immediate, definitive erasure of a
 * session that was deleted: its captures (their files
 * and their integrations), its events, supplements, analyses, steps, device
 * journals and declared integrations go, then the session. It cannot be
 * undone. Reserved to the web: a web session of the space
 * with its CSRF token only; a paired device's token is refused
 * `403 web_session_required`. `200 { sessionId, erased }`, `erased` counting what went
 * (`captures`, `events`, `supplements`, `analyses`, `steps`, `packageImports`,
 * `deviceJournalLines`, `integrations`). `409 session_not_deleted` for a
 * session that is not deleted: it is deleted first. Never held by a right.
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
      ).erase({
        tenantId: access.tenantId,
        userId: access.userId,
        sessionId: id,
      }),
    );
  } catch (error) {
    return sessionTrashFailure(error);
  }
}
