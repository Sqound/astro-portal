import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  webSessionV1Access,
} from "../../../../../../lib/v1/access.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../../lib/v1/owner-capture-service.js";
import { ifMatchOf } from "../../../../../../lib/v1/if-match.js";
import { v1Error, v1Json } from "../../../../../../lib/v1/response.js";
import { serverFeatures } from "../../../../../../lib/plate-solving.server.js";

const captureIdOf = async (params) => {
  try {
    return decodeURIComponent((await params)?.captureId || "");
  } catch {
    return "";
  }
};

/** GET /v1/manage/captures/{id}: one capture of the space, as the list gives it. */
export async function GET(request, { params }) {
  const access = await webSessionV1Access(request);
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
      // What this server does by itself (`sky.solve_on_server`).
      serverFeatures: serverFeatures(),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}

/**
 * PATCH /v1/manage/captures/{id} `{ visibility }` · `{ requestReview: true }`
 * · `{ acceptVerification: true }` · `{ skyAnnotations: boolean }` ·
 * `{ qualityPrivate: boolean }` · `{ qualityPublic: boolean }`: the owner's
 * « Privée » / « Publique », « Demander une vérification », « Accepter la
 * vérification », « Afficher le plate solving ». The rule is the server's:
 * one refusal code per reason (`capture.schema.json`'s manage answers,
 * api/v1.md). A web session with its CSRF token only.
 */
export async function PATCH(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  // The body is read under the common ceiling: past it, 413
  // `payload_too_large`; not JSON, 400.
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
  // `If-Match: "<revision>"`, optional; one change per call.
  const match = ifMatchOf(request);
  const originClientInstanceId = clientInstanceIdFrom(request) || null;
  if (match.response) return match.response;
  try {
    const service = await requireOwnerCaptureService();
    return v1Json({
      capture: await service.update({
        tenantId: access.tenantId,
        userId: access.userId,
        captureId: await captureIdOf(params),
        changes,
        locale: localeOf(request),
        ifMatch: match.ifMatch,
        originClientInstanceId,
      }),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}

/** DELETE /v1/manage/captures/{id}: « Supprimer la capture », its bytes included. */
export async function DELETE(request, { params }) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  try {
    const service = await requireOwnerCaptureService();
    await service.remove({
      tenantId: access.tenantId,
      captureId: await captureIdOf(params),
    });
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
