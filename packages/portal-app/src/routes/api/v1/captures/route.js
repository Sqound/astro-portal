import {
  captureCallerOf,
  deviceOrSessionReadV1Access,
} from "../../../../lib/v1/access.js";
import {
  requireUploadResourceService,
  uploadResourceFailure,
} from "../../../../lib/v1/upload-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * The private "My Captures" list (api/v1.md, "Additive routes awaiting
 * approval"). Deliberately not capability-gated: a profile that cannot
 * upload simply has no captures, so this route never refuses, it can only
 * return an empty page. `?targetId=` filters to captures that contain that
 * target; `?skySolution=missing` to the captures whose main image has no
 * sky solution, whatever device or page sent them. Each capture carries its
 * visibility and, for its owner, the state of its two checks
 * (`capture.schema.json`, `checks`). Oldest first by default (the
 * synchronisation's reading, `?since=`); `?order=recent` returns the most
 * recent first, walked by `?before=` (Journal F).
 */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  const url = new URL(request.url);
  try {
    const service = await requireUploadResourceService();
    const page = await service.listCaptures({
      tenantId: access.tenantId,
      userId: access.userId,
      since: url.searchParams.get("since") || undefined,
      // `?order=recent` (the most recent first) and its cursor `?before=`.
      order: url.searchParams.get("order") || undefined,
      before: url.searchParams.get("before") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      targetId: url.searchParams.get("targetId") || undefined,
      // `?sessionId=`, the captures of one session.
      sessionId: url.searchParams.get("sessionId") || undefined,
      // `?skySolution=missing`, the captures whose main image has no sky
      // solution (Astro Sync's « Annotations »).
      skySolution: url.searchParams.get("skySolution") ?? undefined,
      caller: captureCallerOf(access),
    });
    return v1Json(page);
  } catch (error) {
    return uploadResourceFailure(error);
  }
}
