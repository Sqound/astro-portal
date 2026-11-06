import assert from "node:assert/strict";
import test from "node:test";
import {
  localizedPlannerName,
  plannerCatalogue,
} from "astro-core/planner-targets.js";
import { solarSystemCatalogueTargets } from "astro-core/solar-system-catalogue.js";
import { shippedLocales } from "astro-contracts/locales";
import {
  spokenDesignation,
  spokenParagraphs,
  spokenSentenceBound,
  spokenTextLocales,
} from "../dist/lib/target-spoken-register.js";
import { spokenHandTexts } from "../dist/lib/target-spoken-texts.js";
import { withSpokenText } from "../dist/lib/target-library.server.js";
import { publishedPagesProfileVersion } from "../dist/lib/target-text-pages.js";

// The spoken register of the descriptions: every curated target has a spoken
// text and a children's variant in every language the spoken templates are
// written for; every sentence is short enough to be said in one breath; no
// parenthesis or catalogue shorthand is left; the children's text uses
// nothing from the glossary beyond the object's name and its kind; the texts
// are deterministic; the fields are optional.

const spokenLocales = ["en", "fr", "ja"];

// The curated targets the repository holds: the planner's curated catalogue,
// in the shape the target library gives it, and the solar-system bodies.
const curated = [
  ...plannerCatalogue.map((target) => ({
    target: {
      id: `curated-${target.designation}`,
      designation: target.designation,
      commonNames: target.name ? [target.name] : [],
      typeKey: target.skyTarget?.type || null,
      constellationKey: target.skyTarget?.constellation || null,
      apparentSizeArcmin: target.apparentSizeArcmin || null,
      magnitude: target.integratedMagnitude ?? null,
      catalogues: [target.catalogue].filter(Boolean),
      catalogue: target.catalogue,
    },
    names: (locale) =>
      target.name
        ? {
            name: localizedPlannerName(target.name, locale),
            englishName: localizedPlannerName(target.name, "en"),
          }
        : {},
  })),
  ...solarSystemCatalogueTargets.map((target) => ({
    target,
    names: () => ({}),
  })),
];

// Synthetic targets for what the curated list does not exercise: every kind,
// every size class, a receding galaxy (a distance estimate) with a
// morphology code, the catalogues of every history sentence.
const kinds = [
  "Galaxie",
  "Amas globulaire",
  "Amas ouvert",
  "Nébuleuse planétaire",
  "Nébuleuse en émission",
  "Nébuleuse en réflexion",
  "Nébuleuse sombre",
  "Rémanent de supernova",
  "Ciel profond",
  "Étoile",
];
const synthetic = kinds.flatMap((typeKey, index) =>
  [
    [0.6, ["IC"], "IC 2118"],
    [6, ["Barnard"], "B 72"],
    [16, ["Caldwell"], "C 14"],
    [30, ["NGC"], "NGC 6960"],
    [190, ["Messier", "NGC"], "M 101"],
  ].map(([size, catalogues, designation]) => ({
    target: {
      id: `synthetic-${index}-${size}`,
      designation,
      commonNames: ["Synthetic Alias Nebula"],
      typeKey,
      constellationKey: "Cygne",
      apparentSizeArcmin: [size, size / 2],
      magnitude: 7.25,
      catalogues,
      catalogue: catalogues[0],
      morphology: "SBc",
      source: { radialVelocityKmS: 2140, morphology: "SBc" },
    },
    names: () => ({
      name: "Synthetic Alias Nebula",
      englishName: "Synthetic Alias Nebula",
    }),
  })),
);

const everyTarget = [...curated, ...synthetic];

function sentencesOf(text) {
  return text
    .split(/(?<=[.!?。！？])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function textsFor(locale) {
  return everyTarget.flatMap(({ target, names }) =>
    [false, true].map((children) => ({
      id: `${target.designation} ${locale}${children ? " children" : ""}`,
      children,
      paragraphs: spokenParagraphs(target, locale, {
        ...names(locale),
        children,
      }),
    })),
  );
}

test("every curated target has a spoken text and a children's variant in every spoken locale", () => {
  assert.deepEqual(spokenTextLocales(), spokenLocales);
  assert.ok(curated.length >= 90, `${curated.length} curated targets`);
  for (const locale of spokenLocales)
    for (const { target, names } of curated) {
      const adult = spokenParagraphs(target, locale, names(locale));
      const children = spokenParagraphs(target, locale, {
        ...names(locale),
        children: true,
      });
      assert.ok(adult.length > 0, `${target.designation} ${locale}`);
      assert.ok(
        children.length > 0,
        `${target.designation} ${locale} children`,
      );
      for (const paragraph of [...adult, ...children])
        assert.ok(typeof paragraph === "string" && paragraph.trim().length > 0);
    }
});

test("every sentence is said in one breath: 25 words in English and French, 40 characters in Japanese", () => {
  assert.deepEqual(spokenSentenceBound.en, { words: 25 });
  assert.deepEqual(spokenSentenceBound.ja, { characters: 40 });
  for (const locale of spokenLocales) {
    const bound = spokenSentenceBound[locale];
    for (const { id, paragraphs } of textsFor(locale))
      for (const sentence of sentencesOf(paragraphs.join(" "))) {
        if (bound.words)
          assert.ok(
            sentence.split(/\s+/).length <= bound.words,
            `${id}: « ${sentence} »`,
          );
        else
          assert.ok(
            [...sentence].length <= bound.characters,
            `${id}: « ${sentence} » (${[...sentence].length})`,
          );
      }
  }
});

test("no parenthesis and no catalogue shorthand is left in a spoken text", () => {
  const shorthand = [
    /[()（）]/u,
    /\bOpenNGC\b/,
    /\bSIMBAD\b/,
    /km\/s|Mpc|kpc|\bmag\b|\bly\b|\bal\b/,
    /[′″°×≈~±]/u,
    /\bM\s?\d/,
    /\bB\s?\d/,
    /\bC\s?\d/,
    /\bSh\s?2/,
    /\bSBc\b/,
  ];
  for (const locale of spokenLocales)
    for (const { id, paragraphs } of textsFor(locale)) {
      const text = paragraphs.join(" ");
      for (const pattern of shorthand)
        assert.doesNotMatch(text, pattern, `${id}: ${text}`);
      if (locale === "ja")
        assert.doesNotMatch(text, /\b(?:NGC|IC)\b/, `${id}: ${text}`);
    }
});

test("the children's text uses nothing from the glossary beyond the object's name and its kind", () => {
  const glossary = {
    fr: /magnitude|année-lumière|années-lumière|degré|minute d’arc|intégration|filtre|bande étroite|catalogue|morphologie|vitesse radiale|décalage|spectr|ionis|parsec|constellation|hydrogène|pulsar|neutrons/i,
    en: /magnitude|light-year|degree|arcminute|integration|filter|narrowband|catalogue|morphology|radial velocity|redshift|spectr|ioni[sz]|parsec|constellation|hydrogen|pulsar|neutron/i,
    ja: /等級|光年|分角|露出|フィルター|ナローバンド|カタログ|星表|形態|視線速度|赤方偏移|スペクトル|電離|パーセク|星座|水素|パルサー|中性子/,
  };
  for (const locale of spokenLocales)
    for (const { id, children, paragraphs } of textsFor(locale))
      if (children)
        assert.doesNotMatch(
          paragraphs.join(" "),
          glossary[locale],
          `${id}: ${paragraphs.join(" ")}`,
        );
});

test("the spoken texts are deterministic", () => {
  for (const locale of spokenLocales) {
    const first = textsFor(locale);
    const reversed = [...everyTarget].reverse();
    for (const { target, names } of reversed)
      spokenParagraphs(target, locale, names(locale));
    assert.deepEqual(textsFor(locale), first);
  }
});

test("the spoken fields are optional: absent for a locale without spoken templates or a written text in another language", () => {
  const target = curated.find(
    ({ target: entry }) => entry.designation === "M31",
  ).target;
  for (const locale of shippedLocales().filter(
    (tag) => !spokenLocales.includes(tag),
  )) {
    assert.deepEqual(spokenParagraphs(target, locale), [], locale);
    const presented = { id: target.id, name: "M31", story: "…" };
    assert.equal(withSpokenText(presented, target, locale), presented, locale);
  }
  // A written text shown in English for another locale: no spoken text.
  const fallback = { id: target.id, story: "…", storyFallbackLocale: "en" };
  assert.equal(withSpokenText(fallback, target, "fr"), fallback);
  // A spoken locale: the spoken text beside the written story, and no
  // children's text unless a page carries one (the template is gone).
  const spoken = withSpokenText(
    { id: target.id, name: "Galaxie d’Andromède", story: "…" },
    target,
    "fr",
  );
  assert.ok(spoken.spokenParagraphs.length > 0);
  assert.equal(spoken.childrenSpokenParagraphs, undefined);
  assert.equal(spoken.story, "…");
  assert.equal(withSpokenText(null, target, "fr"), null);
});

test("a published page's children's text is the only children's text served, in every language it has one", () => {
  const target = curated.find(
    ({ target: entry }) => entry.designation === "M31",
  ).target;
  const published = {
    ...target,
    editorial: {
      ...target.editorial,
      catalogueResearch: {
        schemaVersion: 1,
        profileVersion: publishedPagesProfileVersion,
        pagesRevision: "abc",
        content: {
          fr: { childrenParagraphs: ["Une ville d’étoiles."] },
          de: { childrenParagraphs: ["Eine Stadt aus Sternen."] },
        },
      },
    },
  };
  const french = withSpokenText(
    { id: target.id, name: "Galaxie d’Andromède", story: "…" },
    published,
    "fr",
  );
  assert.deepEqual(french.childrenSpokenParagraphs, ["Une ville d’étoiles."]);
  assert.ok(french.spokenParagraphs.length > 0);
  // A language without spoken templates still gets the written children's text.
  const german = withSpokenText(
    { id: target.id, name: "M31", story: "…" },
    published,
    "de",
  );
  assert.deepEqual(german.childrenSpokenParagraphs, [
    "Eine Stadt aus Sternen.",
  ]);
  assert.equal(german.spokenParagraphs, undefined);
  // Without a written text, none: never the old three-sentence
  // template, whether or not the target has a page.
  const english = withSpokenText(
    { id: target.id, name: "Andromeda Galaxy", story: "…" },
    published,
    "en",
  );
  assert.ok(english.spokenParagraphs.length > 0);
  assert.equal(english.childrenSpokenParagraphs, undefined);
  assert.equal(
    "childrenSpokenParagraphs" in
      withSpokenText({ id: target.id, name: "M31", story: "…" }, target, "fr"),
    false,
  );
});

test("designations and numbers are written as they are said", () => {
  assert.equal(spokenDesignation("M31", "fr"), "Messier 31");
  assert.equal(spokenDesignation("M 031", "en"), "Messier 31");
  assert.equal(spokenDesignation("B033", "en"), "Barnard 33");
  assert.equal(spokenDesignation("C14", "fr"), "Caldwell 14");
  assert.equal(spokenDesignation("Sh2-155", "en"), "Sharpless 155");
  assert.equal(spokenDesignation("NGC 7000", "fr"), "NGC 7000");
  assert.equal(spokenDesignation("NGC 7000", "ja"), "エヌジーシー7000");
  assert.equal(spokenDesignation("IC 434", "ja"), "アイシー434");
  assert.equal(spokenDesignation("M31", "ja"), "メシエ31");
  const galaxy = synthetic.find(
    ({ target }) =>
      target.typeKey === "Galaxie" && target.designation === "M 101",
  ).target;
  const [opening, history, science] = spokenParagraphs(galaxy, "en");
  assert.match(
    opening,
    /^Messier 101 is a galaxy in the constellation Cygnus\./,
  );
  assert.match(
    opening,
    /spans about three degrees, six times the width of the full Moon/,
  );
  assert.match(opening, /total magnitude is about 7\.3\./);
  assert.match(history, /in the eighteenth century/);
  // 2140 km/s at 70 km/s/Mpc: about a hundred million light-years.
  assert.match(science, /about 100 million light-years from us/);
  assert.match(
    spokenParagraphs(galaxy, "fr", { children: true }).join(" "),
    /Sa lumière a voyagé environ 100 millions d’années/,
  );
  assert.match(
    spokenParagraphs(galaxy, "ja").join(""),
    /距離は約1億光年と見積もられます。/,
  );
});

test("a name the locale has no word for stays out of a French or Japanese text; English names take their article", () => {
  const nebula = synthetic.find(
    ({ target }) => target.typeKey === "Nébuleuse en émission",
  );
  const alias = {
    name: "Synthetic Alias Nebula",
    englishName: "Synthetic Alias Nebula",
  };
  assert.doesNotMatch(
    spokenParagraphs(nebula.target, "fr", alias).join(" "),
    /Synthetic/,
  );
  assert.doesNotMatch(
    spokenParagraphs(nebula.target, "ja", alias).join(""),
    /Synthetic/,
  );
  assert.match(
    spokenParagraphs(nebula.target, "en", alias)[0],
    /It is also known as the Synthetic Alias Nebula\./,
  );
  // A name that only repeats the kind says nothing.
  for (const [locale, word] of [
    ["fr", "Nébuleuse en émission"],
    ["en", "Emission nebula"],
    ["ja", "散光星雲"],
  ])
    assert.doesNotMatch(
      spokenParagraphs(nebula.target, locale, { name: word })[0],
      /appelle aussi|also known|とも呼ばれます/,
      locale,
    );
  assert.match(
    spokenParagraphs(nebula.target, "fr", {
      name: "Nébuleuse de synthèse",
      englishName: "Synthetic Alias Nebula",
    })[0],
    /On l’appelle aussi Nébuleuse de synthèse\./,
  );
});

test("every hand-written spoken text has the adult and the children's text in every spoken locale", () => {
  const keys = Object.keys(spokenHandTexts);
  assert.ok(keys.length >= 20, `${keys.length} hand-written texts`);
  for (const key of keys)
    for (const locale of spokenLocales) {
      const text = spokenHandTexts[key][locale];
      assert.ok(text?.adult?.length > 0, `${key} ${locale} adult`);
      assert.ok(text?.children?.length > 0, `${key} ${locale} children`);
    }
  // Every solar-system body is hand-written, whole.
  for (const body of solarSystemCatalogueTargets)
    assert.equal(spokenHandTexts[body.id]?.whole, true, body.id);
});
