import { GalleryNotFound } from "portal/components/gallery/GalleryNotFound.js";

/**
 * Gate 3 of the private gallery: the one `404` page of an unknown or
 * replaced address, of a gallery shared with nobody, and of a capture the
 * gallery does not show.
 */
export default function NotFound() {
  return <GalleryNotFound />;
}
