import { isShippedLocale } from "astro-contracts/locales";

/**
 * What the footer of a page shows, decided from the page's address: the
 * footer's copyright and licence line closes every page that has room for
 * it, and « v1.0.1 · 5f295f159 » only the pages of the administration
 * (`/<locale>/admin…`). A page of the public gallery, of the planner or of
 * a space never says which build runs.
 *
 * Kept apart from `SourceNotice.js` (a client component in JSX) so that the
 * rule is a plain function a Node test imports, and so that the footer of
 * every page loads nothing more.
 */
const segmentsOf = (pathname) =>
  String(pathname || "/")
    .split("/")
    .filter(Boolean);

/** Whether `pathname` is a page of the administration: `/<locale>/admin…`. */
export function isAdministrationPath(pathname) {
  const [locale, section] = segmentsOf(pathname);
  return isShippedLocale(locale) && section === "admin";
}

/** The version and the commit close the footer of the administration only. */
export const showsBuildIdentity = isAdministrationPath;

/**
 * Whether `pathname` is a full-viewport page: the sheet of a capture of the
 * public gallery (`/<locale>/gallery/<id>`, `PublicCapturePage`) and of a
 * private gallery, the
 * catalogue's viewer (`/<locale>/image/<target>/<image>`, `DetailPage`) and
 * the image alone (`/<locale>/full/<target>/<image>`, `FullImagePage`), the
 * last two also without a language in the address. These pages are drawn
 * `position: fixed` over the whole window below the header (the stage, then
 * the details panel): they leave no room for a line of text, which would sit
 * over the image. They have no footer (no text over the
 * image). The page of a capture of a private gallery
 * (`/<locale>/p/<address>/<id>`) is the same sheet (one component for both
 * galleries) and has no footer either; the private gallery's list
 * (`/<locale>/p/<address>`) is an ordinary page that scrolls, which the
 * footer closes in the flow.
 */
export function isFullViewportPath(pathname) {
  const segments = segmentsOf(pathname);
  const inLanguage = isShippedLocale(segments[0]);
  const [section, ...rest] = inLanguage ? segments.slice(1) : segments;
  if (section === "gallery") return inLanguage && rest.length === 1;
  if (section === "p") return inLanguage && rest.length === 2;
  return (section === "image" || section === "full") && rest.length === 2;
}
