/**
 * The header of the site is decided on the server, once per page, by the root
 * layout (`portal-app/lib/header-state.server.js`), and kept across the
 * navigations inside the site. A change of the person's own that moves it —
 * their private gallery's address or mode, a night debriefed — says so here;
 * the header then asks the server again (`router.refresh()` in
 * `LocaleSwitcher.js`). Signing in and out load a whole page and need
 * nothing.
 */
export const HEADER_STALE_EVENT = "astro-portal:header-stale";

/** Tells the header that what it shows may have changed. */
export function headerStale(target = globalThis) {
  if (typeof target?.dispatchEvent !== "function") return;
  target.dispatchEvent(new Event(HEADER_STALE_EVENT));
}
