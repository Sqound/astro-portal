import {
  constellationTable,
  type ConstellationRow,
  type SkyNames,
} from "./constellation-table.js";

// The 88 IAU constellations as the catalogue knows them. A constellation's
// catalogue key is its IAU abbreviation (`Lyr`, `UMa`, `CrB`): the key of a
// target's `constellationKey`, of the `constellation` filter, of the
// constellation's own catalogue entry. The names are display only, in the ten
// languages of the application.

export type { ConstellationRow, SkyNames };
export { constellationTable };

/** The catalogue keys, in the alphabetical order of the Latin names. */
export const constellationKeys: readonly string[] = constellationTable.map(
  (row) => row.key,
);

const byKey = new Map(constellationTable.map((row) => [row.key, row]));

/** The constellation with this catalogue key (the exact abbreviation). */
export function constellationByKey(key: unknown): ConstellationRow | undefined {
  return typeof key === "string" ? byKey.get(key) : undefined;
}

/** A name compared without case, accents, apostrophes or spacing. */
export function foldConstellationName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’'`.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Every spelling that names a constellation: the abbreviation, the Latin
// name, the traditional English one, the ten localized names and the extra
// spellings of the table. A spelling shared by two constellations (the
// English « Compass » is both Pyxis and Circinus) names neither.
const keyBySpelling = (() => {
  const found = new Map<string, string | null>();
  const add = (spelling: string, key: string) => {
    const folded = foldConstellationName(spelling);
    if (!folded) return;
    const existing = found.get(folded);
    if (existing === undefined) found.set(folded, key);
    else if (existing !== key) found.set(folded, null);
  };
  for (const row of constellationTable) {
    add(row.key, row.key);
    add(row.latinName, row.key);
    add(row.englishName, row.key);
    for (const name of Object.values(row.names)) add(name, row.key);
    for (const alias of row.aliases) add(alias, row.key);
  }
  return found;
})();

/**
 * The catalogue key (`Lyr`) of whatever names a constellation: its
 * abbreviation, its Latin, English, French… name, or an older spelling the
 * catalogue used to carry (« Lyre », « Boötes » / « Bootes », « Se1 » /
 * « Se2 » for the Serpent). `null` when the value names none (« Système
 * solaire » is not a constellation).
 */
export function canonicalConstellationKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const exact = byKey.get(value.trim());
  if (exact) return exact.key;
  return keyBySpelling.get(foldConstellationName(value)) ?? null;
}

/**
 * The constellation's name in [locale]; a locale of the application that is
 * not one of the ten, or a constellation with no name in it, reads the Latin
 * name. `null` for a key that is not a constellation's.
 */
export function constellationName(key: unknown, locale = "en"): string | null {
  const row = constellationByKey(canonicalConstellationKey(key));
  if (!row) return null;
  return (
    (row.names as Record<string, string | undefined>)[locale] ?? row.names.en
  );
}

/** The names of every constellation, by catalogue key (the taxonomy document). */
export const constellationNames: Readonly<Record<string, SkyNames>> =
  Object.fromEntries(constellationTable.map((row) => [row.key, row.names]));
