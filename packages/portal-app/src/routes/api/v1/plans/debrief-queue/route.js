import { eitherV1Access } from "../../../../../lib/v1/access.js";
import {
  debriefFailure,
  requireDebriefService,
} from "../../../../../lib/v1/debrief-service.js";
import { v1Json } from "../../../../../lib/v1/response.js";

/**
 * GET /v1/plans/debrief-queue — the nights waiting for an answer
 * (api/v1.md, "The debrief queue"). Catches up any plan whose night
 * boundaries were never resolved first, then returns every `active`,
 * non-frozen plan whose `nightEndAt` has passed. An empty queue is `200`,
 * not an error, and the queue is never truncated: several pending nights
 * come back together.
 */
export async function GET(request) {
  const access = await eitherV1Access(request);
  if (access.response) return access.response;
  try {
    const result = await (
      await requireDebriefService()
    ).queue({ tenantId: access.tenantId });
    return v1Json(result);
  } catch (error) {
    return debriefFailure(error);
  }
}
