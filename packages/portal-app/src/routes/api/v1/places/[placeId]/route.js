import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  placeResourceFailure,
  requirePlaceResourceService,
} from "../../../../../lib/v1/place-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";
import { placeBodyWithTimeZone } from "../../../../../lib/v1/place-time-zone.js";

export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { placeId } = await params;
    return v1Json(
      await (
        await requirePlaceResourceService()
      ).get({ tenantId: access.tenantId, placeId }),
    );
  } catch (error) {
    return placeResourceFailure(error);
  }
}

/**
 * `PUT` writes the whole place with the instant of the gesture
 * (`editedAt`): `201` when it created it, `200` otherwise, `applied: false`
 * with what the service keeps when the write is not the most recent —
 * never a conflict error (v1.md, « Places »).
 */
export async function PUT(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON place is required.",
      status: 400,
    });
  }
  const { placeId } = await params;
  try {
    const result = await (
      await requirePlaceResourceService()
    ).write({
      tenantId: access.tenantId,
      userId: access.userId,
      placeId,
      body: placeBodyWithTimeZone(body),
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(
      { place: result.place, applied: result.applied },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return placeResourceFailure(error);
  }
}

/**
 * `DELETE …?at=<instant>` deletes the place unless it was edited after
 * `at` (`{ deleted: false, place }`); `409 place_in_use` names the plans to
 * execute that still use it.
 */
export async function DELETE(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { placeId } = await params;
    return v1Json(
      await (
        await requirePlaceResourceService()
      ).remove({
        tenantId: access.tenantId,
        userId: access.userId,
        placeId,
        at: new URL(request.url).searchParams.get("at"),
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return placeResourceFailure(error);
  }
}
