import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  deviceOrSessionWriteV1Access,
} from "../../../../../../../lib/v1/access.js";
import { ifMatchOf } from "../../../../../../../lib/v1/if-match.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../../lib/v1/owner-capture-service.js";
import { v1Error, v1Json } from "../../../../../../../lib/v1/response.js";

const idsOf = async (params) => {
  try {
    const found = await params;
    return {
      captureId: decodeURIComponent(found?.captureId || ""),
      imageId: decodeURIComponent(found?.imageId || ""),
    };
  } catch {
    return { captureId: "", imageId: "" };
  }
};

/**
 * PATCH /v1/captures/{id}/variants/{imageId}, by a device token, two gestures
 * on an image that exists:
 *
 * - the owner's hand, on the phone — `{ "title"?, "description"? }`, one or
 *   both, a string or `null` (a blank or `null` gives the generated text, else
 *   the name by default, back; 90 and 280 characters at most), with no
 *   `source`: it overwrites what is there, the owner's own texts included, and
 *   is judged against the capture's revision as the other fields are
 *   (`If-Match: "<revision>"`, optional; `409 capture_conflict`, `field:
 *   "imageTexts"`, `line`: the image, only if the texts of that image changed
 *   after it); the bounds and the refusals are those of
 *   `PATCH /v1/manage/captures/{id}/variants/{imageId}`. Answers `{ capture,
 *   skipped: [] }`;
 * - a producer's proposal — `{ "title"?, "description"?, … , "source":
 *   "astro-sync" | "import" }` —: never over an image whose texts the owner
 *   wrote (`skipped`), the same body twice changes nothing. `processing`
 *   (`{ software?, steps? }`) is what made *this* image: kept with it, and
 *   shown by the capture while the image is its main one. Answers `{
 *   capture, skipped }`.
 *
 * The main image, the visibility and the deletion stay on
 * `PATCH /v1/manage/captures/{id}/variants/{imageId}`, from the web session: a
 * device naming them is refused (`403 web_session_required`;
 * `visibility_web_only` for `public`). A web session here is refused too: its
 * gestures are the manage route's.
 */
export async function PATCH(request, { params }) {
  const access = await deviceOrSessionWriteV1Access(request);
  if (access.response) return access.response;
  if (!access.device)
    return v1Error(null, {
      code: "device_required",
      message:
        "This route takes a producer's proposals; the owner names an image on PATCH /v1/manage/captures/{id}/variants/{imageId}.",
      status: 403,
    });
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
  if (keys.includes("public"))
    return v1Error(null, {
      code: "visibility_web_only",
      message:
        "A device does not change the visibility of an image: it is changed from the web.",
      status: 403,
    });
  // No `source`: the owner's hand, on the phone — only the title and the
  // description of the image.
  const owner =
    keys.length > 0 &&
    body.source === undefined &&
    keys.every((key) => ["title", "description"].includes(key));
  if (
    keys.includes("main") ||
    (keys.length && body.source === undefined && !owner)
  )
    return v1Error(null, {
      code: "web_session_required",
      message:
        "The owner's names of an image and its main image are changed from the web; a device proposes with a source.",
      status: 403,
    });
  const text = (value) =>
    value === undefined || value === null || typeof value === "string";
  if (owner) {
    if (
      !keys.every((key) => body[key] === null || typeof body[key] === "string")
    )
      return v1Error(null, {
        code: "invalid_request",
        message:
          "Send { title } or { description } (or both): a string or null.",
        status: 400,
      });
    const match = ifMatchOf(request);
    if (match.response) return match.response;
    try {
      const service = await requireOwnerCaptureService();
      return v1Json({
        capture: await service.setVariantText({
          tenantId: access.tenantId,
          userId: access.userId,
          ...(await idsOf(params)),
          texts: Object.fromEntries(keys.map((name) => [name, body[name]])),
          by: "device",
          ifMatch: match.ifMatch,
          originClientInstanceId: clientInstanceIdFrom(request) || null,
          locale: localeOf(request),
        }),
        skipped: [],
      });
    } catch (error) {
      return ownerCaptureFailure(error);
    }
  }
  if (
    !keys.every((key) =>
      [
        "title",
        "description",
        "generatedTitle",
        "generatedDescription",
        "processing",
        "source",
        "imageQuality",
      ].includes(key),
    ) ||
    !text(body.title) ||
    !text(body.description) ||
    (body.title === undefined &&
      body.description === undefined &&
      body.generatedTitle === undefined &&
      body.generatedDescription === undefined &&
      body.processing === undefined &&
      body.imageQuality === undefined)
  )
    return v1Error(null, {
      code: "invalid_request",
      message:
        "Send { title?, description?, generatedTitle?, generatedDescription?, processing?, imageQuality?, source }.",
      status: 400,
    });
  // The quality of a stacked image is a producer's measure; the phone (the
  // planner's token) never sends it.
  if (
    body.imageQuality !== undefined &&
    access.device.application === "planner"
  )
    return v1Json(
      {
        error: {
          code: "invalid_metadata",
          message:
            "The phone does not send the quality of an image: Astro Sync measures it.",
          field: "imageQuality",
          limit: null,
        },
      },
      { status: 400 },
    );
  try {
    const service = await requireOwnerCaptureService();
    return v1Json(
      await service.proposeVariantText({
        tenantId: access.tenantId,
        userId: access.userId,
        ...(await idsOf(params)),
        source: body.source,
        title: body.title,
        description: body.description,
        generatedTitle: body.generatedTitle,
        generatedDescription: body.generatedDescription,
        processing: body.processing,
        imageQuality: body.imageQuality,
        locale: localeOf(request),
      }),
    );
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
