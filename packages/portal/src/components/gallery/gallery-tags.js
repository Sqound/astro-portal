import { copyFor } from "astro-contracts/locales";
import { GENERIC_TAG_WORDS } from "../../captures/generic-tags.js";

/**
 * The words of the galleries' generic tags: the public gallery's filter bar and
 * cards (`GalleryPage.js`) and the private gallery's filter bar
 * (`PrivateGalleryGrid.js`) translate them here. A word that is not a known
 * generic tag — an owner's own tag of the private gallery — is written as it
 * is, never translated nor normalised.
 *
 * The words are the stored values of `captures/generic-tags.js` (the
 * contract's keys `galaxy`, `nebula`, … name them), and every place that
 * lists a capture's tags — the galleries, « Mon espace › Captures » —
 * translates them here (the fixture `generic-tag-label` checks the ten
 * languages).
 */
export function localizedTag(tag, locale) {
  const labels = {
    Nébuleuse: {
      en: "Nebula",
      ja: "星雲",
      de: "Nebel",
      es: "Nebulosa",
      it: "Nebulosa",
      "pt-BR": "Nebulosa",
      "zh-Hans": "星云",
      "zh-Hant": "星雲",
      ru: "Туманность",
    },
    Galaxie: {
      en: "Galaxy",
      ja: "銀河",
      de: "Galaxie",
      es: "Galaxia",
      it: "Galassia",
      "pt-BR": "Galáxia",
      "zh-Hans": "星系",
      "zh-Hant": "星系",
      ru: "Галактика",
    },
    Amas: {
      en: "Star cluster",
      ja: "星団",
      de: "Sternhaufen",
      es: "Cúmulo estelar",
      it: "Ammasso stellare",
      "pt-BR": "Aglomerado estelar",
      "zh-Hans": "星团",
      "zh-Hant": "星團",
      ru: "Звёздное скопление",
    },
    Messier: {
      en: "Messier",
      ja: "メシエ",
      de: "Messier",
      es: "Messier",
      it: "Messier",
      "pt-BR": "Messier",
      "zh-Hans": "梅西耶",
      "zh-Hant": "梅西耶",
      ru: "Мессье",
    },
    // The generic tags of the public gallery.
    Lune: {
      en: "Moon",
      ja: "月",
      de: "Mond",
      es: "Luna",
      it: "Luna",
      "pt-BR": "Lua",
      "zh-Hans": "月球",
      "zh-Hant": "月球",
      ru: "Луна",
    },
    Soleil: {
      en: "Sun",
      ja: "太陽",
      de: "Sonne",
      es: "Sol",
      it: "Sole",
      "pt-BR": "Sol",
      "zh-Hans": "太阳",
      "zh-Hant": "太陽",
      ru: "Солнце",
    },
    "Grand champ": {
      en: "Wide field",
      ja: "広視野",
      de: "Weitfeld",
      es: "Gran campo",
      it: "Grande campo",
      "pt-BR": "Grande campo",
      "zh-Hans": "广角星野",
      "zh-Hant": "廣角星野",
      ru: "Широкое поле",
    },
    // A star and a comet have a generic tag now.
    Étoile: {
      en: "Star",
      ja: "恒星",
      de: "Stern",
      es: "Estrella",
      it: "Stella",
      "pt-BR": "Estrela",
      "zh-Hans": "恒星",
      "zh-Hant": "恆星",
      ru: "Звезда",
    },
    Comète: {
      en: "Comet",
      ja: "彗星",
      de: "Komet",
      es: "Cometa",
      it: "Cometa",
      "pt-BR": "Cometa",
      "zh-Hans": "彗星",
      "zh-Hant": "彗星",
      ru: "Комета",
    },
    Planète: {
      en: "Planet",
      ja: "惑星",
      de: "Planet",
      es: "Planeta",
      it: "Pianeta",
      "pt-BR": "Planeta",
      "zh-Hans": "行星",
      "zh-Hant": "行星",
      ru: "Планета",
    },
  };
  // French tags are the source terms; a known tag reads in every language,
  // through the registry's named fallback.
  return labels[tag]
    ? copyFor({ fr: tag, ...labels[tag] }, locale, "gallery-tags.localizedTag")
    : tag;
}

/**
 * The inverse of `localizedTag` for the field where an owner edits a
 * capture's tags: a word that reads as a generic tag in the page's language
 * (« Nebula » in English, « 星雲 » in Japanese) or as its stored French word is
 * that stored word; any other word is returned as typed, never translated nor
 * normalised.
 */
export function storedTag(word, locale) {
  const text = String(word);
  if (GENERIC_TAG_WORDS.includes(text)) return text;
  return (
    GENERIC_TAG_WORDS.find((tag) => localizedTag(tag, locale) === text) ?? text
  );
}
