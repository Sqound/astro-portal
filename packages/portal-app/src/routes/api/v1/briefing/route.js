import { deviceV1Access } from "../../../../lib/v1/access.js";
import {
  planResourceFailure,
  requirePlanResourceService,
} from "../../../../lib/v1/plan-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/** A compact mobile-only snapshot; device authentication marks a sync. */
export async function GET(request) {
  const access = await deviceV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requirePlanResourceService()
      ).briefing({
        tenantId: access.tenantId,
      }),
    );
  } catch (error) {
    return planResourceFailure(error);
  }
}
