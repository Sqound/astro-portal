import { cookies, headers } from "next/headers";
import { ADDRESS_LANGUAGE_HEADER } from "./address-language.js";
import { portalConfig } from "./config.server.js";

/**
 * The language of a page whose address names none (`/auth/…`): the one the
 * visitor chose last (`astro-portal-locale`, written by the language
 * selector), else the deployment's default. The root layout gives the same
 * value to the header's selector and to the footer, and the page to its
 * body, so the whole page speaks one language.
 */
export async function pageLocale({ fallback = null } = {}) {
  const { defaultLocale, supportedLocales } = await portalConfig();
  const preferred = (await cookies()).get("astro-portal-locale")?.value;
  if (supportedLocales.includes(preferred)) return preferred;
  // A page that knows a better default than the deployment's (the sign-in
  // page reached from a link of a composition: that link's language).
  return supportedLocales.includes(fallback) ? fallback : defaultLocale;
}

/**
 * The language of the page's own address (`/fr/…` → `fr`), or `null` when the
 * address names none or names one this deployment does not serve. The root
 * layout writes it on `<html lang>`, so a screen reader, a translation tool
 * and the browser's hyphenation and fonts take the page's language and not
 * the visitor's last choice.
 */
export async function addressLocale() {
  const { supportedLocales } = await portalConfig();
  const named = (await headers()).get(ADDRESS_LANGUAGE_HEADER);
  return supportedLocales.includes(named) ? named : null;
}
