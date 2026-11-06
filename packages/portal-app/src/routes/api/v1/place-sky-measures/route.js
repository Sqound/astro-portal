import { readJsonBody } from "portal/api/json-body.js";
import { validatePlaceSkyMeasureUpload } from "portal/persistence/place-sky-measure-repository.js";
import { placeSkyMeasureRepository } from "../../../../lib/place-sky-measure-repository.server.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../lib/v1/response.js";

// One night's value and its evidence: a few hundred bytes.
const BODY_LIMIT_BYTES = 4 * 1024;

const storageUnavailable = () =>
  Object.assign(new Error("Sky measure storage is unavailable."), {
    code: "sky_measure_storage_unavailable",
    status: 503,
  });

/**
 * `POST /v1/place-sky-measures`: Astro Sync sends the night's measured
 * sky background — one number, the number of poses, the method version,
 * the median instant, the session and the frames' site — and the service
 * files it under the account's place and night, replacing an earlier
 * value of the same place and night. Free: no capability is asked for
 * (the analysis upload, `analysis.logs`, is another route). A device
 * bearer, or a web session with its CSRF token. `201` a new value, `200`
 * a replaced one; `400` `invalid_request`; `404` `session_not_found`;
 * `422` `place_not_found`.
 */
export async function POST(request) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let upload;
  try {
    upload = validatePlaceSkyMeasureUpload(
      await readJsonBody(request, { limit: BODY_LIMIT_BYTES }),
    );
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON sky measure is required.",
      status: 400,
    });
  }
  try {
    const repository = await placeSkyMeasureRepository();
    if (!repository) throw storageUnavailable();
    const recorded = await repository.record({
      tenantId: access.tenantId,
      upload,
      originClientInstanceId: clientInstanceIdFrom(request),
    });
    return v1Json(recorded, { status: recorded.replaced ? 200 : 201 });
  } catch (error) {
    return v1Error(error, {
      code: "sky_measure_storage_unavailable",
      message: "The sky measure could not be recorded.",
      status: 503,
    });
  }
}

/**
 * `GET /v1/place-sky-measures[?placeId=…]`: the account's measured values,
 * by place, newest night first, with the number of poses and the method
 * version. Free, like the upload. A device bearer or a web session.
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  const placeId = new URL(request.url).searchParams.get("placeId");
  if (placeId !== null && (!placeId.trim() || placeId.length > 200))
    return v1Json(
      {
        error: {
          code: "invalid_request",
          message: "placeId must name one of your places.",
        },
      },
      { status: 400 },
    );
  try {
    const repository = await placeSkyMeasureRepository();
    if (!repository) throw storageUnavailable();
    return v1Json(
      await repository.list({ tenantId: access.tenantId, placeId }),
    );
  } catch (error) {
    return v1Error(error, {
      code: "sky_measure_storage_unavailable",
      message: "Sky measures are unavailable.",
      status: 503,
    });
  }
}
