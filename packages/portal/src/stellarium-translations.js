import { stellariumLocales } from "astro-contracts/locales";

const loaders = new Map();

// The locales whose names Stellarium translates: the shipped locales but the
// default one, that have a sky-culture translation (the registry says so).
function translatedLocale(locale) {
  return stellariumLocales().includes(locale) ? locale : null;
}

// Stellarium translates names before drawing them on its WebGL canvas.  Keep
// those dictionaries behind our own endpoint: the public upstream source does
// not grant browsers CORS access, while this lets the portal cache the result
// and retain the original international name if it is temporarily unavailable.
export function loadStellariumTranslations(locale) {
  const language = translatedLocale(locale);
  if (language === null) return Promise.resolve({});
  if (!loaders.has(language)) {
    loaders.set(
      language,
      fetch(`/api/stellarium/translations/${language}`, {
        // The server cache keeps this inexpensive.  Do not pin a browser to
        // an older dictionary when a localized label mapping is improved.
        cache: "no-store",
      })
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({})),
    );
  }
  return loaders.get(language);
}

export function translateStellariumLabel(translations, _domain, label) {
  return translations?.[label] || label;
}
