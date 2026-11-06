import { message } from "portal/i18n.js";
import { pageShareMetadata } from "./share-metadata.js";
import { portalConfig } from "./config.server.js";

/**
 * The browser title of a page of a locale: « <product name> — <page> », the
 * page's name being a message of the portal's own table (`pageTitle…`), so it
 * reads in the language of the page. The locale layout carries the gallery's
 * title for every page below it (it is the gallery's share preview); a page
 * states its own through this, and a shell re-exports it as
 * `generateMetadata` like any other route export.
 *
 * `key` is the message key, or a function that chooses it at request time
 * (the account page is « Compte » on a private server and « Espace » where
 * spaces are open), or `{ words(locale) }` for a page of a composition whose
 * name is not in the portal's table. An unsupported locale gets no title
 * here: the layout answers it with a 404.
 */
export function pageMetadata(key) {
  return async function generateMetadata({ params }) {
    const { locale } = await params;
    const { supportedLocales, productName } = await portalConfig();
    if (!supportedLocales.includes(locale)) return {};
    const page =
      key && typeof key === "object"
        ? key.words(locale)
        : message(locale, typeof key === "function" ? key() : key);
    return pageShareMetadata(`${productName} — ${page}`);
  };
}
