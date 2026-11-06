import { deviceV1Access } from "../../../../lib/v1/access.js";
import {
  planResourceFailure,
  requirePlanResourceService,
} from "../../../../lib/v1/plan-resource-service.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";
import { enabledServiceExtension } from "../../../../lib/service-extensions.js";

/**
 * `GET /v1/entitlements`: the answer of a private server is
 * `{ purchases: [], capabilities }` — no purchase, and the capabilities the
 * entitlement provider gives the device's person (`GET /v1/capabilities`'s
 * own), never `serviceAdministrator`. The route stays on every server: the
 * applications read it as the standing of the space, and a 404 would be taken
 * for a refusal. A composition that keeps accounts' purchases registers
 * `entitlements.read` and answers in its place.
 */
export async function GET(request) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;

  const extension = enabledServiceExtension("entitlements.read");
  if (extension) {
    try {
      return v1Json(await extension.read({ userId: access.userId }));
    } catch (error) {
      // A refusal the extension names (its storage unavailable, 503);
      // anything else is the server's own failure.
      if (!Number.isInteger(error?.status)) throw error;
      return v1Error(error);
    }
  }
  try {
    const service = await requirePlanResourceService();
    return v1Json({
      purchases: [],
      capabilities: await service.capabilitiesFor(access.userId),
    });
  } catch (error) {
    return planResourceFailure(error);
  }
}
