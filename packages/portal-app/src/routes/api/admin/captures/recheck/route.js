import { readBodyText } from "portal/api/json-body.js";
import { recheckRefusal } from "portal/captures/capture-processing.js";
import { recordBackendLog } from "../../../../../lib/app-log.server.js";
import { recheckCaptures } from "../../../../../lib/capture-processing.server.js";
import { adminActor } from "../../../../../lib/v1/admin-actor.js";
import { v1Json } from "../../../../../lib/v1/response.js";

const refusal = (code, message, status) =>
  v1Json({ error: { code, message } }, { status });

/**
 * POST /api/admin/captures/recheck `{ tenantId? }`: runs the automatic check
 * again on every image of every space (or of one), after a change of its
 * rule — on a test deployment only, or with
 * `ASTRO_PORTAL_ALLOW_SKY_CHECK_RECHECK=1` (`recheckRefusal`): never on a
 * production deployment by default. Each stored result is forgotten, then the
 * images are queued like the captures left without a result; nothing else
 * of a capture changes. Answers `{ captures, images, queued }`.
 */
export async function POST(request) {
  const actor = await adminActor(request, { write: true });
  if (actor.response) return actor.response;
  const refused = recheckRefusal(process.env);
  if (refused) return refusal("recheck_not_allowed", refused, 403);
  let body = {};
  try {
    const text = await readBodyText(request, { limit: 1024 });
    body = text ? JSON.parse(text) : {};
  } catch {
    return refusal("invalid_request", "The body is JSON: { tenantId? }.", 400);
  }
  const tenantId =
    typeof body?.tenantId === "string" && body.tenantId.trim()
      ? body.tenantId.trim()
      : null;
  const answered = await recheckCaptures({ tenantId });
  if (!answered)
    return refusal("review_unavailable", "The review is unavailable.", 503);
  recordBackendLog({
    level: "info",
    event: "captures.recheck",
    message: "The automatic check runs again on the stored images.",
    context: { ...answered, tenantId, actorUserId: actor.actorUserId },
  });
  return v1Json(answered);
}
