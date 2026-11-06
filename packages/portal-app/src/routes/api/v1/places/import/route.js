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
 * `POST /v1/places/import` `{ places }`: what a phone or a browser kept
 * without a space, sent once (at the pairing, at the first sign-in). Each
 * place keeps its own id; an id the space holds is never changed
 * (`{ id, created: false }`), so a replay changes nothing.
 */
export async function POST(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: 2 * 1024 * 1024 });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON { places } of 200 places at most is required.",
      status: 400,
    });
  }
  try {
    return v1Json(
      await (
        await requirePlaceResourceService()
      ).importPlaces({
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
