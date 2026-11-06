import { readJsonBody } from "portal/api/json-body.js";
import { webSessionV1Access } from "../../../../../lib/v1/access.js";
import {
  localeOf,
  ownerCaptureFailure,
  requireOwnerCaptureService,
} from "../../../../../lib/v1/owner-capture-service.js";
import { v1Error, v1Json } from "../../../../../lib/v1/response.js";
import { serverFeatures } from "../../../../../lib/plate-solving.server.js";

/**
 * GET /v1/manage/captures: the captures of the space of the web session,
 * newest first, each with its state, its two checks and its detail for the
 * owner (the place included); the storage and its usage, the person's
 * warnings and block on publishing, the names of the space refused by the
 * team, and the server's own features (`serverFeatures`).
 * `?before=<createdAt>,<id>` pages, `?limit=` bounds a page (50, at most
 * 200), `?locale=` names the targets. A web session only.
 */
export async function GET(request) {
  const access = await webSessionV1Access(request);
  if (access.response) return access.response;
  const url = new URL(request.url);
  const [createdAt, id] = (url.searchParams.get("before") || "").split(",");
  try {
    const service = await requireOwnerCaptureService();
    return v1Json({
      ...(await service.list({
        tenantId: access.tenantId,
        userId: access.userId,
        locale: localeOf(request),
        before: createdAt ? { createdAt, id: id || "" } : null,
        limit: url.searchParams.get("limit") || undefined,
      })),
      // What this server does by itself (`sky.solve_on_server`, read from
      // its environment): « Résoudre sur ce serveur » or not.
      serverFeatures: serverFeatures(),
    });
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}

/**
 * POST /v1/manage/captures `{ sessionId?, targetIds? }`: a capture without an
 * image, its definition alone — a private draft of the space; the images come
 * later, from Astro Sync or « Ajouter une image » on its detail. Answers
 * `201 { capture }`. A web session with its CSRF token only;
 * `403 entitlement_read_only` in the read-only window,
 * `409 capture_limit_reached`.
 */
export async function POST(request) {
  const access = await webSessionV1Access(request, { write: true });
  if (access.response) return access.response;
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return v1Error(error, {
      code: "invalid_request",
      message: "The body is a JSON object.",
      status: 400,
    });
  }
  const input =
    body && typeof body === "object" && !Array.isArray(body) ? body : {};
  try {
    const service = await requireOwnerCaptureService();
    return v1Json(
      {
        capture: await service.create({
          tenantId: access.tenantId,
          userId: access.userId,
          sessionId: input.sessionId ?? null,
          targetIds: input.targetIds ?? [],
          locale: localeOf(request),
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return ownerCaptureFailure(error);
  }
}
