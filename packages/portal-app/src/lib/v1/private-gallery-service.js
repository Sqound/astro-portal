import {
  PrivateGalleryError,
  createPrivateGalleryService,
} from "portal/private-gallery/private-gallery.js";
import { databaseDriver } from "portal/persistence/database.js";
import { retryOnSqliteNestedTransaction } from "portal/persistence/db-transaction-retry.js";
import { authEnabled, authService } from "../auth.server.js";
import { portalConfig } from "../config.server.js";
import { enabledServiceExtension, galleryTeam } from "../service-extensions.js";
import { metadataBaseFromRequest } from "../share-metadata.js";
import { entitlementProviderFor } from "./entitlement-provider.js";
import { v1Error, v1Json } from "./response.js";

// The private gallery of a space, on the process-owned persistence driver.
// Where a composition registered the people it lets into a gallery by name
// (`gallery.audience`), its mode is the gate's third; on a private server
// the gallery has two modes and one person.
let shared = null;

export async function requirePrivateGalleryService() {
  if (
    !process.env.ASTRO_PORTAL_DATABASE_PATH &&
    !process.env.ASTRO_PORTAL_DATABASE_URL
  )
    throw Object.assign(new Error("The private gallery is unavailable."), {
      code: "gallery_unavailable",
      status: 503,
    });
  if (!shared) {
    const driver = databaseDriver();
    // On SQLite the migrations of its repository wait for a transaction
    // another request holds on the one driver; a failed build is forgotten
    // so that the next request tries again (the public capture's page
    // builds it too).
    shared = retryOnSqliteNestedTransaction(() =>
      createPrivateGalleryService({
        driver,
        dialect: driver.dialect,
        // The mode a composition adds, read at each call.
        extraMode: () =>
          enabledServiceExtension("gallery.audience")?.mode({
            driver,
            provider: entitlementProviderFor(driver),
            offersSold: () =>
              Boolean(enabledServiceExtension("entitlements.provider")),
          }) ?? null,
        // The words a name may not hold are a team's: none without one.
        nameRefusal: async ({ names }) =>
          (await galleryTeam()?.nameRefusal?.({ driver, names })) ?? null,
      }),
    );
    shared.catch(() => {
      shared = null;
    });
  }
  return await shared;
}

/**
 * Who looks at a gallery: the web session's space, person, address and
 * whether the administration is theirs, or `null` (signed out, an expired
 * cookie, a service without sign-in). A device bearer is never a viewer.
 */
export async function galleryViewer(headers) {
  if (!authEnabled()) return null;
  try {
    const auth = authService();
    const session = await auth.session(headers);
    if (!session) return null;
    return {
      tenantId: session.tenant_id,
      userId: session.user_id,
      email: session.email ?? null,
      administrator: Boolean(await auth.administrationAllowed(session)),
    };
  } catch {
    return null;
  }
}

/** The origin the gallery's address is written with. */
export async function galleryOrigin(headers) {
  const config = await portalConfig();
  return metadataBaseFromRequest(headers, config.publicUrl)?.origin ?? "";
}

/** The answers of the gallery's routes: never indexed, never cached. */
export const GALLERY_JSON_HEADERS = Object.freeze({
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
});

/** The v1 error envelope of a refusal of the private gallery. */
export function privateGalleryFailure(error, headers = {}) {
  if (error instanceof PrivateGalleryError)
    return v1Json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details || {}),
        },
      },
      { status: error.status, headers },
    );
  const response =
    error?.code === "gallery_unavailable"
      ? v1Error(error)
      : v1Error(error, {
          code: "gallery_unavailable",
          message: "The private gallery is unavailable.",
          status: 503,
        });
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}
