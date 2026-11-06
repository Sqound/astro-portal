"use client";

import { usePathname } from "next/navigation";
import { shippedLocales } from "astro-contracts/locales";
import { PrivateGalleryGate } from "./PrivateGallery.js";

/**
 * Gate 3 of the private gallery (`PrivatePortalGate` frame 3), drawn by the
 * gallery's `not-found` page: an unknown or replaced address, a gallery
 * shared with nobody, a capture it does not show — one page, answered
 * `404`, which does not say which. A `not-found` page receives no
 * parameters: the language is the first segment of the address
 * (`/{locale}/p/…`), English when it names none.
 */
export function GalleryNotFound({ locale = null }) {
  const pathname = usePathname() || "";
  const first = pathname.split("/")[1] || "";
  const pageLocale =
    locale || (shippedLocales().includes(first) ? first : "en");
  return <PrivateGalleryGate locale={pageLocale} />;
}
