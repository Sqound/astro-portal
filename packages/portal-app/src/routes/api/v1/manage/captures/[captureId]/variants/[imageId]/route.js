import { readJsonBody } from "portal/api/json-body.js";
import { webSessionV1Access } from "../../../../../../../../lib/v1/access.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../../../lib/v1/owner-capture-service.js";
import { v1Error, v1Json } from "../../../../../../../../lib/v1/response.js";

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
 * PATCH /v1/manage/captures/{id}/variants/{imageId}: exactly one of `{ "main": true }`
 * (« Utiliser comme image principale »: this image becomes the capture's
 * main image; the former one becomes a variant and keeps its visibility) or
 * `{ "public": true | false }` (a variant's own visibility) — and
 * `{ "title": string | null }` (90 characters at most) or
 * `{ "description": string | null }` (280 at most),
 * the owner's names of an image, `null` or blank for « by default » — and,
 * both together (`title_source: owner`, `edited_at`; a producer never changes them
 * afterwards). The owner's web session with its CSRF token only; a device bearer is
 * refused (`web_session_required`). Answers the capture as
 * `GET /v1/manage/captures/{id}` gives it.
 */
export async function PATCH(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
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
  const text = (value) => value === null || typeof value === "string";
  // The title and the description of an image together, in one
  // request, or one of them.
  const texts =
    keys.length >= 1 &&
    keys.length <= 2 &&
    keys.every((key) => ["title", "description"].includes(key)) &&
    keys.every((key) => text(body[key]));
  const valid =
    texts ||
    (keys.length === 1 &&
      ((keys[0] === "main" && body.main === true) ||
        (keys[0] === "public" && typeof body.public === "boolean")));
  if (!valid)
    return v1Error(null, {
      code: "invalid_request",
      message:
        "Send exactly one of { main: true }, { public: boolean }, or { title, description } (one or both).",
      status: 400,
    });
  try {
    const service = await requireOwnerCaptureService();
    const common = {
      tenantId: access.tenantId,
      userId: access.userId,
      ...(await idsOf(params)),
      locale: localeOf(request),
    };
    const [key] = keys;
    return v1Json({
      capture:
        key === "main"
          ? await service.setMainImage(common)
          : key === "public"
            ? await service.setVariantPublic({ ...common, shown: body.public })
            : await service.setVariantText({
                ...common,
                texts: Object.fromEntries(
                  keys.map((name) => [name, body[name]]),
                ),
              }),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}

/**
 * DELETE /v1/manage/captures/{id}/variants/{imageId}: a variant and its
 * files; `409 main_image` for the main image (never deleted alone, nor
 * therefore the last image). Answers the capture.
 */
export async function DELETE(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const service = await requireOwnerCaptureService();
    return v1Json({
      capture: await service.deleteVariant({
        tenantId: access.tenantId,
        userId: access.userId,
        ...(await idsOf(params)),
        locale: localeOf(request),
      }),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
