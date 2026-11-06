import { webSessionV1Access } from "../../../../../lib/v1/access.js";
import {
  requireSessionTrashService,
  sessionTrashFailure,
} from "../../../../../lib/v1/session-trash-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/journal/deleted — the deleted sessions of the space, the most recently deleted first: each is a line of the
 * Journal (`journal.schema.json`, `deletedEntry`: the `session`, `deletedAt`,
 * `purgeAt`, the instant the maintenance erases it, and `daysRemaining`);
 * its `captureCount` is what the erasure would take; `graceDays` is 30. A read
 * never held by a right. Reserved to the web: a web session
 * of the space; a paired device's token is refused `403 web_session_required`.
 */
export async function GET(request) {
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requireSessionTrashService()
      ).list({ tenantId: access.tenantId }),
    );
  } catch (error) {
    return sessionTrashFailure(error);
  }
}
