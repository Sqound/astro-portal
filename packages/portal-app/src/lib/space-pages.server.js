import { serviceExtension } from "./service-extensions.js";

/**
 * The settings of the pages of a space — the links to the terms and
 * the privacy policy its sign-in page shows, `{ termsUrl, privacyUrl }` —
 * that a composition registers at `spaces.pageSettings`; `null` on
 * a private server, whose pages speak of « votre portail ». The links are
 * the pages in the language of `locale` (the tag of the page being served);
 * without it, the default language's.
 */
export function spacePageSettings(locale = null) {
  return serviceExtension("spaces.pageSettings")?.(locale) ?? null;
}

/**
 * The message key of the browser title of the account page: « Espace » where
 * a composition registers space pages (the header calls the page
 * « Espace Astro Portal »), « Compte » on a private server.
 */
export function accountPageTitleKey() {
  return spacePageSettings() ? "pageTitleSpace" : "pageTitleAccount";
}
