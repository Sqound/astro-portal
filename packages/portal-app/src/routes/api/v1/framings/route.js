import { deviceOrSessionReadV1Access } from "../../../../lib/v1/access.js";
import {
  framingResourceFailure,
  requireFramingResourceService,
} from "../../../../lib/v1/framing-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/** A paired device or an authenticated web session may list its account's
 * framings (archived included, deleted excluded). */
export async function GET(request) {
  const access = await deviceOrSessionReadV1Access(request);
  if (access.response) return access.response;
  try {
    return v1Json(
      await (
        await requireFramingResourceService()
      ).list({ tenantId: access.tenantId }),
    );
  } catch (error) {
    return framingResourceFailure(error);
  }
}
