import { defaultLocale, matchDeviceLocale } from "./locales.js";

/**
 * The legal pages (terms of use, privacy policy) in the reader's language.
 *
 * The presentation site publishes both pages once per shipped locale
 * (`/<tag>/terms/`, `/<tag>/privacy/`, the tags of the locale registry). A
 * service names its page with one setting, `ASTRO_PORTAL_TERMS_URL` or
 * `ASTRO_PORTAL_PRIVACY_URL`, in one of two forms:
 *
 * - a plain address, `https://www.example.test/terms/`: the same page for
 *   everyone (what the setting always meant);
 * - an address template holding `{lang}`,
 *   `https://www.example.test/{lang}/terms/`: the placeholder stands for the
 *   tag of the reader's locale (`fr`, `zh-Hans`, `pt-BR`).
 *
 * A language the registry does not ship reads the default locale's page
 * (English). Every surface resolves the template with this one function:
 * the web pages with the page's locale, the applications with the language
 * they are shown in (the service announces the template next to the English
 * address, see `service-identity.ts`).
 */

/** The placeholder that stands for the locale tag in an address template. */
export const LEGAL_LANGUAGE_PLACEHOLDER = "{lang}";

/** Whether `address` is a template (holds the language placeholder). */
export function isLegalAddressTemplate(address: unknown): boolean {
  return (
    typeof address === "string" && address.includes(LEGAL_LANGUAGE_PLACEHOLDER)
  );
}

/**
 * The shipped locale whose legal page `language` reads: the locale a device
 * or browser tag asks for (`fr-CA` reads `fr`, `zh-TW` reads `zh-Hant`), else
 * the default locale. Never throws.
 */
export function legalPageLocale(language: unknown): string {
  return (
    (typeof language === "string" ? matchDeviceLocale(language) : null) ??
    defaultLocale()
  );
}

/**
 * `address` for a reader of `language`: the template with `{lang}` replaced
 * by the tag of that reader's page, a plain address unchanged. `null` for an
 * absent address.
 */
export function legalAddressFor(
  address: string | null | undefined,
  language: unknown,
): string | null {
  if (typeof address !== "string" || address.trim() === "") return null;
  const trimmed = address.trim();
  return trimmed
    .split(LEGAL_LANGUAGE_PLACEHOLDER)
    .join(legalPageLocale(language));
}
