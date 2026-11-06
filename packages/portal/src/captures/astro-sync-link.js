/**
 * Where « Résoudre dans Astro Sync » leads:
 * the download page of the site, in the page's language, where Astro Sync is
 * offered. Astro Sync registers no link of its own on the computer today, so
 * the way out is the page that installs it; the owner's detail is the only
 * place that names it (a visitor's pages never do).
 */
import { isShippedLocale } from "astro-contracts/locales";

export const SITE_ORIGIN = "https://www.planastro.space";

/** `https://www.planastro.space/fr/download/`, English for an unknown language. */
export function astroSyncDownloadUrl(locale = "en") {
  const language = isShippedLocale(locale) ? locale : "en";
  return `${SITE_ORIGIN}/${language}/download/`;
}
