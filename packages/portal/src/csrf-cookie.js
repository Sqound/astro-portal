/**
 * The CSRF token a page sends back in `x-astro-csrf`, read from the cookie
 * the service set with the web session: `__Host-astro_portal_csrf` when the
 * cookies are `Secure`, `astro_portal_csrf` over plain http in development
 * (portal-app/lib/auth.server.js). A page cannot know which setting the service
 * runs with, so it takes the `__Host-` cookie when there is one: the
 * service compares the header with the cookie of its own name and with the
 * session, so a wrong pick is refused, never accepted.
 */
const NAMES = ["__Host-astro_portal_csrf", "astro_portal_csrf"];

export function csrfCookieValue(
  cookies = typeof document === "undefined" ? "" : document.cookie,
) {
  const entries = String(cookies || "").split(/;\s*/);
  for (const name of NAMES) {
    const entry = entries.find((item) => item.startsWith(`${name}=`));
    if (entry) return entry.slice(name.length + 1);
  }
  return "";
}
