import { requirePlanResourceService } from "./plan-resource-service.js";

/**
 * The capabilities of whoever an access names: a device with no
 * space by the purchases it proved (`anonymousDeviceId`), else the person of
 * the space's device or web session (`userId`). The plan service carries the
 * entitlement provider, so that both read the one rule.
 * Throws as `requirePlanResourceService` does (`planResourceFailure`).
 */
export async function capabilitiesOfAccess(access) {
  const service = await requirePlanResourceService();
  if (access?.anonymousDeviceId)
    return await service.capabilitiesForAnonymousDevice(
      access.anonymousDeviceId,
    );
  return await service.capabilitiesFor(access?.userId ?? null);
}
