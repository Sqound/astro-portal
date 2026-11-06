import { privateGalleryCopyFor } from "portal/components/gallery/private-gallery-copy.js";
import { portalConfig } from "./config.server.js";

/**
 * The metadata of the pages of a private gallery: never indexed, never
 * followed, no referrer (the address is the secret), no canonical address
 * of the public gallery.
 */
export async function privateGalleryMetadata({ params }) {
  const { locale } = await params;
  const { productName } = await portalConfig();
  const title = `${productName} — ${privateGalleryCopyFor(locale).defaultTitle}`;
  return {
    title,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
    referrer: "no-referrer",
    alternates: {},
    openGraph: { title },
    twitter: { title },
  };
}
