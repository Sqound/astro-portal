import { GalleryPage } from "portal/components/gallery/GalleryPage.js";
import { galleryViewFromRoute } from "portal/gallery-state.js";
import { gallerySource } from "../../lib/config.server.js";

// The home page: the public gallery of every space, or the operator's file
// gallery when `ASTRO_PORTAL_GALLERY_SOURCE=files` (read at each request:
// the shells declare the page dynamic).

export default async function Page({ params, searchParams }) {
  const { locale } = await params;
  const { view } = await searchParams;
  return (
    <GalleryPage
      locale={locale}
      initialView={galleryViewFromRoute(view)}
      source={gallerySource()}
    />
  );
}
