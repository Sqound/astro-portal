import { privateGalleryPathOf } from "portal/private-gallery/gallery-paths.js";
import { retryOnSqliteNestedTransaction } from "portal/persistence/db-transaction-retry.js";
import {
  authEnabled,
  authMethod,
  authService,
  signInPath,
} from "./auth.server.js";

/**
 * What the site's header decides, read once on the server by the root
 * layout (« Mon espace », « Administration »
 * and « Galerie privée » used to appear after three reads the header made
 * in the browser at every page): whether the person is signed in and how,
 * whether the administration is theirs, the path of their private gallery,
 * and the sessions waiting for their debriefing (the Journal's own count,
 * `toDebriefCount`: the one source of the badge, in the
 * mobile clients and on the web). The HTML is served right for
 * each role, and the header keeps it across the navigations inside the site;
 * it is read again when the person signs in or out (a whole page) and when
 * a change of theirs moves it (`router.refresh()`, `header-refresh.js`).
 *
 * « Se connecter » leads to the service's own sign-in page, always named
 * here (`signInPath`, the one `GET /api/auth/status` gives), even when the
 * read of the status failed: the header never falls back to a page of
 * another sign-in method (a service signing in by e-mail code has no `/auth/login`).
 *
 * Each part is absent, never broken: a read that fails leaves the visitor's
 * header (no session), no gallery link or no badge. The services are given
 * by the tests.
 */
export async function headerState({
  requestHeaders,
  enabled = authEnabled,
  auth = authService,
  privateGallery = async () =>
    (
      await import("./v1/private-gallery-service.js")
    ).requirePrivateGalleryService(),
  journal = async () =>
    (await import("./v1/journal-service.js")).requireJournalService(),
  method = authMethod,
  signInPageOf = signInPath,
} = {}) {
  const visitor = {
    authentication: { enabled: false, authenticated: false },
    privateGalleryPath: null,
    debriefQueueCount: 0,
  };
  if (!requestHeaders || !enabled()) return visitor;
  let authentication, session;
  try {
    const service = auth();
    [authentication, session] = await Promise.all([
      service.status(requestHeaders),
      service.session(requestHeaders),
    ]);
  } catch {
    // The status could not be read: a visitor of a service that signs in,
    // with the page where it does.
    return {
      ...visitor,
      authentication: {
        enabled: true,
        authenticated: false,
        method: method(),
        signInPath: signInPageOf(),
      },
    };
  }
  authentication = {
    ...authentication,
    signInPath: authentication?.signInPath || signInPageOf(),
  };
  const signedIn = Boolean(authentication?.authenticated && session);
  if (!signedIn) return { ...visitor, authentication };
  const tenantId = session.tenant_id;
  const userId = session.user_id;
  // One after the other, each retried while another request holds the one
  // SQLite driver's transaction (the first reads build their repositories,
  // which migrate): on SQLite two builds at once refuse each other.
  let privateGalleryPath = null;
  try {
    const settings = await retryOnSqliteNestedTransaction(async () =>
      (await privateGallery()).settings({ tenantId, userId, origin: "" }),
    );
    privateGalleryPath = privateGalleryPathOf(settings);
  } catch {
    privateGalleryPath = null;
  }
  let debriefQueueCount = 0;
  try {
    debriefQueueCount = await retryOnSqliteNestedTransaction(async () => {
      const service = await journal();
      // One line is enough: the count does not move with the filters.
      const page = service
        ? await service.read({
            tenantId,
            query: new URLSearchParams({ limit: "1" }),
          })
        : null;
      return Number.isInteger(page?.toDebriefCount) ? page.toDebriefCount : 0;
    });
  } catch {
    debriefQueueCount = 0;
  }
  return { authentication, privateGalleryPath, debriefQueueCount };
}
