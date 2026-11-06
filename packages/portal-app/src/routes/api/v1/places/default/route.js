import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  placeResourceFailure,
  requirePlaceResourceService,
} from "../../../../../lib/v1/place-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

/**
 * `PUT /v1/places/default` `{ placeId | null, editedAt }`: the space's
 * default place, under the rule of the most recent edit. Read with the
 * list (`GET /v1/places`).
 */
export async function PUT(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON { placeId, editedAt } is required.",
      status: 400,
    });
  }
  try {
    return v1Json(
      await (
        await requirePlaceResourceService()
      ).setDefault({
        tenantId: access.tenantId,
        userId: access.userId,
        body,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return placeResourceFailure(error);
  }
}
