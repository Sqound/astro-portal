import { deviceOrSessionReadV1Access } from "../../../../../../lib/v1/access.js";
import {
  nightFailure,
  requireNightService,
} from "../../../../../../lib/v1/night-service.js";
import { v1Json } from "../../../../../../lib/v1/response.js";
import { syntheticSessionRefusal } from "../../../../../../lib/v1/synthetic-session.js";

/**
 * `GET /v1/sessions/{id}/online` (`session-online.schema.json`): what is online for a night —
 * per target, its captures with their source, stage and visibility, the
 * main image and every image of each with its SHA-256 and whether a sky
 * solution exists for it; and the night's analysis in place. What Astro
 * Sync's resume and « Nuits » read before sending anything. By a device
 * token of the space or the owner's web session; never gated by a
 * capability; not a plan synchronization (`lastSyncAt` untouched).
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { id } = await params;
    const synthetic = syntheticSessionRefusal(id, { write: false });
    if (synthetic) return synthetic;
    const online = await (
      await requireNightService()
    ).online({ tenantId: access.tenantId, sessionId: id });
    return v1Json(online);
  } catch (error) {
    return nightFailure(error);
  }
}
