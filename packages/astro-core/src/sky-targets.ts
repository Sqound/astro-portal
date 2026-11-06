import { brightStarTable, type BrightStarRow } from "./bright-star-table.js";
import {
  constellationTable,
  type ConstellationRow,
  type SkyNames,
} from "./constellation-table.js";
import { roundSignificant, lightYearsPerParsec } from "./target-distance.js";
import { skyCultureImageFor } from "./sky-culture-images.js";

// Two kinds of catalogue entry the application writes itself, beside the deep
// sky of the imported library and the Solar System's bodies
// (`solar-system-catalogue.ts`): the 92 bright stars (visual magnitude 2.5 or
// brighter) and the 88 constellations. They are merged into the catalogue at
// every import, so they survive a change of the library. The tables come
// from `packages/astro-core/sky-data/` (`scripts/generate-sky-catalogue-tables.mjs`).

export const brightStarCatalogue = "BrightStars";
export const constellationCatalogue = "Constellations";
export const brightStarType = "Étoile brillante";
export const constellationType = "Constellation";

/** What the data of the bright stars stands on, for the credit lines. */
export const brightStarSources = [
  {
    label:
      "ESA, The Hipparcos and Tycho Catalogues (1997); van Leeuwen, Hipparcos, the New Reduction (2007)",
    url: "https://www.cosmos.esa.int/web/hipparcos",
  },
  {
    label:
      "IAU Working Group on Star Names, Catalog of Star Names (proper names)",
    url: "https://www.iau.org/public/themes/naming_stars/",
  },
  {
    label:
      "HYG Database (spectral types, colour indices, HR and HD numbers), CC BY-SA 4.0",
    url: "https://github.com/astronexus/HYG-Database",
  },
] as const;

export type StellarRecord = {
  hip: number;
  hr: number | null;
  hd: number | null;
  /** The proper name, `null` for a star that has none in common use. */
  properName: string | null;
  /**
   * `iau`: a name of the IAU Catalog of Star Names; `traditional`: a name in
   * common use the catalogue does not list; `null`: no proper name.
   */
  nameKind: "iau" | "traditional" | null;
  /** `α Lyr`. */
  bayer: string;
  /** `α Lyrae`. */
  bayerGenitive: string;
  /** The name in each of the ten languages of the application. */
  names: SkyNames;
  /** The B−V colour index; `null` when unknown. */
  colorIndexBV: number | null;
  spectralType: string;
  /**
   * Whether the distance is an estimate: a parallax beyond 150 parsecs
   * (under 6.7 milliarcseconds) leaves an uncertainty of ten per cent or
   * more.
   */
  distanceIsEstimate: boolean;
  /** J2000.0 position, no proper motion (a few arc minutes since 2000). */
  epoch: "J2000.0";
};

export type ConstellationRecord = {
  /** The IAU abbreviation (`Lyr`), the catalogue key. */
  abbreviation: string;
  latinName: string;
  genitive: string;
  /** The name in each of the ten languages of the application. */
  names: SkyNames;
  /** Radius, in degrees, of the smallest circle that holds its lines. */
  linesRadiusDegrees: number;
  /** How many of the 92 bright stars it holds. */
  brightStarCount: number;
  /** Whether the western sky culture draws an illustration of it. */
  hasDrawing: boolean;
};

const greekNames: Readonly<Record<string, string>> = {
  α: "Alpha",
  β: "Beta",
  γ: "Gamma",
  δ: "Delta",
  ε: "Epsilon",
  ζ: "Zeta",
  η: "Eta",
  θ: "Theta",
  ι: "Iota",
  κ: "Kappa",
  λ: "Lambda",
  μ: "Mu",
  ν: "Nu",
  ξ: "Xi",
  ο: "Omicron",
  π: "Pi",
  ρ: "Rho",
  σ: "Sigma",
  τ: "Tau",
  υ: "Upsilon",
  φ: "Phi",
  χ: "Chi",
  ψ: "Psi",
  ω: "Omega",
};
const superscriptDigits: Readonly<Record<string, string>> = {
  "¹": "1",
  "²": "2",
  "³": "3",
};

/** Beyond this distance (parsecs) a Hipparcos parallax is an estimate. */
export const estimatedDistanceParsecs = 150;

const constellationByKey = new Map<string, ConstellationRow>(
  constellationTable.map((row) => [row.key, row]),
);

function distinct(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function starEntry(star: BrightStarRow) {
  const constellation = constellationByKey.get(star.constellation);
  if (!constellation)
    throw new Error(`Unknown constellation ${star.constellation}`);
  const letter = star.bayerLetter.slice(0, 1);
  const suffix = star.bayerLetter.slice(1);
  const number = superscriptDigits[suffix] ?? "";
  const greek = greekNames[letter] ?? letter;
  const bayer = `${star.bayerLetter} ${star.constellation}`;
  const bayerGenitive = `${star.bayerLetter} ${constellation.genitive}`;
  const designation = star.name ?? bayer;
  const lightYears = roundSignificant(
    star.distanceParsecs * lightYearsPerParsec,
    3,
  );
  const estimate = star.distanceParsecs > estimatedDistanceParsecs;
  const parallax = Math.round(100000 / star.distanceParsecs) / 100;
  const stellar: StellarRecord = {
    hip: star.hip,
    hr: star.hr,
    hd: star.hd,
    properName: star.name,
    nameKind: star.nameKind,
    bayer,
    bayerGenitive,
    names: star.names,
    colorIndexBV: star.bv,
    spectralType: star.spectralType,
    distanceIsEstimate: estimate,
    epoch: "J2000.0",
  };
  return {
    id: `star-hip-${star.hip}`,
    designation,
    aliases: distinct([
      designation,
      bayer,
      bayerGenitive,
      `${greek}${number} ${constellation.genitive}`,
      number ? `${letter}${number} ${star.constellation}` : null,
      number ? `${greek} ${constellation.genitive}` : null,
      star.hr ? `HR ${star.hr}` : null,
      star.hd ? `HD ${star.hd}` : null,
      `HIP ${star.hip}`,
    ]),
    // Every distinct name the star has in the ten languages: they are what a
    // search by name reads.
    commonNames: distinct(
      star.name ? [star.name, ...Object.values(star.names)] : [],
    ),
    typeKey: brightStarType,
    constellationKey: star.constellation,
    coordinate: { ra: Math.round((star.ra / 15) * 1e6) / 1e6, dec: star.dec },
    apparentSizeArcmin: null,
    magnitude: star.magnitude,
    surfaceBrightness: null,
    catalogues: [brightStarCatalogue],
    catalogue: brightStarCatalogue,
    isBest: false,
    isExtended: false,
    distance: {
      lightYears,
      source: "parallax" as const,
      reference: `${estimate ? "Estimation : " : ""}Hipparcos parallax, about ${parallax} mas`,
    },
    stellar,
    // Its picture: the sky map centred on it (`sky-culture-images.ts`).
    dssImage: skyCultureImageFor(`star-hip-${star.hip}`),
  };
}

function constellationEntry(row: ConstellationRow, brightStarCount: number) {
  const record: ConstellationRecord = {
    abbreviation: row.key,
    latinName: row.latinName,
    genitive: row.genitive,
    names: row.names,
    linesRadiusDegrees: row.linesRadiusDegrees,
    brightStarCount,
    hasDrawing: row.hasDrawing,
  };
  return {
    id: `constellation-${row.key.toLowerCase()}`,
    designation: row.latinName,
    aliases: distinct([
      row.latinName,
      row.key,
      row.englishName,
      ...row.aliases,
    ]),
    commonNames: distinct(Object.values(row.names)),
    typeKey: constellationType,
    constellationKey: row.key,
    // The centre of the circle that holds its lines: the point a map centres
    // on and the season is computed for.
    coordinate: {
      ra: row.centreRightAscensionHours,
      dec: row.centreDeclinationDegrees,
    },
    apparentSizeArcmin: null,
    magnitude: null,
    surfaceBrightness: null,
    catalogues: [constellationCatalogue],
    catalogue: constellationCatalogue,
    isBest: false,
    isExtended: false,
    constellationInfo: record,
    // Its picture: its lines and its drawing (`sky-culture-images.ts`).
    dssImage: skyCultureImageFor(`constellation-${row.key.toLowerCase()}`),
  };
}

/**
 * How a kind of entry may enter a night's plan, from its type. A bright star
 * is added by hand, in visual mode only (`planVisualOnly`): never offered by
 * the suggestions, never photographed. A constellation is not an object to
 * observe: it is never put in a plan (`planExcluded`). Every other type is an
 * ordinary target.
 */
export function planUseOfType(typeKey: string | null | undefined): {
  planVisualOnly: boolean;
  planExcluded: boolean;
} {
  return {
    planVisualOnly: typeKey === brightStarType,
    planExcluded: typeKey === constellationType,
  };
}

/** The 92 bright stars as catalogue entries, brightest first. */
export const brightStarCatalogueTargets = brightStarTable.map(starEntry);

const brightStarsIn = new Map<string, number>();
for (const star of brightStarTable)
  brightStarsIn.set(
    star.constellation,
    (brightStarsIn.get(star.constellation) ?? 0) + 1,
  );

/** The 88 constellations as catalogue entries, in the Latin alphabetical order. */
export const constellationCatalogueTargets = constellationTable.map((row) =>
  constellationEntry(row, brightStarsIn.get(row.key) ?? 0),
);

/**
 * A fingerprint of the two tables: the catalogue's source revision includes
 * it, so an instance imports them again when they change.
 */
export const skyTargetsRevision = (() => {
  const text = JSON.stringify([
    brightStarCatalogueTargets,
    constellationCatalogueTargets,
  ]);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
})();
