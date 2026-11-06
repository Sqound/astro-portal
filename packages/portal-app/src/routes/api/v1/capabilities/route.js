import { anonymousOrDeviceV1Access } from "../../../../lib/v1/access.js";
import { capabilitiesOfAccess } from "../../../../lib/v1/access-capabilities.js";
import { planResourceFailure } from "../../../../lib/v1/plan-resource-service.js";
import { v1Json } from "../../../../lib/v1/response.js";

/**
 * Returns the fully composed neutral capability profile of the paired
 * user, or of a device with no space by its anonymous bearer: the purchases
 * it proved.
 */
export async function GET(request) {
  // Profile discovery is not plan synchronization, so it only refreshes the
  // device's last-seen timestamp.
  const access = await anonymousOrDeviceV1Access(request, {
    synchronize: false,
  });
  if (access.response) return access.response;
  try {
    return v1Json(await capabilitiesOfAccess(access));
  } catch (error) {
    return planResourceFailure(error);
  }
}
