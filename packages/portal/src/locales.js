// The locale registry, for the packages that reach `astro-contracts` through
// the portal (planner, the commercial packages): one list of the shipped
// interface languages and the one named fallback of the copy tables kept
// outside the catalogues (`copyFor`). See `astro-contracts/locales`.
export {
  copyFallbacks,
  copyFor,
  defaultLocale,
  isShippedLocale,
  localeEntry,
  localeName,
  localeNames,
  localeTypography,
  localeRegistry,
  matchDeviceLocale,
  shippedLocaleOr,
  shippedLocales,
  stellariumCode,
  stellariumLocales,
} from "astro-contracts/locales";
