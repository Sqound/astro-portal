import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  framingResourceFailure,
  requireFramingResourceService,
} from "../../../../../lib/v1/framing-resource-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { readJsonBody } from "portal/api/json-body.js";

export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const { framingId } = await params;
    return v1Json(
      await (
        await requireFramingResourceService()
      ).get({ tenantId: access.tenantId, framingId }),
    );
  } catch (error) {
    return framingResourceFailure(error);
  }
}

/**
 * `PUT` creates (`If-Match: "0"`) or updates a framing at exactly the
 * revision named. `409 framing_conflict`/`framing_locked`/`framing_archived`
 * carry the server's current `framing` in the body: the client turns that
 * into a new, unattached library copy rather than ever discarding its own
 * version.
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
      message: "A JSON framing request is required.",
      status: 400,
    });
  }
  const { framingId } = await params;
  try {
    const result = await (
      await requireFramingResourceService()
    ).write({
      tenantId: access.tenantId,
      userId: access.userId,
      framingId,
      ifMatch: request.headers.get("if-match"),
      name: body?.name,
      payload: body?.payload,
      originDeviceId: access.deviceId,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(result.resource, { status: result.created ? 201 : 200 });
  } catch (error) {
    return framingResourceFailure(error);
  }
}

/**
 * `DELETE` on a `free` framing removes it (`204`); on a `locked` one it
 * archives it instead (`200 { archived: true, framing }`); on a `shared` one
 * it refuses `409 framing_in_use` naming the still-referencing pending
 * plans, for the client to retire before replaying the deletion.
 */
export async function DELETE(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  try {
    const { framingId } = await params;
    const result = await (
      await requireFramingResourceService()
    ).remove({
      tenantId: access.tenantId,
      userId: access.userId,
      framingId,
      ifMatch: request.headers.get("if-match"),
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    if (!result)
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    return v1Json(result, { status: 200 });
  } catch (error) {
    return framingResourceFailure(error);
  }
}
