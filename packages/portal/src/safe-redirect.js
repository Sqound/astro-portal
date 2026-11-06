/**
 * Where a sign-in may send a browser afterwards (the `next` of its
 * address): a path of the same site, never an address elsewhere. A filter
 * on the first characters is not enough — a browser reads `/\evil.example`
 * and `/<tab>/evil.example` as `//evil.example`, another site — so the
 * target is read the way the browser will read it, with the URL parser,
 * against the site's own origin, and kept only when that origin does not
 * change.
 *
 * The result is a path (`/fr/account?tab=devices#top`) that never starts
 * with `//` or `/\`, so that reading it again gives the same page; `null`
 * when the target leaves the site or is not a URL at all.
 */
export function sameOriginPath(target, origin) {
  if (typeof target !== "string" || !target) return null;
  let base;
  let url;
  try {
    base = new URL(origin);
    url = new URL(target, base);
  } catch {
    return null;
  }
  if (url.origin !== base.origin || /^\/[/\\]/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

// An origin no site has (RFC 2606 `.invalid`), for a server that does not
// know its own address: whether a target stays on the site does not depend
// on which site it is.
const ANY_SITE = "https://site.invalid";

/** `sameOriginPath` on the server, where only the path matters. */
export function sitePath(target) {
  return sameOriginPath(target, ANY_SITE);
}

/**
 * The `next` of a page's query (`?next=/fr/account`) when it is a path of
 * the page's site, `fallback` otherwise.
 */
export function nextDestination(search, origin, fallback) {
  return (
    sameOriginPath(new URLSearchParams(search || "").get("next"), origin) ||
    fallback
  );
}
