import {
  clientInstanceIdFrom,
  deviceV1Access,
} from "../../../../../../../../lib/v1/access.js";
import {
  planResourceFailure,
  requirePlanResourceService,
} from "../../../../../../../../lib/v1/plan-resource-service.js";
import { v1Json } from "../../../../../../../../lib/v1/response.js";

/** Restoring a set-aside version is a paired-device synchronization write. */
export async function POST(request, { params }) {
  const access = await deviceV1Access(request);
  if (access.response) return access.response;
  try {
    const { planId, versionId } = await params;
    return v1Json(
      await (
        await requirePlanResourceService()
      ).restore({
        tenantId: access.tenantId,
        userId: access.userId,
        planId,
        versionId,
        originClientInstanceId: clientInstanceIdFrom(request),
      }),
    );
  } catch (error) {
    return planResourceFailure(error);
  }
}
