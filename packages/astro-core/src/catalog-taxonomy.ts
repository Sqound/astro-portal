import { taxonomyNamesMore } from "./locale-names-more.js";
import {
  canonicalConstellationKey,
  constellationByKey,
  constellationKeys,
  constellationNames,
} from "./constellations.js";

// Object types, catalogues and the planner's data use stable French
// identifiers (« Galaxie »), while presentation is localized. A constellation's
// key is its IAU abbreviation (`Lyr`, see `constellations.ts`).
type LocalizedLabels = Record<
  string,
  Record<string, string | undefined> & { en: string; ja: string }
>;
type TaxonomyLabels = LocalizedLabels;
type ConstellationLabels = LocalizedLabels;
type TaxonomyOverrides = {
  objectTypeAliases?: Record<string, string>;
  taxonomyLabels?: TaxonomyLabels;
  constellationLabels?: ConstellationLabels;
};

export const captureCategories = [
  "Ciel profond",
  "Soleil",
  "Lune",
  "Planète",
  "Paysage céleste",
];

export const objectTypes = [
  "Galaxie",
  "Amas globulaire",
  "Amas ouvert",
  "Nébuleuse en émission",
  "Nébuleuse en réflexion",
  "Nébuleuse planétaire",
  "Rémanent de supernova",
  "Nébuleuse sombre",
  "Étoile",
  "Étoile brillante",
  "Constellation",
  "Soleil",
  "Lune",
  "Planète",
  "Planète naine",
  "Système solaire",
];

export const objectTypeAliases: Record<string, string> = {
  "Complexe de nébuleuses en émission": "Nébuleuse en émission",
  "Région H II / nébuleuse en émission": "Nébuleuse en émission",
  "Région HII / nébuleuse en émission": "Nébuleuse en émission",
};

/**
 * The names the catalogue's query string gives the two types the application
 * writes itself (`GET /v1/targets?type=stellar`, `…?type=constellation`).
 */
export const objectTypeQueryNames: Record<string, string> = {
  stellar: "Étoile brillante",
  constellation: "Constellation",
};

/**
 * The type a `type` filter of the query string names: the French identifier
 * (« Galaxie »), a canonical alias, or `stellar` / `constellation`.
 */
export function queriedObjectType(value: string): string {
  const trimmed = value.trim();
  return (
    objectTypeQueryNames[trimmed.toLowerCase()] ?? canonicalObjectType(trimmed)
  );
}

export function canonicalObjectType(
  value: string,
  aliases: Record<string, string> = objectTypeAliases,
): string {
  return aliases?.[value] || value;
}

/**
 * The catalogue keys of the 88 constellations: their IAU abbreviations
 * (`Lyr`), in the alphabetical order of the Latin names. The names in the
 * ten languages are in `constellation-table.ts` (`data/constellations.json`).
 */
export const constellations: readonly string[] = constellationKeys;

export const taxonomyLabels: TaxonomyLabels = {
  "Ciel profond": {
    en: "Deep sky",
    ja: "深宇宙",
    de: "Deep Sky",
    es: "Cielo profundo",
    it: "Cielo profondo",
    "pt-BR": "Céu profundo",
  },
  Soleil: {
    en: "Solar",
    ja: "太陽",
    de: "Sonne",
    es: "Sol",
    it: "Sole",
    "pt-BR": "Sol",
  },
  Lune: {
    en: "Moon",
    ja: "月",
    de: "Mond",
    es: "Luna",
    it: "Luna",
    "pt-BR": "Lua",
  },
  Planète: {
    en: "Planet",
    ja: "惑星",
    de: "Planet",
    es: "Planeta",
    it: "Pianeta",
    "pt-BR": "Planeta",
  },
  "Planète naine": {
    en: "Dwarf planet",
    ja: "準惑星",
    de: "Zwergplanet",
    es: "Planeta enano",
    it: "Pianeta nano",
    "pt-BR": "Planeta anão",
  },
  "Paysage céleste": {
    en: "Nightscape",
    ja: "星景",
    de: "Nachtlandschaft",
    es: "Paisaje nocturno",
    it: "Paesaggio notturno",
    "pt-BR": "Paisagem noturna",
  },
  Galaxie: {
    en: "Galaxy",
    ja: "銀河",
    de: "Galaxie",
    es: "Galaxia",
    it: "Galassia",
    "pt-BR": "Galáxia",
  },
  "Amas globulaire": {
    en: "Globular cluster",
    ja: "球状星団",
    de: "Kugelsternhaufen",
    es: "Cúmulo globular",
    it: "Ammasso globulare",
    "pt-BR": "Aglomerado globular",
  },
  "Amas ouvert": {
    en: "Open cluster",
    ja: "散開星団",
    de: "Offener Sternhaufen",
    es: "Cúmulo abierto",
    it: "Ammasso aperto",
    "pt-BR": "Aglomerado aberto",
  },
  "Nébuleuse en émission": {
    en: "Emission nebula",
    ja: "散光星雲",
    de: "Emissionsnebel",
    es: "Nebulosa de emisión",
    it: "Nebulosa a emissione",
    "pt-BR": "Nebulosa de emissão",
  },
  "Nébuleuse en réflexion": {
    en: "Reflection nebula",
    ja: "反射星雲",
    de: "Reflexionsnebel",
    es: "Nebulosa de reflexión",
    it: "Nebulosa a riflessione",
    "pt-BR": "Nebulosa de reflexão",
  },
  "Nébuleuse planétaire": {
    en: "Planetary nebula",
    ja: "惑星状星雲",
    de: "Planetarischer Nebel",
    es: "Nebulosa planetaria",
    it: "Nebulosa planetaria",
    "pt-BR": "Nebulosa planetária",
  },
  "Rémanent de supernova": {
    en: "Supernova remnant",
    ja: "超新星残骸",
    de: "Supernova-Überrest",
    es: "Remanente de supernova",
    it: "Resto di supernova",
    "pt-BR": "Remanescente de supernova",
  },
  "Nébuleuse sombre": {
    en: "Dark nebula",
    ja: "暗黒星雲",
    de: "Dunkelnebel",
    es: "Nebulosa oscura",
    it: "Nebulosa oscura",
    "pt-BR": "Nebulosa escura",
  },
  Étoile: {
    en: "Star",
    ja: "恒星",
    de: "Stern",
    es: "Estrella",
    it: "Stella",
    "pt-BR": "Estrela",
  },
  "Étoile brillante": {
    en: "Bright star",
    ja: "明るい恒星",
    de: "Heller Stern",
    es: "Estrella brillante",
    it: "Stella brillante",
    "pt-BR": "Estrela brilhante",
  },
  Constellation: {
    en: "Constellation",
    ja: "星座",
    de: "Sternbild",
    es: "Constelación",
    it: "Costellazione",
    "pt-BR": "Constelação",
  },
  "Système solaire": {
    en: "Solar System",
    ja: "太陽系",
    de: "Sonnensystem",
    es: "Sistema solar",
    it: "Sistema solare",
    "pt-BR": "Sistema Solar",
  },
};

/**
 * The constellations' names by locale, keyed by the catalogue key (the IAU
 * abbreviation): the `ConstellationRow.names` of every constellation, one
 * property per interface locale. A locale that is not one of the ten reads the
 * Latin name (`taxonomyLabel`: absent = English / Latin, never the key).
 */
export const constellationLabels: ConstellationLabels = {
  ...constellationNames,
};

/**
 * The label of a catalogue value in [locale]: an object type (« Galaxie »,
 * « Étoile brillante ») or a constellation, given by its catalogue key (`Lyr`)
 * or by any name or older spelling that names it (`canonicalConstellationKey`:
 * « Lyre », « Boötes », « Se1 »). A value that is neither is returned as it
 * is.
 */
export function taxonomyLabel(
  value: string,
  locale = "fr",
  taxonomy: TaxonomyOverrides | null = null,
): string {
  // A deployed instance may intentionally customize a few entries while its
  // static document predates newly added catalogue terms.  Merge reference
  // defaults first so absent labels still localize instead of falling back to
  // the stable French identifier.
  const aliases = {
    ...objectTypeAliases,
    ...(taxonomy?.objectTypeAliases || {}),
  };
  const labels = { ...taxonomyLabels, ...(taxonomy?.taxonomyLabels || {}) };
  value = canonicalObjectType(value, aliases);
  const key = labels[value] ? null : canonicalConstellationKey(value);
  const row = constellationByKey(key);
  if (row) {
    // The stored document may keep a constellation's names under an older
    // spelling of its key: it is read through the same resolution.
    const stored = Object.entries(taxonomy?.constellationLabels || {}).find(
      ([storedKey]) => canonicalConstellationKey(storedKey) === row.key,
    )?.[1];
    const names = row.names as Record<string, string | undefined>;
    return stored?.[locale] || names[locale] || stored?.en || row.names.en;
  }
  if (locale === "fr") return value;
  // A locale without its own label reads the English label: never the French
  // key (absent = English, the content rule of the locale registry).
  return (
    labels[value]?.[locale] ||
    taxonomyNamesMore[value]?.[locale] ||
    labels[value]?.en ||
    value
  );
}
