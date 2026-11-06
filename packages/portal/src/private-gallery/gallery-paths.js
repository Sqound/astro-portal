import { nightMonth } from "../components/manage/captures-format.js";

/**
 * The addresses of a private gallery and of its captures' files, and the
 * title and month a capture is listed with: pure, for the gallery's server
 * pages (`components/gallery/PrivateGallery.js`) and its list in the browser
 * (`components/gallery/PrivateGalleryGrid.js`). They live with the gallery's
 * own code: no public page writes such an address.
 */

/** The address of the gallery, under the page's language. */
export const galleryPath = (locale, token) =>
  `/${encodeURIComponent(locale)}/p/${encodeURIComponent(token)}`;

/**
 * The path of the person's private gallery (`/p/{token}`), read from the
 * `address` the service gives for it (`GET /api/v1/manage/portal`), or
 * `null`: the header's link « Galerie privée », drawn for a signed-in person
 * only, to their own gallery (read by the root layout on the server,
 * `portal-app/lib/header-state.server.js`).
 */
export function privateGalleryPathOf(payload) {
  const address = payload?.address;
  if (typeof address !== "string" || !address) return null;
  let pathname;
  try {
    pathname = new URL(address, "http://portal.invalid").pathname;
  } catch {
    return null;
  }
  const token = /\/p\/([A-Za-z0-9_-]{16,})\/?$/.exec(pathname)?.[1];
  return token ? `/p/${token}` : null;
}

/**
 * The file of one capture through the gallery's gate: its thumbnail, or its
 * shared copy; `imageId` names one of its public variants instead of the
 * main image.
 */
export const galleryMediaPath = (
  token,
  captureId,
  { thumbnail = false, imageId = null } = {},
) => {
  const query = [
    thumbnail ? "variant=thumbnail" : null,
    imageId ? `imageId=${encodeURIComponent(imageId)}` : null,
  ].filter(Boolean);
  return `/api/v1/portals/${encodeURIComponent(token)}/media/${encodeURIComponent(
    captureId,
  )}${query.length ? `?${query.join("&")}` : ""}`;
};

/** « M31 », or the file's name for a capture without a target. */
export function itemTitle(item) {
  return item.targets?.[0]?.designation || item.fileName || "";
}

/** « Octobre 2026 »: the night's month, else the month it was added. */
export function itemMonth(item, locale) {
  const day = item.night || String(item.addedAt || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? nightMonth(day, locale, { capital: true })
    : "";
}
