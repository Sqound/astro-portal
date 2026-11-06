import { planReadV1Access } from "../../../../lib/v1/access.js";
import {
  planResourceFailure,
  requirePlanResourceService,
} from "../../../../lib/v1/plan-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * A paired device or an authenticated web session may enumerate its plans.
 * `?filter=to_execute|executed|abandoned|archived` is the main filter of the
 * list (`planMatchesListFilter`); absent, every plan.
 */
export async function GET(request) {
  const access = await planReadV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requirePlanResourceService()
      ).list({
        tenantId: access.tenantId,
        filter: new URL(request.url).searchParams.get("filter"),
      }),
    );
  } catch (error) {
    return planResourceFailure(error);
  }
}
