import assert from "node:assert/strict";
import test from "node:test";
import {
  SHIPPED_LOCALE_REGISTRY,
  copyFallbacks,
  shippedLocales,
  useLocaleRegistryForTests,
} from "astro-contracts/locales";
import { signInMessage } from "../dist/spaces/messages.js";
import {
  exportWords,
  planCalendarIcs,
  planShareText,
  weatherReminderIcs,
} from "../dist/planner/export.js";
import {
  normalizeSearch,
  searchFoldingFor,
  useSearchFoldingForTests,
} from "../dist/i18n.js";
import { knowledgeTextFor, localeChoice } from "../dist/locale-content.js";
import {
  placeNameLanguageParameters,
  suggestedPlaceName,
} from "../dist/planner/location.server.js";

// The content side of the locale registry: knowledge texts, search, place
// names, e-mails and exports take their languages from the registry, and a
// language without words reads English, said — never a blank, never a silent
// substitution. A test-registered pseudo-locale proves that each reader
// follows the list.
const pseudo = { tag: "en-XA", language: "en", region: "XA", name: "Pseudo" };
const withPseudo = {
  ...SHIPPED_LOCALE_REGISTRY,
  locales: [...SHIPPED_LOCALE_REGISTRY.locales, pseudo],
};

// ---------------------------------------------------------------- knowledge

const research = {
  content: {
    en: { paragraphs: ["An emission nebula.", " "] },
    fr: { paragraphs: ["Une nébuleuse en émission."] },
    ja: { paragraphs: ["散光星雲です。"] },
    de: { paragraphs: ["Ein Emissionsnebel."] },
    es: { paragraphs: ["Una nebulosa de emisión."] },
    it: { paragraphs: ["Una nebulosa a emissione."] },
    "pt-BR": { paragraphs: ["Uma nebulosa de emissão."] },
    "zh-Hans": { paragraphs: ["发射星云。"] },
    "zh-Hant": { paragraphs: ["發射星雲。"] },
    ru: { paragraphs: ["Эмиссионная туманность."] },
  },
};

test("a knowledge text is read in its locale, else in English flagged as a fallback", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  for (const locale of Object.keys(research.content))
    assert.deepEqual(knowledgeTextFor(research, locale), {
      paragraphs: research.content[locale].paragraphs
        .map((paragraph) => paragraph.trim())
        .filter(Boolean),
      locale,
      fallback: false,
    });
  // Shipped locales this profile has no words for read English, flagged.
  for (const locale of shippedLocales().filter(
    (tag) => !(tag in research.content),
  ))
    assert.deepEqual(
      knowledgeTextFor(research, locale),
      { paragraphs: ["An emission nebula."], locale: "en", fallback: true },
      locale,
    );
  useLocaleRegistryForTests(withPseudo);
  // A registered locale without a curated text: the English one, flagged.
  assert.deepEqual(knowledgeTextFor(research, "en-XA"), {
    paragraphs: ["An emission nebula."],
    locale: "en",
    fallback: true,
  });
  // A text with no paragraph counts as none; no profile, no paragraph.
  assert.deepEqual(
    knowledgeTextFor(
      { content: { en: research.content.en, fr: { paragraphs: [""] } } },
      "fr",
    ),
    { paragraphs: ["An emission nebula."], locale: "en", fallback: true },
  );
  assert.deepEqual(knowledgeTextFor(undefined, "fr"), {
    paragraphs: [],
    locale: null,
    fallback: false,
  });
});

test("the choice of a content locale never crosses scripts and says its fallback", () => {
  assert.deepEqual(localeChoice(["en", "zh-Hans"], "zh-Hans"), {
    locale: "zh-Hans",
    fallback: false,
  });
  assert.deepEqual(localeChoice(["en", "zh-Hans"], "zh-Hant"), {
    locale: "en",
    fallback: true,
  });
  assert.deepEqual(localeChoice(["fr", "ja"], "de"), {
    locale: "fr",
    fallback: true,
  });
});

// ------------------------------------------------------------------- search

// The cases of the languages: what the common rule
// already folds for the scripts of the chosen languages.
const studyCases = [
  // § 4.6 Russian, Cyrillic: « ё » is written « е » as often as not.
  { locale: "ru", query: "Звездный", text: "Звёздный" },
  // § 4.2 German and the other Latin-script languages: umlauts and accents.
  { locale: "de", query: "monchsgrat", text: "Mönchsgrat" },
  { locale: "pt-BR", query: "sao joao", text: "São João" },
  // § 4.1 Chinese: a CJK keyboard types full-width Latin letters and digits.
  { locale: "zh-Hans", query: "m42", text: "Ｍ４２" },
];

test("normalizeSearch folds the study's cases with the common rule, in every locale", () => {
  for (const { locale, query, text } of studyCases)
    assert.equal(
      normalizeSearch(text, locale),
      normalizeSearch(query, locale),
      `${locale}: ${text}`,
    );
  // Two scripts of one language are not folded into each other (no case in
  // the study; Simplified and Traditional are two locales).
  assert.notEqual(
    normalizeSearch("獵戶座", "zh-Hant"),
    normalizeSearch("猎户座", "zh-Hans"),
  );
  // The French ligatures keep their rule.
  assert.equal(normalizeSearch("Cœur", "fr"), "coeur");
});

test("normalizeSearch has a per-locale folding hook, empty until the study names a case", (t) => {
  t.after(() => {
    useSearchFoldingForTests("en-XA", null);
    useSearchFoldingForTests("zh", null);
  });
  for (const locale of [...shippedLocales(), "de", "ru", "zh-Hans", "pt-BR"])
    assert.equal(searchFoldingFor(locale), null, locale);
  // A rule registered for a tag applies to that tag only…
  useSearchFoldingForTests("en-XA", (text) => text.replaceAll("ß", "ss"));
  assert.equal(normalizeSearch("Straße", "en-XA"), "strasse");
  assert.equal(normalizeSearch("Straße", "en"), "straße");
  // …and one registered for a language to each of its tags.
  useSearchFoldingForTests("zh", (text) => text.replaceAll("獵", "猎"));
  assert.equal(normalizeSearch("獵戶座", "zh-Hant"), "猎戶座");
  assert.equal(normalizeSearch("獵戶座", "zh-Hans"), "猎戶座");
});

// -------------------------------------------------------------- place names

test("the place-name service is asked in a locale's language only when the registry says it accepts it", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  assert.deepEqual(placeNameLanguageParameters("en"), { lang: "en" });
  assert.deepEqual(placeNameLanguageParameters("fr"), { lang: "fr" });
  assert.deepEqual(placeNameLanguageParameters("de"), { lang: "de" });
  // Japanese, Spanish, Italian and Brazilian Portuguese: no language, the
  // service answers with the local names (the public Photon service refuses
  // any language but default, de, en and fr).
  for (const tag of ["ja", "es", "it", "pt-BR"])
    assert.deepEqual(placeNameLanguageParameters(tag), {}, tag);
  // An unregistered locale is asked nothing either.
  assert.deepEqual(placeNameLanguageParameters("ru"), {});
  // Japanese: no language, the service answers with the local names.
  assert.deepEqual(placeNameLanguageParameters("ja"), {});
  // The Chinese scripts and Russian: no language either, the service answers
  // with the local names (Han and Cyrillic inside China and Russia).
  for (const locale of ["zh-Hans", "zh-Hant", "ru"])
    assert.deepEqual(placeNameLanguageParameters(locale), {}, locale);
  // An unregistered locale is asked nothing either.
  assert.deepEqual(placeNameLanguageParameters("xx"), {});
  assert.deepEqual(placeNameLanguageParameters(undefined), {});
  useLocaleRegistryForTests({
    ...SHIPPED_LOCALE_REGISTRY,
    locales: [
      ...SHIPPED_LOCALE_REGISTRY.locales,
      { ...pseudo, geocoder: "de" },
    ],
  });
  assert.deepEqual(placeNameLanguageParameters("en-XA"), { lang: "de" });
  assert.deepEqual(placeNameLanguageParameters("ru"), {});
  assert.throws(
    () =>
      useLocaleRegistryForTests({
        ...SHIPPED_LOCALE_REGISTRY,
        locales: [{ ...pseudo, geocoder: "pt-BR" }],
        defaultLocale: "en-XA",
      }),
    /bare language code/,
  );
});

test("the short place name keeps its rule in every script of the planned languages", () => {
  // Latin extended (de, es, it, pt-BR), Cyrillic (ru), Han (zh-Hans,
  // zh-Hant): the first segment, unless it opens with a house number.
  assert.equal(
    suggestedPlaceName("Großer Mönchsgrat, Schwarzwiesen, Bayern, Deutschland"),
    "Großer Mönchsgrat",
  );
  assert.equal(
    suggestedPlaceName("17 улица Обсерваторная, Заречье, Россия"),
    "Заречье",
  );
  assert.equal(suggestedPlaceName("观星台, 星光镇, 中国"), "观星台");
  assert.equal(suggestedPlaceName("88 星光路, 觀星鎮, 臺灣"), "觀星鎮");
});

// ---------------------------------------------------------- e-mails, exports

const publicUrl = "https://portal.invalid";

function assertMessage(message, locale, label) {
  for (const part of ["subject", "text", "html"])
    assert.ok(message[part]?.trim(), `${label} ${locale}: ${part}`);
  assert.equal(message.language, locale);
  assert.match(
    message.html,
    new RegExp(`<html lang="${message.contentLanguage}">`),
  );
}

test("every e-mail renders in every registered locale, English said for one without words", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests(withPseudo);
  const rendered = {};
  for (const locale of shippedLocales()) {
    const signIn = signInMessage({
      code: "481207",
      link: `${publicUrl}/auth/link#v=1`,
      language: locale,
      productName: "PlanAstro",
      publicUrl,
    });
    assertMessage(signIn, locale, "sign-in");
    rendered[locale] = { signIn };
  }
  // The shipped locales are written in their own words…
  for (const locale of SHIPPED_LOCALE_REGISTRY.locales.map((e) => e.tag)) {
    assert.equal(rendered[locale].signIn.contentLanguage, locale);
  }
  assert.notEqual(rendered.fr.signIn.subject, rendered.en.signIn.subject);
  // …the pseudo-locale in English, with an English date, and said so.
  const pseudoMail = rendered["en-XA"];
  assert.equal(pseudoMail.signIn.contentLanguage, "en");
  assert.equal(pseudoMail.signIn.subject, rendered.en.signIn.subject);
  // Said: the copy table records the fallback.
  assert.ok(
    copyFallbacks().some(
      (entry) =>
        entry.table === "spaces/messages.copy" && entry.locale === "en-XA",
    ),
  );
});

test("every planner export renders in every registered locale", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests(withPseudo);
  const plan = {
    id: "plan-1",
    name: "Nuit au col",
    date: "2026-10-02",
    items: [{ id: "m42", filter: "L" }],
  };
  const night = {
    start: "2026-10-02T19:40:00Z",
    end: "2026-10-03T04:10:00Z",
  };
  const targets = [{ target: { id: "m42", title: "M42 — Orion" } }];
  const now = new Date("2026-10-01T08:00:00Z");
  const dates = new Set();
  for (const locale of shippedLocales()) {
    const text = planShareText({ plan, targets, locale });
    const [name, date, names] = text.split("\n");
    assert.equal(name, "Nuit au col");
    assert.equal(
      date,
      new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeZone: "UTC",
      }).format(new Date("2026-10-02T12:00:00Z")),
    );
    assert.equal(names, "M42 — Orion");
    dates.add(date);
    // The calendar files write the words of the locale around the plan's
    // own name: the reminder's title and description, the name of a plan
    // that has none. The file keeps its format (the same properties).
    const words = exportWords(locale);
    const reminder = weatherReminderIcs({ plan, night, now, locale });
    assert.ok(reminder.includes("VALARM"), locale);
    assert.ok(
      reminder.includes(`SUMMARY:${words.weatherCheck}Nuit au col`),
      locale,
    );
    assert.ok(
      reminder.includes(`DESCRIPTION:${words.weatherDescription}`),
      locale,
    );
    const unnamed = { id: "plan-2", date: "2026-10-02" };
    assert.ok(
      planCalendarIcs({ plan: unnamed, night, targets: [], now, locale })
        .split("\r\n")
        .includes(`SUMMARY:${words.observationPlan}`),
      locale,
    );
    assert.equal(
      planCalendarIcs({ plan, night, targets, now, locale })
        .split("\r\n")
        .filter((line) => /^[A-Z-]+[:;]/.test(line)).length,
      planCalendarIcs({ plan, night, targets, now }).split("\r\n").length - 1,
      locale,
    );
    // The words of the exports are the locale's own, not English's (a true
    // name would be the only exception, and there is none here).
    if (locale !== "en" && locale !== "en-XA")
      for (const [key, english] of Object.entries(exportWords("en")))
        assert.notEqual(words[key], english, `${locale}: ${key}`);
  }
  // Every shipped locale writes its own date; the pseudo-locale writes English's.
  assert.equal(dates.size, SHIPPED_LOCALE_REGISTRY.locales.length);
  assert.equal(
    planShareText({ plan, targets, locale: "en-XA" }),
    planShareText({ plan, targets, locale: "en" }),
  );
  // The pseudo-locale writes the English words, said.
  assert.deepEqual(exportWords("en-XA"), exportWords("en"));
  assert.ok(
    copyFallbacks().some(
      (entry) =>
        entry.table === "planner/export.exportCopy" && entry.locale === "en-XA",
    ),
  );
  assert.equal(
    weatherReminderIcs({ plan, night, now, locale: "en-XA" }),
    weatherReminderIcs({ plan, night, now, locale: "en" }),
  );
  // The words around a plan that has no name and no target.
  const bare = { date: "2026-10-02" };
  assert.equal(
    planShareText({ plan: bare, targets: [], locale: "fr" }).split("\n")[0],
    "Plan d’observation",
  );
  assert.equal(
    planShareText({ plan: bare, targets: [], locale: "de" }).split("\n")[2],
    "Kein Ziel ausgewählt",
  );
});
