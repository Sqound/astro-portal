import { deviceOrSessionReadV1Access } from "../../../../lib/v1/access.js";
import {
  placeResourceFailure,
  requirePlaceResourceService,
} from "../../../../lib/v1/place-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * `GET /v1/places`: a paired device
 * or a web session reads the places of its space, the deleted ones absent,
 * each with its usage, and the space's default place. The other routes of
 * `/v1/places/…` (`known`, `search`, `suggested`, `resolve`, `extract`) are
 * reference data, static segments the place's id never meets.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requirePlaceResourceService()
      ).list({ tenantId: access.tenantId }),
    );
  } catch (error) {
    return placeResourceFailure(error);
  }
}
