import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionReadV1Access,
  deviceOrSessionWriteV1Access,
} from "../../../../../lib/v1/access.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../lib/v1/owner-capture-service.js";
import { ifMatchOf } from "../../../../../lib/v1/if-match.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";

const captureIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.captureId || "");
  } catch {
    return "";
  }
};

/**
 * GET /v1/captures/{id}: one capture of the space, as its owner reads it in
 * « Mon espace » (the resource of `GET /v1/manage/captures/{id}`: its state,
 * its detail, the place included, and `variants[]`, its images, the main one
 * first). A device token or the web session; another space's capture is
 * 404.
 */
export async function GET(request, { params }) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    const service = await requireOwnerCaptureService();
    return v1Json({
      capture: await service.get({
        tenantId: access.tenantId,
        userId: access.userId,
        captureId: await captureIdOf(params),
        locale: localeOf(request),
      }),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}

/**
 * PATCH /v1/captures/{id}: a device
 * changes the stage (`{ "stage": "draft" | "finalized" }`), one field of
 * the capture's metadata as its owner's hand on the phone
 * (`{ "metadata": { <field>: value } }`: the title, the description, the
 * notes, the acquisition lines, the calibration; the rest
 * `403 web_session_required`), or proposes values as a producer
 * (`{ "proposed": { "source": "astro-sync" | "import", … } }`, answered
 * with `skipped`); the visibility is the web's (`403 visibility_web_only`
 * from a device). The web session (with its CSRF token) changes the stage,
 * the visibility, or both (the stage first), or one field of the metadata,
 * under the rules of `PATCH /v1/manage/captures/{id}`. Answers the capture
 * as `GET` gives it.
 *
 * A device also writes `{ qualityPrivate: boolean }` and
 * `{ qualityPublic: boolean }`, the owner's two switches « Afficher la
 * qualité en privé » / « … en public » (one per request, like the tags).
 *
 * A device also writes the tags and, in `metadata`, the fields of
 * `deviceMetadataField` (not the capture's session). The request carries
 * `If-Match: "<revision>"` (optional): it is refused with
 * `409 capture_conflict` only if the field it writes changed after that
 * revision. One change per request.
 */
export async function PATCH(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  let changes;
  try {
    changes = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "The body is a JSON object.",
      status: 400,
    });
  }
  const body =
    changes && typeof changes === "object" && !Array.isArray(changes)
      ? changes
      : {};
  const keys = Object.keys(body);
  if (access.device && keys.includes("visibility"))
    return v1Error(null, {
      code: "visibility_web_only",
      message:
        "A device does not change the visibility of a capture: it is changed from the web.",
      status: 403,
    });
  const alone =
    keys.includes("metadata") ||
    keys.includes("proposed") ||
    keys.includes("tags") ||
    keys.includes("qualityPrivate") ||
    keys.includes("qualityPublic");
  const allowed = access.device
    ? [
        "stage",
        "metadata",
        "proposed",
        "tags",
        "qualityPrivate",
        "qualityPublic",
      ]
    : [
        "stage",
        "visibility",
        "metadata",
        "tags",
        "qualityPrivate",
        "qualityPublic",
      ];
  if (
    !keys.length ||
    keys.some((key) => !allowed.includes(key)) ||
    (alone && keys.length !== 1)
  )
    return v1Error(null, {
      code: "invalid_request",
      message: access.device
        ? "Send stage, { tags }, { qualityPrivate }, { qualityPublic }, { metadata } or { proposed }."
        : "Send stage and/or visibility, or { tags }, { qualityPrivate }, { qualityPublic } or { metadata }.",
      status: 400,
    });
  const match = ifMatchOf(request);
  const originClientInstanceId = clientInstanceIdFrom(request) || null;
  if (match.response) return match.response;
  try {
    const service = await requireOwnerCaptureService();
    const common = {
      tenantId: access.tenantId,
      userId: access.userId,
      captureId: await captureIdOf(params),
      locale: localeOf(request),
    };
    const by = access.device ? "device" : "web";
    if (keys[0] === "proposed")
      return v1Json(
        await service.proposeMetadata({ ...common, proposed: body.proposed }),
      );
    if (keys[0] === "metadata")
      return v1Json({
        capture: await service.updateMetadata({
          ...common,
          metadata: body.metadata,
          by,
          ifMatch: match.ifMatch,
          originClientInstanceId,
        }),
      });
    if (
      keys[0] === "tags" ||
      keys[0] === "qualityPrivate" ||
      keys[0] === "qualityPublic"
    )
      return v1Json({
        capture: await service.update({
          ...common,
          changes: { [keys[0]]: body[keys[0]] },
          by,
          ifMatch: match.ifMatch,
          originClientInstanceId,
        }),
      });
    let capture = null;
    for (const key of ["stage", "visibility"])
      if (body[key] !== undefined)
        capture = await service.update({
          ...common,
          changes: { [key]: body[key] },
          by,
          ifMatch: match.ifMatch,
          originClientInstanceId,
        });
    return v1Json({ capture });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
