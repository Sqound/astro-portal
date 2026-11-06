import { skyTextTable } from "./sky-text-table.js";
import { brightStarType, constellationType } from "./sky-targets.js";

// The short texts of the 92 bright stars and the 88 constellations: two to
// four sentences per entry and language, written from a table of verified
// facts (`packages/astro-core/sky-data/texts/facts.json`). A text is read by
// its key, `hip:<HIP>` for a star and the IAU abbreviation for a
// constellation; a language without the text falls back to English.

export type SkyTextTable = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

/** The language read when the asked one has no text. */
export const skyTextFallbackLocale = "en";

/** The key of a bright star's text: `hip:32349`. */
export function brightStarTextKey(hip: number): string {
  return `hip:${hip}`;
}

/** The key of a constellation's text: its IAU abbreviation (`Lyr`). */
export function constellationTextKey(abbreviation: string): string {
  return abbreviation;
}

/**
 * The text of an entry and the language it is written in: the asked
 * language, else English (`fallback` is then true), else `null`.
 * `table` is for the tests; the service reads the generated one.
 */
export function skyTextChoice(
  key: string,
  locale: string,
  table: SkyTextTable = skyTextTable,
): { text: string; locale: string; fallback: boolean } | null {
  for (const candidate of [locale, skyTextFallbackLocale]) {
    const text = table[candidate]?.[key];
    if (text)
      return { text, locale: candidate, fallback: candidate !== locale };
  }
  return null;
}

/**
 * The text of an entry in a language, else in English, else `null`.
 * `table` is for the tests; the service reads the generated one.
 */
export function skyText(
  key: string,
  locale: string,
  table: SkyTextTable = skyTextTable,
): string | null {
  return skyTextChoice(key, locale, table)?.text ?? null;
}

type SkyEntry = {
  typeKey?: string | null;
  constellationKey?: string | null;
  stellar?: { hip?: number | null } | null;
};

/**
 * The text key of a catalogue entry when it is a bright star or a
 * constellation, else `null`.
 */
export function skyTextKeyOf(
  entry: SkyEntry | null | undefined,
): string | null {
  if (!entry) return null;
  if (entry.typeKey === brightStarType && Number.isInteger(entry.stellar?.hip))
    return brightStarTextKey(entry.stellar!.hip!);
  if (entry.typeKey === constellationType && entry.constellationKey)
    return constellationTextKey(entry.constellationKey);
  return null;
}
