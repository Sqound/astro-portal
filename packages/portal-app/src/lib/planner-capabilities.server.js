import { capabilitiesWithoutDatabase } from "./v1/entitlement-provider.js";
import { planResourceService } from "./v1/plan-resource-service.js";

/**
 * The capabilities the planner page is rendered with: the person's real
 * ones, from the entitlement provider the v1 API itself enforces —
 * `GET /v1/capabilities` answers the same map. A private server serves its
 * open-source profile, for its owner and its visitors alike; where a
 * composition registers a provider, a visitor who is not signed in gets the
 * free account's capabilities, and a signed-in person those of their
 * purchases.
 */
export async function plannerCapabilitiesForSession(session) {
  const service = await planResourceService();
  if (service) return await service.capabilitiesFor(session?.user_id ?? null);
  return capabilitiesWithoutDatabase();
}

/**
 * Whether the signed-in person is in the read-only window of an ended
 * subscription: what they created stays visible, nothing is created nor
 * changed. Asked of the plan service, whose provider is the one that
 * answered `capabilitiesFor` above (`writeRightsFor`, the rights every plan
 * write carries: the one answer, never re-derived). A visitor, a private
 * server and a service without a database never are.
 */
export async function plannerReadOnlyWindowForSession(session) {
  const userId = session?.user_id ?? null;
  if (!userId) return false;
  const service = await planResourceService();
  if (!service) return false;
  return (await service.writeRightsFor(userId)).readOnly === true;
}
