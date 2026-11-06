import { matchDeviceLocaleTag } from "./device-locale.js";
/**
 * The locale registry: the one list of the interface languages the
 * applications ship, shared by the web portal, the mobile apps, Astro Sync
 * and the offline-pack builder.
 *
 * Every list of languages reads this module (or its JSON copy,
 * `locales/registry.json`, written by `npm run build -w astro-contracts` for
 * the readers that are not JavaScript). Adding a
 * language is one entry here plus its catalogues; the coverage guards fail
 * loudly on every piece still missing.
 *
 * An entry carries the locale's BCP 47 tag and its parts, and its own-language
 * name. The shape is open: a later attribute (for instance the languages a
 * place-name service accepts) is one more optional field on
 * {@link LocaleEntry}, read by the code that needs it.
 */

/** Typographic conventions read by every presentation helper. */
export interface LocaleTypography {
  readonly spacing: "latin" | "han";
  readonly sentenceSeparator: string;
  readonly decimalSeparator: "." | ",";
  /**
   * How a date range inside one month is written: `omitted` where the day
   * comes before the month and the first date drops its month (« du 14 au
   * 23 oct. »), `written` where both dates keep it (« Oct 14 to Oct 23 »).
   */
  readonly rangeFirstMonth: "omitted" | "written";
  /**
   * The case a common noun that opens a name takes inside a sentence: `lower`
   * where capitals are for proper names only (« 1,6 magnitude plus sombre que
   * votre position », the phone's own position written « Votre position » on
   * its own), `keep` where nouns keep their capital (German) or the script
   * has no case (Japanese, the Chinese scripts).
   */
  readonly midSentenceCase: "lower" | "keep";
  /**
   * The separator of the thousands a number written by hand groups (« 1 200
   * mm » with a narrow no-break space in French, « 1.200 » in German,
   * « 1,200 » in English): the app's `NumberFormat` and the browser's `Intl`
   * differ on it, so both read this one.
   */
  readonly groupSeparator: string;
  /**
   * From how many digits a whole number groups its thousands: `fiveDigits`
   * where « 1200 » stays whole and « 12.000 » groups (Spanish, Italian),
   * `fourDigits` elsewhere.
   */
  readonly groupFrom: "fourDigits" | "fiveDigits";
}

/** One shipped interface language. */
export interface LocaleEntry {
  /** BCP 47 tag, as used in addresses and catalogues: `en`, `zh-Hans`, `pt-BR`. */
  readonly tag: string;
  readonly typography?: LocaleTypography;
  /** ISO 639-1 language subtag: `en`, `zh`, `pt`. */
  readonly language: string;
  /** ISO 15924 script subtag when the tag has one: `Hans`, `Hant`. */
  readonly script?: string;
  /** ISO 3166-1 region subtag when the tag has one: `BR`. */
  readonly region?: string;
  /** The language's own name, as its speakers read it: `Français`, `日本語`. */
  readonly name: string;
  /**
   * The code of the Stellarium sky-culture translation for this locale
   * (`fr`, `ja`, `zh_CN`), when one exists; absent for the default locale,
   * whose names are the culture's own.
   */
  readonly stellarium?: string;
  /**
   * The language code the place-name service (Photon, `lang`) accepts for
   * this locale's place names (`en`, `fr`, `de`), when it accepts one: the
   * public service answers only `default`, `de`, `en` and `fr` (anything
   * else is refused with a 400, checked 2026-10-02). Absent: the service is
   * asked without a language and answers with the local name of each place
   * (OpenStreetMap's own), as Japanese, Spanish, Italian and Portuguese do.
   */
  readonly geocoder?: string;
  /**
   * The regions (ISO 3166-1, `TW`) of a device language tag written without a
   * script (`zh-TW`) that read this locale: a Taiwanese or Hong Kong device
   * reads `zh-Hant`. See {@link matchDeviceLocale}.
   */
  readonly deviceRegions?: readonly string[];
  /**
   * Whether this locale is the one a device tag of its language reads when
   * nothing more precise matches (a bare `zh` reads `zh-Hans`, not
   * `zh-Hant`). Absent everywhere: the language's first shipped locale.
   */
  readonly deviceDefault?: boolean;
}

/** The registry: its default locale and its shipped locales, in display order. */
export interface LocaleRegistry {
  readonly version: 1;
  readonly defaultLocale: string;
  readonly locales: readonly LocaleEntry[];
}

function frozen(registry: LocaleRegistry): LocaleRegistry {
  return Object.freeze({
    ...registry,
    locales: Object.freeze(
      registry.locales.map((entry) =>
        Object.freeze({
          ...entry,
          ...(entry.typography
            ? { typography: Object.freeze({ ...entry.typography }) }
            : {}),
        }),
      ),
    ),
  });
}

/** The shipped registry. Never mutated; tests swap the active one instead. */
export const SHIPPED_LOCALE_REGISTRY: LocaleRegistry = frozen({
  version: 1,
  defaultLocale: "en",
  locales: [
    {
      tag: "en",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ".",
        rangeFirstMonth: "written",
        midSentenceCase: "lower",
        groupSeparator: ",",
        groupFrom: "fourDigits",
      },
      language: "en",
      name: "English",
      geocoder: "en",
    },
    {
      tag: "fr",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "omitted",
        midSentenceCase: "lower",
        groupSeparator: "\u202f",
        groupFrom: "fourDigits",
      },
      language: "fr",
      name: "Français",
      stellarium: "fr",
      geocoder: "fr",
    },
    {
      tag: "ja",
      typography: {
        spacing: "han",
        sentenceSeparator: "",
        decimalSeparator: ".",
        rangeFirstMonth: "written",
        midSentenceCase: "keep",
        groupSeparator: ",",
        groupFrom: "fourDigits",
      },
      language: "ja",
      name: "日本語",
      stellarium: "ja",
    },
    {
      tag: "de",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "written",
        midSentenceCase: "keep",
        groupSeparator: ".",
        groupFrom: "fourDigits",
      },
      language: "de",
      name: "Deutsch",
      stellarium: "de",
      geocoder: "de",
    },
    {
      tag: "es",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "omitted",
        midSentenceCase: "lower",
        groupSeparator: ".",
        groupFrom: "fiveDigits",
      },
      language: "es",
      name: "Español",
      stellarium: "es",
    },
    {
      tag: "it",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "omitted",
        midSentenceCase: "lower",
        groupSeparator: ".",
        groupFrom: "fiveDigits",
      },
      language: "it",
      name: "Italiano",
      stellarium: "it",
    },
    {
      tag: "pt-BR",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "omitted",
        midSentenceCase: "lower",
        groupSeparator: ".",
        groupFrom: "fourDigits",
      },
      language: "pt",
      region: "BR",
      name: "Português",
      stellarium: "pt_BR",
    },
    {
      tag: "zh-Hans",
      typography: {
        spacing: "han",
        sentenceSeparator: "",
        decimalSeparator: ".",
        rangeFirstMonth: "written",
        midSentenceCase: "keep",
        groupSeparator: ",",
        groupFrom: "fourDigits",
      },
      language: "zh",
      script: "Hans",
      name: "简体中文",
      stellarium: "zh_CN",
      deviceRegions: ["CN", "SG"],
      deviceDefault: true,
    },
    {
      tag: "zh-Hant",
      typography: {
        spacing: "han",
        sentenceSeparator: "",
        decimalSeparator: ".",
        rangeFirstMonth: "written",
        midSentenceCase: "keep",
        groupSeparator: ",",
        groupFrom: "fourDigits",
      },
      language: "zh",
      script: "Hant",
      name: "繁體中文",
      stellarium: "zh_TW",
      deviceRegions: ["TW", "HK", "MO"],
    },
    {
      tag: "ru",
      typography: {
        spacing: "latin",
        sentenceSeparator: " ",
        decimalSeparator: ",",
        rangeFirstMonth: "omitted",
        midSentenceCase: "lower",
        groupSeparator: "\u00a0",
        groupFrom: "fourDigits",
      },
      language: "ru",
      name: "Русский",
      stellarium: "ru",
    },
  ],
});

let activeRegistry: LocaleRegistry = SHIPPED_LOCALE_REGISTRY;

/**
 * Tests only: makes `registry` the active one (a pseudo-locale added to the
 * shipped list, to prove that every consumer follows it); `null` restores the
 * shipped registry. Consumers read the active registry at call time, never
 * at module load, so the swap reaches them.
 */
export function useLocaleRegistryForTests(
  registry: LocaleRegistry | null,
): void {
  if (registry !== null) validateLocaleRegistry(registry);
  activeRegistry =
    registry === null ? SHIPPED_LOCALE_REGISTRY : frozen(registry);
}

/** The active registry (the shipped one outside tests). */
export function localeRegistry(): LocaleRegistry {
  return activeRegistry;
}

/** The tags of the shipped locales, in display order. */
export function shippedLocales(): string[] {
  return activeRegistry.locales.map((entry) => entry.tag);
}

/** The default locale: the language every copy table falls back to. */
export function defaultLocale(): string {
  return activeRegistry.defaultLocale;
}

/** Whether `value` is the tag of a shipped locale. */
export function isShippedLocale(value: unknown): value is string {
  return (
    typeof value === "string" &&
    activeRegistry.locales.some((entry) => entry.tag === value)
  );
}

/** `value` when it is a shipped locale, else `fallback` (the default locale). */
export function shippedLocaleOr(
  value: unknown,
  fallback: string = defaultLocale(),
): string {
  return isShippedLocale(value) ? value : fallback;
}

/** The registry entry of `tag`, or `undefined`. */
export function localeEntry(tag: string): LocaleEntry | undefined {
  return activeRegistry.locales.find((entry) => entry.tag === tag);
}

/** The own-language name of `tag` (`Français`), or the tag itself. */
export function localeName(tag: string): string {
  return localeEntry(tag)?.name ?? tag;
}

/** The own-language names of the shipped locales, keyed by tag. */
export function localeNames(): Record<string, string> {
  return Object.fromEntries(
    activeRegistry.locales.map((entry) => [entry.tag, entry.name]),
  );
}

/**
 * The shipped locales other than the default that have a Stellarium
 * sky-culture translation: the locales the sky-culture routes serve.
 */
export function stellariumLocales(): string[] {
  return activeRegistry.locales
    .filter(
      (entry) =>
        entry.tag !== activeRegistry.defaultLocale &&
        typeof entry.stellarium === "string",
    )
    .map((entry) => entry.tag);
}

/** The Stellarium translation code of `tag`, or `undefined`. */
export function stellariumCode(tag: string): string | undefined {
  return localeEntry(tag)?.stellarium;
}

/**
 * The language to ask the place-name service for when searching or naming a
 * place for a reader of `tag` (the registry's `geocoder` attribute), or
 * `undefined`: the service's default, the local name of each place.
 */
export function geocoderLanguage(tag: string): string | undefined {
  return localeEntry(tag)?.geocoder;
}

/**
 * The shipped locale a device or browser language tag asks for, or `null`
 * (the caller then reads the default locale). In this order:
 *
 * 1. the tag itself (`zh-Hans`, `fr`), compared without case;
 * 2. among the locales of the tag's language, the one of the tag's script
 *    (`zh-Hant-TW` and `zh-Hant-HK` read `zh-Hant`, `zh-Hans-SG` reads
 *    `zh-Hans`);
 * 3. the one whose `deviceRegions` (or own region) holds the tag's region
 *    (`zh-TW`, `zh-HK`, `zh-MO` read `zh-Hant`; `zh-CN` reads `zh-Hans`);
 * 4. the locale of that bare language (`fr-CA` reads `fr`);
 * 5. the locale flagged `deviceDefault` (a bare `zh` reads `zh-Hans`), else
 *    the first shipped locale of the language (`pt-PT` reads `pt-BR`).
 *
 * The `locale-device-match` fixtures hold every reader of this rule equal.
 */
export function matchDeviceLocale(candidate: string): string | null {
  return matchDeviceLocaleTag(candidate, activeRegistry.locales);
}

/**
 * The subtags of `entry` joined by `_` — `fr`, `zh_Hans`, `pt_BR`.
 */
export function arbSuffix(entry: LocaleEntry): string {
  return [entry.language, entry.script, entry.region]
    .filter((part): part is string => typeof part === "string")
    .join("_");
}

/**
 * The Android resource directory of `entry`'s strings: `values-fr`,
 * `values-pt-rBR`, and the BCP 47 form `values-b+zh+Hans` when the tag has
 * a script.
 */
export function androidValuesDirectory(entry: LocaleEntry): string {
  if (entry.script)
    return `values-b+${[entry.language, entry.script, entry.region]
      .filter((part): part is string => typeof part === "string")
      .join("+")}`;
  return entry.region
    ? `values-${entry.language}-r${entry.region}`
    : `values-${entry.language}`;
}

const tagPattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/;

/** Throws when `registry` is malformed (used by the tests and the JSON writer). */
export function validateLocaleRegistry(registry: LocaleRegistry): void {
  if (registry.version !== 1)
    throw new Error("The locale registry must be version 1.");
  const tags = registry.locales.map((entry) => entry.tag);
  if (new Set(tags).size !== tags.length)
    throw new Error(`The locale registry repeats a tag: ${tags.join(", ")}.`);
  if (!tags.includes(registry.defaultLocale))
    throw new Error(
      `The default locale ${registry.defaultLocale} is not in the registry.`,
    );
  for (const entry of registry.locales) {
    const expected = [entry.language, entry.script, entry.region]
      .filter((part) => typeof part === "string")
      .join("-");
    if (!tagPattern.test(entry.tag) || entry.tag !== expected)
      throw new Error(
        `Locale ${entry.tag} must be a BCP 47 tag made of its language, script and region subtags (${expected}).`,
      );
    if (
      entry.typography !== undefined &&
      (!["latin", "han"].includes(entry.typography.spacing) ||
        typeof entry.typography.sentenceSeparator !== "string" ||
        ![".", ","].includes(entry.typography.decimalSeparator) ||
        !["omitted", "written"].includes(entry.typography.rangeFirstMonth) ||
        !["lower", "keep"].includes(entry.typography.midSentenceCase) ||
        typeof entry.typography.groupSeparator !== "string" ||
        !["fourDigits", "fiveDigits"].includes(entry.typography.groupFrom))
    )
      throw new Error(`Locale ${entry.tag}: invalid typography.`);
    if (typeof entry.name !== "string" || !entry.name.trim())
      throw new Error(`Locale ${entry.tag} needs its own-language name.`);
    if (
      entry.deviceRegions !== undefined &&
      (!Array.isArray(entry.deviceRegions) ||
        entry.deviceRegions.some(
          (region) => typeof region !== "string" || !/^[A-Z]{2}$/.test(region),
        ))
    )
      throw new Error(
        `Locale ${entry.tag}: deviceRegions lists ISO 3166-1 region codes.`,
      );
    if (
      entry.geocoder !== undefined &&
      (typeof entry.geocoder !== "string" ||
        !/^[a-z]{2,3}$/.test(entry.geocoder))
    )
      throw new Error(
        `Locale ${entry.tag}: the place-name service's language is a bare language code (${String(entry.geocoder)}).`,
      );
  }
}

/** A table of copy keyed by locale tag; the default locale's entry is required. */
export type LocaleTable<T> = { readonly [tag: string]: T | undefined };

const reportedFallbacks = new Set<string>();
const recordedFallbacks: { table: string; locale: string }[] = [];

/**
 * The one way to read a copy table kept outside the catalogues: the entry of
 * `locale`, or — when the table has none — the default locale's entry, said
 * aloud. The fallback is never an accident of `||`: it is recorded (see
 * {@link copyFallbacks}) and, in development, reported once per table and
 * locale on the console. A table without a default-locale entry is a
 * programming error and throws.
 *
 * `name` identifies the table in that report (`"AccountPage.accountCopy"`).
 */
export function copyFor<T>(
  table: LocaleTable<T>,
  locale: string | null | undefined,
  name = "copy table",
): T {
  const own = typeof locale === "string" ? table[locale] : undefined;
  if (own !== undefined) return own;
  const base = activeRegistry.defaultLocale;
  const fallback = table[base];
  if (fallback === undefined)
    throw new Error(`${name} has no ${base} entry to fall back to.`);
  const requested = typeof locale === "string" ? locale : String(locale);
  const key = `${name}\u0000${requested}`;
  if (!reportedFallbacks.has(key)) {
    reportedFallbacks.add(key);
    recordedFallbacks.push({ table: name, locale: requested });
    const environment = (
      globalThis as { process?: { env?: Record<string, string | undefined> } }
    ).process?.env;
    if (environment?.NODE_ENV === "development")
      console.warn(
        `[locales] ${name} has no "${requested}" entry: showing ${base}.`,
      );
  }
  return fallback;
}

/**
 * The tag whose entry {@link copyFor} reads for `locale`: `locale` itself, or
 * — recorded and reported exactly as {@link copyFor} does — the default
 * locale. For copy whose language must be stated with it: an e-mail's
 * `<html lang>`, the language of a date written next to the words.
 */
export function copyLocaleFor<T>(
  table: LocaleTable<T>,
  locale: string | null | undefined,
  name = "copy table",
): string {
  if (typeof locale === "string" && table[locale] !== undefined) return locale;
  copyFor(table, locale, name);
  return activeRegistry.defaultLocale;
}

/** Every (table, locale) pair that fell back to the default locale so far. */
export function copyFallbacks(): readonly { table: string; locale: string }[] {
  return recordedFallbacks.slice();
}

/** A registered device-language variant inherits its locale's typography. */
export function localeTypography(tag: string): LocaleTypography {
  const matched = matchDeviceLocale(tag);
  return (
    (matched ? localeEntry(matched)?.typography : undefined) ?? {
      spacing: "latin",
      sentenceSeparator: " ",
      decimalSeparator: ".",
      rangeFirstMonth: "written",
      midSentenceCase: "lower",
      groupSeparator: ",",
      groupFrom: "fourDigits",
    }
  );
}
