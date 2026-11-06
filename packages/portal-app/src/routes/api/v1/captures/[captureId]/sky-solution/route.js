import { readJsonBody } from "portal/api/json-body.js";
import {
  deviceOrSessionReadV1Access,
  deviceV1Access,
  webSessionV1Access,
} from "../../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import {
  captureIdOf,
  requireSkySolutionService,
  skySolutionFailure,
} from "../../../../../../lib/v1/sky-solution-service.js";

// A solution and its digest: a few hundred bytes.
const BODY_LIMIT_BYTES = 4 * 1024;

const imageIdOf = (request) =>
  new URL(request.url).searchParams.get("imageId") || null;

/**
 * GET /v1/captures/{id}/sky-solution: the sky solution of an image of a capture of the space — `?imageId=` a
 * variant, the main image otherwise — with the owner's switch
 * (`sky-solution.schema.json`, `stored`). A device token or the web
 * session; `404 sky_solution_not_found` while the image has none.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requireSkySolutionService()
      ).get({
        tenantId: access.tenantId,
        captureId: await captureIdOf(params),
        imageId: imageIdOf(request),
      }),
    );
  } catch (error) {
    return skySolutionFailure(error);
  }
}

/**
 * PUT /v1/captures/{id}/sky-solution `{ sha256, solution }` (computed by
 * Astro Sync on the person's computer): a
 * device token of the capture's space only. The digest names the image the
 * solution belongs to (the main image or a variant); idempotent by digest:
 * `201` a new solution, `200` the same one again or a replaced one.
 * `409 image_changed` when no image of the capture holds these bytes;
 * `422 sky_solution_aspect_mismatch`; `404 capture_not_found` (another
 * space's capture included).
 */
export async function PUT(request, { params }) {
  const access = await deviceV1Access(request, { synchronize: false });
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: BODY_LIMIT_BYTES });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "The body is a JSON object: { sha256, solution }.",
      status: 400,
    });
  }
  try {
    const written = await (
      await requireSkySolutionService()
    ).put({
      tenantId: access.tenantId,
      captureId: await captureIdOf(params),
      body,
    });
    return v1Json(written, { status: written.created ? 201 : 200 });
  } catch (error) {
    return skySolutionFailure(error);
  }
}

/**
 * DELETE /v1/captures/{id}/sky-solution: the owner deletes the solution of
 * an image (`?imageId=`, the main image otherwise) from the web session,
 * with its CSRF token; never a device.
 */
export async function DELETE(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requireSkySolutionService()
      ).remove({
        tenantId: access.tenantId,
        captureId: await captureIdOf(params),
        imageId: imageIdOf(request),
      }),
    );
  } catch (error) {
    return skySolutionFailure(error);
  }
}
