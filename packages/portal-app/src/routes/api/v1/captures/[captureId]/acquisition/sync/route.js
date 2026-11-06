import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../../../lib/v1/access.js";
import { ifMatchOf } from "../../../../../../../lib/v1/if-match.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../../lib/v1/owner-capture-service.js";
import { v1Json } from "../../../../../../../lib/v1/response.js";

const captureIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.captureId || "");
  } catch {
    return "";
  }
};

/**
 * POST /v1/captures/{id}/acquisition/sync (« Synchroniser avec la session »
 * for the owner's phone): the device counterpart of
 * `POST /v1/manage/captures/{id}/acquisition/sync` — one function behind two
 * routes. Either credential (the web session with its CSRF token), no body,
 * `If-Match: "<revision>"` optional; answers `{ acquisition, capture }` with
 * the same refusals (`400 invalid_if_match`, `403 entitlement_read_only`,
 * `404 capture_not_found`, `409 capture_without_session` for a capture with
 * neither a session nor a plan, `409 capture_conflict` when a line changed
 * after the revision named). On the image of a multi-night plan the lines come
 * from the sessions it combines.
 */
export async function POST(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  const match = ifMatchOf(request);
  const originClientInstanceId = clientInstanceIdFrom(request) || null;
  if (match.response) return match.response;
  try {
    const service = await requireOwnerCaptureService();
    return v1Json(
      await service.syncAcquisition({
        tenantId: access.tenantId,
        userId: access.userId,
        captureId: await captureIdOf(params),
        locale: localeOf(request),
        ifMatch: match.ifMatch,
        originClientInstanceId,
        by: access.device ? "device" : "web",
      }),
    );
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
