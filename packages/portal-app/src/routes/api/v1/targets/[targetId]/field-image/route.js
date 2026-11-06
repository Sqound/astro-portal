import { eyepieceViewConstants } from "planner/eyepiece-view.js";
import {
  targetFieldImageService,
  targetFieldImagesEnabled,
} from "portal/target-field-image/service.js";
import { v1Error } from "../../../../../../lib/v1/response.js";
import { targetKnowledgeFor } from "../../../../../../lib/target-library.server.js";

// The field image of a target (EYEPIECE-FIELD-01): the survey around it at
// an eyepiece's true field, cut, processed and kept by the portal
// (`portal/target-field-image/service.js`), served immutable. `fov` is one
// of the fields the shared rule asks for (`fieldImage.fieldsDegrees` of
// `eyepiece-view-constants.json`), nothing else: the cache stays bounded and
// shared. No device authentication: like the thumbnails, nothing here is
// personal. An image nobody could cut answers 503 and the application keeps
// the target's thumbnail.

const targetIdPattern = /^[a-z0-9][a-z0-9 .:_-]{0,199}$/i;
const immutable = "public, max-age=31536000, immutable";
const fields = new Map(
  eyepieceViewConstants.fieldImage.fieldsDegrees.map((field) => [
    String(field),
    field,
  ]),
);

function failure(status, code, message, headers = {}) {
  const response = v1Error(Object.assign(new Error(message), { code, status }));
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}

/** The target's direction in degrees, or `null`. */
export function targetFieldImageDirection(knowledge) {
  const ra = Number(knowledge?.coordinate?.ra);
  const dec = Number(knowledge?.coordinate?.dec);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  if (Math.abs(dec) > 90) return null;
  const degrees = knowledge.coordinateUnit === "degrees" ? ra : ra * 15;
  const wrapped = degrees % 360;
  return { raDegrees: wrapped < 0 ? wrapped + 360 : wrapped, decDegrees: dec };
}

export async function GET(request, { params }) {
  if (!targetFieldImagesEnabled())
    return failure(
      404,
      "target_field_image_disabled",
      "Field images are disabled on this portal.",
    );
  const { targetId } = await params;
  const id = decodeURIComponent(targetId || "").trim();
  const field = fields.get(new URL(request.url).searchParams.get("fov") ?? "");
  if (!targetIdPattern.test(id))
    return failure(404, "target_not_found", "Target was not found.");
  if (field === undefined)
    return failure(
      400,
      "target_field_image_field_invalid",
      "The field must be one of the fields the eyepiece view asks for.",
    );
  let knowledge;
  try {
    knowledge = await targetKnowledgeFor({ id }, "en");
  } catch {
    return failure(
      503,
      "target_library_unavailable",
      "The target library is unavailable.",
      { "Retry-After": "60" },
    );
  }
  const direction =
    knowledge && knowledge.catalogue !== "Système solaire"
      ? targetFieldImageDirection(knowledge)
      : null;
  if (!direction)
    return failure(404, "target_not_found", "Target was not found.");

  const result = await targetFieldImageService().ensure({
    targetId: knowledge.id || id,
    ...direction,
    fieldDegrees: field,
  });
  if (result.status !== "ready")
    return failure(
      503,
      "target_field_image_unavailable",
      "The survey could not be reached for this field.",
      { "Retry-After": String(result.retryAfterSeconds || 60) },
    );
  if (request.headers.get("if-none-match") === result.etag)
    return new Response(null, {
      status: 304,
      headers: { ETag: result.etag, "Cache-Control": immutable },
    });
  return new Response(request.method === "HEAD" ? null : result.bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(result.bytes.length),
      "Cache-Control": immutable,
      ETag: result.etag,
    },
  });
}

export const HEAD = GET;
