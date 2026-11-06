import {
  clientInstanceIdFrom,
  webSessionV1Access,
} from "../../../../../../../../lib/v1/access.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../../../lib/v1/owner-capture-service.js";
import { ifMatchOf } from "../../../../../../../../lib/v1/if-match.js";
import { v1Json } from "../../../../../../../../lib/v1/response.js";

const captureIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.captureId || "");
  } catch {
    return "";
  }
};

/**
 * POST /v1/manage/captures/{id}/acquisition/sync
 * (« Synchroniser avec la session »): fills the lines of « Intégrations » of
 * the capture from its session and its targets (the measured steps of Astro
 * Sync's analysis, else one declared line per target from the debriefing or
 * the events), replaces the uncorrected lines of origin `session`, `night`
 * and `astro-sync`, keeps those of origin `owner` and `import` and every line
 * corrected by hand. A web session with its CSRF token, no body; answers
 * `{ acquisition, capture }`. `409 capture_without_session`,
 * `403 entitlement_read_only`, `404 capture_not_found`. The image of a
 * multi-night plan is filled from the sessions it combines;
 * `If-Match: "<revision>"` (optional) refuses with `409 capture_conflict`
 * when a line changed after it; the device's counterpart is
 * `POST /v1/captures/{id}/acquisition/sync` (one function, two routes).
 */
export async function POST(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
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
        by: "web",
      }),
    );
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
