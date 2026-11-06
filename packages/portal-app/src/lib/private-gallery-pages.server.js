import { headers } from "next/headers";
import { notFound } from "next/navigation";
export { privateGalleryMetadata } from "./private-gallery-metadata.js";
import { signInPath } from "./auth.server.js";
import { enabledServiceExtension } from "./service-extensions.js";
import {
  galleryViewer,
  requirePrivateGalleryService,
} from "./v1/private-gallery-service.js";

/**
 * What the pages of the private gallery share: the viewer of the request,
 * the service, and the way to the sign-in that comes back. Their metadata
 * is `./private-gallery-metadata.js`.
 */

/** The service and the viewer of this request. */
export async function galleryRequest() {
  const [service, viewer] = await Promise.all([
    requirePrivateGalleryService(),
    headers().then(galleryViewer),
  ]);
  return { service, viewer };
}

/** « Se connecter », and back to the gallery after the code. */
export const gallerySignInHref = (locale, token) =>
  `${signInPath()}?next=${encodeURIComponent(
    `/${locale}/p/${encodeURIComponent(token)}`,
  )}`;

/**
 * The page of a gate that is not the gallery: the composition's, for the
 * refusals it makes (`sign_in`, `no_access` of `gallery.audience`), else the
 * `404` of an unknown address or a gallery shared with nobody.
 */
export async function galleryRefusalPage({ access, locale, token }) {
  if (access.outcome === "sign_in" || access.outcome === "no_access") {
    const page = await enabledServiceExtension("gallery.audience")?.gate({
      locale,
      kind: access.outcome,
      signInHref: gallerySignInHref(locale, token),
    });
    if (page) return page;
  }
  notFound();
}

/** What the composition says above the gallery at a person's first visit. */
export async function galleryArrival({ view, locale }) {
  if (view.arrival !== "created") return null;
  return (
    (await enabledServiceExtension("gallery.audience")?.arrival({
      locale,
      publicName: view.publicName,
    })) ?? null
  );
}
