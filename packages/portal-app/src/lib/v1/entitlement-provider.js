import {
  isWriteRefused,
  resolveWriteAccess,
  staticProfile,
} from "portal/capabilities/provider.js";
import { OPEN_SOURCE_PROFILE } from "portal/capabilities/profiles.js";
import { databaseDriver } from "portal/persistence/database.js";
import { enabledServiceExtension } from "../service-extensions.js";

/**
 * The capabilities of a private server: the open-source profile
 * (`OPEN_SOURCE_PROFILE`: several plans, the mosaics and the saved framings
 * open (the server never restricts), the analysis of the logs, the progression and the stacking open,
 * resources without a cap), for its owner and its visitors alike. Its person may cap the storage of their
 * own disk: `ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES` (one file) and `ASTRO_PORTAL_STORAGE_QUOTA_BYTES` (all
 * files), each a positive number of bytes; unset, neither has a cap (docs/SELF_HOSTING.md).
 */
export function privateServerCapabilities(env = process.env) {
  const cap = (name) => {
    const value = Number(env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const maxFile = cap("ASTRO_PORTAL_STORAGE_MAX_FILE_BYTES");
  const quota = cap("ASTRO_PORTAL_STORAGE_QUOTA_BYTES");
  return Object.freeze({
    ...OPEN_SOURCE_PROFILE,
    ...(maxFile ? { "storage.max_file_bytes": maxFile } : {}),
    ...(quota ? { "storage.quota_bytes": quota } : {}),
  });
}

/**
 * The `EntitlementProvider` of every resource service (plans, framings,
 * uploads, analyses, session imports): the one a composition registers at
 * `entitlements.provider` while it is on, else the static profile above.
 */
export function entitlementProviderFor(driver) {
  const extension = enabledServiceExtension("entitlements.provider");
  if (extension) return extension.provider(driver);
  return staticProfile(privateServerCapabilities());
}

/**
 * The capabilities of a person the service cannot ask its provider about
 * (a service without a database): a visitor's of the registered provider,
 * else a private server's.
 */
export function capabilitiesWithoutDatabase() {
  const extension = enabledServiceExtension("entitlements.provider");
  return extension?.visitorCapabilities
    ? { ...extension.visitorCapabilities() }
    : { ...privateServerCapabilities() };
}

/**
 * The soft-downgrade write gate for the write routes that have no resource
 * service of their own to carry the provider through — favorites (v1 and web)
 * and the web-only plan-divergence resolve/restore routes. A static profile
 * never enters the read-only window (`resolveWriteAccess`); only a registered
 * provider may.
 */
export async function writeAccessFor(userId) {
  const databasePath = process.env.ASTRO_PORTAL_DATABASE_PATH || null;
  const databaseUrl = process.env.ASTRO_PORTAL_DATABASE_URL || null;
  if (!databasePath && !databaseUrl) return { readOnly: false };
  const driver = databaseDriver({
    ASTRO_PORTAL_DATABASE_PATH: databasePath,
    ASTRO_PORTAL_DATABASE_URL: databaseUrl,
  });
  return resolveWriteAccess(entitlementProviderFor(driver), userId);
}

/**
 * Whether the
 * multi-night plans are open here whatever the person's profile: nothing is
 * registered at `planner.projects` (the open-source composition), or what
 * is registered is off. Otherwise the entitlement provider gates them.
 */
export function multiNightUnrestricted(env = process.env) {
  return !enabledServiceExtension("planner.projects", env);
}

/**
 * Whether the multi-night plans of Astro Sync —
 * its integrations sent to a plan, and the image of the plan — are active
 * for this person. Where nothing restricts them (`multiNightUnrestricted`): always, for a
 * signed-in person. Otherwise (a projects service and an entitlement
 * provider registered and on): with `analysis.progression` (« Synchronisation avancée+ », no capability
 * of their own; `capability` names another one for a gesture with a right
 * of its own, see `multiNightAttachActiveFor`), outside the read-only
 * window of an ended subscription.
 */
export async function multiNightActiveFor(
  driver,
  userId,
  capability = "analysis.progression",
) {
  if (!userId) return false;
  if (multiNightUnrestricted()) return true;
  if (!enabledServiceExtension("entitlements.provider")) return false;
  const provider = entitlementProviderFor(driver);
  const capabilities = await provider.capabilitiesFor(userId);
  if (capabilities?.[capability] !== true) return false;
  // The read-only window of an ended subscription refuses the write unless
  // the capability behind it is a one-time purchase still held
  // (`isWriteRefused`): « Planification avancée » bought once keeps its
  // gestures, a subscription's `analysis.progression` does not.
  return !isWriteRefused(
    await resolveWriteAccess(provider, userId),
    capability,
  );
}

/**
 * Whether the gestures on a multi-night plan —
 * attaching a night, detaching it, creating a plan with nights — are open to
 * this person: « Planification avancée » (`planner.mosaic`, bought once, or
 * held by either subscription while it lasts), under the same conditions as
 * `multiNightActiveFor` (in the read-only window of an ended subscription
 * only through a one-time purchase, which does not expire; always where
 * nothing restricts them). The integrations
 * and the image of a plan stay under `multiNightActiveFor`'s
 * `analysis.progression`.
 */
export function multiNightAttachActiveFor(driver, userId) {
  return multiNightActiveFor(driver, userId, "planner.mosaic");
}
