import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SHIPPED_LOCALE_REGISTRY,
  androidValuesDirectory,
  arbSuffix,
  copyFallbacks,
  copyFor,
  geocoderLanguage,
  isShippedLocale,
  localeNames,
  localeTypography,
  matchDeviceLocale,
  shippedLocaleOr,
  shippedLocales,
  stellariumCode,
  stellariumLocales,
  useLocaleRegistryForTests,
  validateLocaleRegistry,
} from "../dist/locales.js";

// A test-only locale: never in the shipped registry. Its tag is the
// conventional pseudo-locale of accented, longer English.
const pseudo = { tag: "en-XA", language: "en", region: "XA", name: "Pseudo" };
const withPseudo = {
  ...SHIPPED_LOCALE_REGISTRY,
  locales: [...SHIPPED_LOCALE_REGISTRY.locales, pseudo],
};

const json = (relative) =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));

test("the shipped registry: English, French, Japanese, German, Spanish, Italian, Brazilian Portuguese, the Chinese scripts and Russian, English by default", () => {
  validateLocaleRegistry(SHIPPED_LOCALE_REGISTRY);
  assert.deepEqual(shippedLocales(), [
    "en",
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "zh-Hans",
    "zh-Hant",
    "ru",
  ]);
  assert.equal(SHIPPED_LOCALE_REGISTRY.defaultLocale, "en");
  assert.deepEqual(localeNames(), {
    en: "English",
    fr: "Français",
    ja: "日本語",
    de: "Deutsch",
    es: "Español",
    it: "Italiano",
    "pt-BR": "Português",
    "zh-Hans": "简体中文",
    "zh-Hant": "繁體中文",
    ru: "Русский",
  });
  assert.deepEqual(stellariumLocales(), [
    "fr",
    "ja",
    "de",
    "es",
    "it",
    "pt-BR",
    "zh-Hans",
    "zh-Hant",
    "ru",
  ]);
  assert.deepEqual(
    ["de", "es", "it", "pt-BR", "zh-Hans", "zh-Hant", "ru"].map(stellariumCode),
    ["de", "es", "it", "pt_BR", "zh_CN", "zh_TW", "ru"],
  );
  // Only German is a language the place-name service accepts (the public
  // Photon instance answers `default, de, en, fr`: Spanish, Italian and
  // Portuguese are refused, checked 2026-10-02).
  assert.equal(geocoderLanguage("de"), "de");
  for (const tag of ["es", "it", "pt-BR"])
    assert.equal(geocoderLanguage(tag), undefined, tag);
  // Neither Chinese script nor Russian is a language the place-name service
  // accepts: it answers with each place's local name, as for Japanese.
  for (const tag of ["zh-Hans", "zh-Hant", "ru"])
    assert.equal(geocoderLanguage(tag), undefined);
  assert.equal(shippedLocaleOr("xx"), "en");
  assert.equal(isShippedLocale("ja"), true);
  assert.equal(Object.isFrozen(SHIPPED_LOCALE_REGISTRY.locales), true);
});

test("locales/registry.json is the registry, as the build writes it", () => {
  const { $comment, ...document } = json("../locales/registry.json");
  assert.match($comment, /never edit by hand/);
  assert.deepEqual(
    document,
    JSON.parse(JSON.stringify(SHIPPED_LOCALE_REGISTRY)),
  );
});

test("file names follow the tag: ARB suffixes and Android resource directories", () => {
  const entries = [
    { tag: "fr", language: "fr", name: "Français" },
    { tag: "pt-BR", language: "pt", region: "BR", name: "Português" },
    { tag: "zh-Hans", language: "zh", script: "Hans", name: "简体中文" },
    { tag: "zh-Hant", language: "zh", script: "Hant", name: "繁體中文" },
  ];
  assert.deepEqual(entries.map(arbSuffix), [
    "fr",
    "pt_BR",
    "zh_Hans",
    "zh_Hant",
  ]);
  assert.deepEqual(entries.map(androidValuesDirectory), [
    "values-fr",
    "values-pt-rBR",
    "values-b+zh+Hans",
    "values-b+zh+Hant",
  ]);
  validateLocaleRegistry({
    ...SHIPPED_LOCALE_REGISTRY,
    locales: [
      ...SHIPPED_LOCALE_REGISTRY.locales,
      { tag: "sr-Latn", language: "sr", script: "Latn", name: "Srpski" },
      { tag: "ms-MY", language: "ms", region: "MY", name: "Melayu" },
    ],
  });
});

test("a malformed registry is refused", () => {
  const broken =
    (locales, defaultLocale = "en") =>
    () =>
      validateLocaleRegistry({ version: 1, defaultLocale, locales });
  const en = { tag: "en", language: "en", name: "English" };
  assert.throws(broken([en, en]), /repeats a tag/);
  assert.throws(broken([en], "fr"), /default locale fr/);
  assert.throws(
    broken([en, { tag: "zh-Hans", language: "zh", name: "中文" }]),
    /language, script and region/,
  );
  assert.throws(
    broken([en, { tag: "de", language: "de", name: " " }]),
    /own-language name/,
  );
});

test("copyFor: the locale's own entry, else English said aloud, never an accident", () => {
  const table = { en: "Plan", fr: "Planifier" };
  assert.equal(copyFor(table, "fr", "test.table"), "Planifier");
  assert.equal(copyFor(table, "ja", "test.table"), "Plan");
  assert.equal(copyFor(table, undefined, "test.table"), "Plan");
  assert.ok(
    copyFallbacks().some(
      (entry) => entry.table === "test.table" && entry.locale === "ja",
    ),
  );
  assert.throws(
    () => copyFor({ fr: "Planifier" }, "ja", "test.french"),
    /no en entry/,
  );
});

test("a test-registered pseudo-locale flows through the registry's readers", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests(withPseudo);
  const shipped = SHIPPED_LOCALE_REGISTRY.locales.map((entry) => entry.tag);
  assert.deepEqual(shippedLocales(), [...shipped, "en-XA"]);
  assert.equal(isShippedLocale("en-XA"), true);
  assert.equal(shippedLocaleOr("en-XA"), "en-XA");
  assert.equal(localeNames()["en-XA"], "Pseudo");
  // No Stellarium translation: the sky-culture routes do not serve it.
  assert.deepEqual(
    stellariumLocales(),
    SHIPPED_LOCALE_REGISTRY.locales
      .filter((entry) => entry.stellarium && entry.tag !== "en")
      .map((entry) => entry.tag),
  );
  assert.equal(
    copyFor({ en: "Plan", fr: "Planifier" }, "en-XA", "test.pseudo"),
    "Plan",
  );
  useLocaleRegistryForTests(null);
  assert.deepEqual(shippedLocales(), shipped);
});

test("a device or browser tag reads the registry's locale: script, then region, then bare language", () => {
  const cases = {
    // Chinese: the script wins, then the region, a bare tag reads Simplified.
    zh: "zh-Hans",
    "zh-CN": "zh-Hans",
    "zh-SG": "zh-Hans",
    "zh-Hans-CN": "zh-Hans",
    "zh-TW": "zh-Hant",
    "zh-HK": "zh-Hant",
    "zh-MO": "zh-Hant",
    "zh-Hant-TW": "zh-Hant",
    "zh-Hant-CN": "zh-Hant",
    zh_Hant_HK: "zh-Hant",
    "zh-hant-tw": "zh-Hant",
    "zh-Hans-TW": "zh-Hans",
    // The other languages.
    ru: "ru",
    "ru-RU": "ru",
    "ru-UA": "ru",
    "fr-CA": "fr",
    "ja-JP": "ja",
    "en-GB": "en",
    "ZH-tw": "zh-Hant",
  };
  for (const [candidate, expected] of Object.entries(cases))
    assert.equal(matchDeviceLocale(candidate), expected, candidate);
  // A language the product does not ship reads nothing: the caller reads English.
  assert.equal(matchDeviceLocale("xx-YY"), null);
  assert.equal(matchDeviceLocale(""), null);
  assert.equal(shippedLocaleOr(matchDeviceLocale("xx-YY")), "en");
  // The registry's own attributes are what the rule reads.
  const hant = SHIPPED_LOCALE_REGISTRY.locales.find((e) => e.tag === "zh-Hant");
  const hans = SHIPPED_LOCALE_REGISTRY.locales.find((e) => e.tag === "zh-Hans");
  assert.deepEqual(hant.deviceRegions, ["TW", "HK", "MO"]);
  assert.deepEqual(hans.deviceRegions, ["CN", "SG"]);
  assert.equal(hans.deviceDefault, true);
  assert.equal(hant.deviceDefault, undefined);
  assert.throws(
    () =>
      validateLocaleRegistry({
        version: 1,
        defaultLocale: "en",
        locales: [
          { tag: "en", language: "en", name: "English" },
          {
            tag: "zh-Hant",
            language: "zh",
            script: "Hant",
            name: "繁體中文",
            deviceRegions: ["Taiwan"],
          },
        ],
      }),
    /region codes/,
  );
});

test("the contracts' locale enumerations mirror the registry", () => {
  const shipped = [...shippedLocales()].sort();
  const enums = {
    "sign-in.schema.json": json("../schemas/api/sign-in.schema.json"),
    "target-index.schema.json": json("../schemas/api/target-index.schema.json"),
    "target-library-query.schema.json": json(
      "../schemas/api/target-library-query.schema.json",
    ),
  };
  const found = [];
  const walk = (node, file) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node.enum) && node.enum.includes("ja"))
      found.push([file, node.enum]);
    for (const value of Object.values(node)) walk(value, file);
  };
  for (const [file, schema] of Object.entries(enums)) walk(schema, file);
  assert.equal(found.length, 3);
  for (const [file, values] of found)
    assert.deepEqual(
      [...values].sort(),
      shipped,
      `${file} lists other locales than the registry`,
    );
});

test("typography is registry-owned, immutable, and validated", () => {
  assert.equal(localeTypography("zh-TW").spacing, "han");
  assert.equal(localeTypography("fr-CA").decimalSeparator, ",");
  assert.equal(localeTypography("en").sentenceSeparator, " ");
  // « du 14 au 23 oct. »: the languages that put the day first drop the first
  // month of a range inside one month; the others write both.
  const omitted = SHIPPED_LOCALE_REGISTRY.locales
    .filter(({ typography }) => typography.rangeFirstMonth === "omitted")
    .map(({ tag }) => tag);
  assert.deepEqual(omitted, ["fr", "es", "it", "pt-BR", "ru"]);
  assert.equal(localeTypography("pt-PT").rangeFirstMonth, "omitted");
  // « votre position »: capitals for names only, so a common noun opening a
  // name is lowered inside a sentence; German keeps its noun capitals.
  assert.deepEqual(
    SHIPPED_LOCALE_REGISTRY.locales
      .filter(({ typography }) => typography.midSentenceCase === "lower")
      .map(({ tag }) => tag),
    ["en", "fr", "es", "it", "pt-BR", "ru"],
  );
  assert.ok(Object.isFrozen(localeTypography("ja")));
  assert.throws(
    () =>
      validateLocaleRegistry({
        ...SHIPPED_LOCALE_REGISTRY,
        locales: [
          {
            ...SHIPPED_LOCALE_REGISTRY.locales[0],
            typography: {
              spacing: "unknown",
              sentenceSeparator: " ",
              decimalSeparator: ".",
              rangeFirstMonth: "written",
              midSentenceCase: "keep",
            },
          },
        ],
      }),
    /invalid typography/,
  );
});
