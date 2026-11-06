import {
  copyFor,
  defaultLocale,
  localeTypography,
  shippedLocales,
} from "astro-contracts/locales";

import { messagesEn } from "./messages/en.js";
import { messagesFr } from "./messages/fr.js";
import { messagesJa } from "./messages/ja.js";
import { messagesZhHans } from "./messages/zh-Hans.js";
import { messagesZhHant } from "./messages/zh-Hant.js";
import { messagesRu } from "./messages/ru.js";
import { messagesDe } from "./messages/de.js";
import { messagesEs } from "./messages/es.js";
import { messagesIt } from "./messages/it.js";
import { messagesPtBR } from "./messages/pt-BR.js";
// Each language has one web catalogue under messages/.
export const messages = {
  en: messagesEn,
  fr: messagesFr,
  ja: messagesJa,
  "zh-Hans": messagesZhHans,
  "zh-Hant": messagesZhHant,
  ru: messagesRu,
  de: messagesDe,
  es: messagesEs,
  it: messagesIt,
  "pt-BR": messagesPtBR,
};

let runtimeOverrides = {};

export function setTranslationOverrides(overrides) {
  runtimeOverrides =
    overrides && typeof overrides === "object" ? overrides : {};
}

// The configurable product name, primed once per render by `TranslationProvider`
// from the server's own resolution (`portal-app/lib/product-name.js`'s
// `normalizedProductName`) — this fallback only matters for a direct call to
// `message()` before that provider has run (e.g. a unit test), and mirrors the same
// default, "Astro Portal".
let runtimeProductName = "Astro Portal";

export function setProductName(name) {
  runtimeProductName =
    typeof name === "string" && name.trim() ? name.trim() : "Astro Portal";
}

// Read by a component with its own copy table outside the shared `messages`
// object (`AuthPage.js`, `AccountPage.js`), where a `{productName}`
// placeholder is substituted the same way `message()` does below.
export function productName() {
  return runtimeProductName;
}

/**
 * A handful of message templates carry a literal `{productName}` rather than
 * a hard-coded name (`plannerExportPortalTitle`) so a
 * configured deployment reads its own name there too. Substitution is a
 * plain, unconditional `replaceAll`: every other message has no such
 * placeholder and passes through untouched.
 */
export function message(locale, key) {
  const override = runtimeOverrides?.[locale]?.[key];
  const template =
    typeof override === "string" && override.trim()
      ? override
      : copyFor(messages, locale, "i18n.messages")[key] ||
        messages.en[key] ||
        key;
  return template.includes("{productName}")
    ? template.replaceAll("{productName}", runtimeProductName)
    : template;
}
/**
 * What separates two sentences written one after the other: nothing for the
 * languages written without word spaces (Japanese, the Chinese scripts), a
 * space for the others.
 */
export function sentenceSeparator(locale) {
  return localeTypography(locale).sentenceSeparator;
}

/**
 * Whether `locale` writes its decimals with a comma (French, German, Spanish,
 * Italian, Portuguese, Russian).
 */
export function decimalComma(locale) {
  return localeTypography(locale).decimalSeparator === ",";
}

/**
 * `value` to `decimals` places with the decimal separator of `locale`
 * (« 45,02000 » in French, « 45.02000 » in English): the coordinates of a
 * place, which a bare `toFixed` wrote with a point in every language.
 */
export function decimalText(value, decimals, locale) {
  if (!Number.isFinite(value)) return "";
  const text = value.toFixed(decimals);
  return decimalComma(locale) ? text.replace(".", ",") : text;
}

/**
 * Whether a date range inside one month drops the month of its first date
 * (« du 14 au 23 oct. »: French, Spanish, Italian, Portuguese, Russian).
 */
export function rangeOmitsFirstMonth(locale) {
  return localeTypography(locale).rangeFirstMonth === "omitted";
}

/**
 * Whether a common noun that opens a name (« Votre position ») is written
 * with a lower-case initial inside a sentence (« 1,6 magnitude plus sombre que
 * votre position »): the languages whose capitals are for proper names only
 * (the registry's `midSentenceCase`).
 */
export function lowersMidSentence(locale) {
  return localeTypography(locale).midSentenceCase === "lower";
}

// A handful of error strings are frozen wire contracts (thrown by
// validatePlannerDocument, replayed byte-for-byte by the conformance
// fixtures) so they can never be translated at the
// source. This maps the exact English string, once it has reached the UI,
// to a localized message — display-time only, never touching the thrown
// text itself. A message with no mapping passes through unchanged.
const knownServerErrorKeys = {
  "A plan refers to an unknown observing night.": "plannerUnknownNightError",
  // The refusal of a write the database would not take: `/api/plans`
  // answers it as `code: "plan_write_refused"`.
  "The planner could not take this change. Reload the page.":
    "plannerWriteRefused",
  // The refusal of a plan write in the read-only window:
  // `PLAN_READ_ONLY_MESSAGE` of the plan service, which
  // `/api/plans` answers as `error` (a test holds the two together).
  "This account's subscription has ended: plan writes are suspended; existing plans remain readable and exportable.":
    "plannerPlansReadOnly",
};
export function localizedServerError(locale, rawMessage) {
  const key = knownServerErrorKeys[rawMessage];
  return key ? message(locale, key) : rawMessage;
}
// Portable locale-coverage contract (fixtures/locale-coverage.json): every
// message key defined for `baseLocale` must exist in every other locale, and
// vice versa. A missing planner term is a subset of a missing message key, so
// this whole-table parity check is the stricter, unambiguous rule to freeze.
// The locales checked are the registry's (`locales`), plus any the catalogue
// holds without the registry knowing it: a registered locale with no
// catalogue is reported `absent` (every key missing), a catalogue the
// registry does not list is reported `unregistered`.
export function localeKeyGaps(
  baseLocale = defaultLocale(),
  catalogue = messages,
  locales = shippedLocales(),
) {
  const baseKeys = Object.keys(catalogue[baseLocale] || {});
  const checked = [
    ...locales,
    ...Object.keys(catalogue).filter((locale) => !locales.includes(locale)),
  ].filter((locale) => locale !== baseLocale);
  return Object.fromEntries(
    checked.map((locale) => {
      const keys = new Set(Object.keys(catalogue[locale] || {}));
      const gap = {
        missing: baseKeys.filter((key) => !keys.has(key)),
        extra: [...keys].filter((key) => !baseKeys.includes(key)).sort(),
      };
      if (!Object.hasOwn(catalogue, locale)) gap.absent = true;
      if (!locales.includes(locale)) gap.unregistered = true;
      return [locale, gap];
    }),
  );
}

// Search folding per language: a rule applied after the common one below,
// keyed by locale tag (`zh-Hant`) or bare language (`de`). A rule is added
// only with a case the language study names and a test for that case; none
// does today. What the common rule already folds, for the scripts of the
// registry's planned languages, is tested instead
// (`packages/portal/tests/locale-content.test.mjs`): accents and umlauts,
// the Russian « ё », full-width Latin letters and digits typed with a CJK
// keyboard. Two scripts of one language are never folded into each other.
const searchFoldings = new Map();

/** Tests only: registers `fold` for `locale` (a tag or a language); `null` removes it. */
export function useSearchFoldingForTests(locale, fold) {
  if (fold === null) searchFoldings.delete(locale);
  else searchFoldings.set(locale, fold);
}

/** The folding rule of `locale`: its tag's own, else its language's, else none. */
export function searchFoldingFor(locale) {
  const tag = String(locale || "");
  return (
    searchFoldings.get(tag) ?? searchFoldings.get(tag.split("-")[0]) ?? null
  );
}

export function normalizeSearch(value, locale = "en") {
  const common = String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase(locale)
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae");
  const fold = searchFoldingFor(locale);
  return fold ? fold(common) : common;
}
