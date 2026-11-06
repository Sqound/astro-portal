import { sameOriginPath } from "portal/safe-redirect.js";

/**
 * Where the web sign-in sends the browser once the code is right: `next`
 * when it is a path of this site (read as the browser reads it, against the
 * page's own origin), the home page of the language otherwise. The page's
 * server checked `next` already; it is checked again where it is followed.
 */
export function signInDestination(next, locale, origin) {
  return sameOriginPath(next, origin) || `/${locale}`;
}
