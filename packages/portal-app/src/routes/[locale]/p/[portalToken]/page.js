import { PrivateGalleryView } from "portal/components/gallery/PrivateGallery.js";
import {
  galleryArrival,
  galleryRefusalPage,
  galleryRequest,
  privateGalleryMetadata,
} from "../../../../lib/private-gallery-pages.server.js";

/**
 * `/{locale}/p/{portalToken}`: the private gallery of a space at its random
 * address — `PrivatePortal` when the gate opens, the composition's own gates
 * for the refusals it makes, and gate 3 — one `404` page — for an unknown or
 * replaced address or a gallery shared with nobody. Never indexed (`robots`, and
 * `X-Robots-Tag` from the shell's configuration), never a referrer.
 */
export const generateMetadata = privateGalleryMetadata;

export default async function Page({ params }) {
  const { locale, portalToken } = await params;
  const { service, viewer } = await galleryRequest();
  const { access, view } = await service.gallery({
    token: portalToken,
    viewer,
    locale,
  });
  if (access.outcome !== "open")
    return await galleryRefusalPage({ access, locale, token: portalToken });
  return (
    <PrivateGalleryView
      locale={locale}
      token={portalToken}
      view={view}
      arrival={await galleryArrival({ view, locale })}
    />
  );
}
