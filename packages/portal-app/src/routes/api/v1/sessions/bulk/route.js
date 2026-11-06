import { readJsonBody } from "portal/api/json-body.js";
import {
  clientInstanceIdFrom,
  eitherV1WriteAccess,
} from "../../../../../lib/v1/access.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { createSessionsInBulk } from "../../../../../lib/v1/session-bulk-service.js";

/**
 * POST /v1/sessions/bulk — « Créer … » of Astro Sync's « Détecter les
 * sessions » (`session-bulk.schema.json`): the places, the plans of one
 * night, the sessions « Exécutée » marked imported (`origin: "astro-sync"`),
 * the targets added to existing sessions through the rework and the
 * multi-night plans « Terminé », in one idempotent call
 * (`lib/v1/session-bulk-service.js`). `200` with the result of every element,
 * a refused element `skipped` with its code; `400 invalid_request` (nothing
 * written) for a body that cannot be read. Either credential; a cookie
 * session carries the CSRF token.
 */
export async function POST(request) {
  const access = await eitherV1WriteAccess(request);
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request, { limit: 2 * 1024 * 1024 });
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "A JSON bulk creation is required.",
      status: 400,
    });
  }
  try {
    return v1Json(
      await createSessionsInBulk({
        tenantId: access.tenantId,
        userId: access.userId,
        deviceId: access.deviceId ?? null,
        originClientInstanceId: clientInstanceIdFrom(request),
        body,
      }),
    );
  } catch (error) {
    if (error?.body && Number.isInteger(error?.status))
      return v1Json(error.body, { status: error.status });
    return v1Error(error, {
      code: "observation_session_storage_unavailable",
      message: "Session storage is unavailable.",
      status: 503,
    });
  }
}
