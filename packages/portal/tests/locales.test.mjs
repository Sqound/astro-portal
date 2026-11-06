import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SHIPPED_LOCALE_REGISTRY,
  copyFallbacks,
  shippedLocales,
  useLocaleRegistryForTests,
} from "astro-contracts/locales";
import { suggestMessage } from "planner/suggest-messages.js";
import { quickPlanMessage } from "planner/quick-plan-messages.js";
import { localeKeyGaps, message, messages } from "../dist/i18n.js";
import { copyTableProblems, sourceFiles } from "./helpers/locale-tables.mjs";

// The copy tables of the core packages kept outside the catalogues: every
// source file holding an object keyed by locale tags is listed here. `copy`
// tables carry every shipped locale (but those `lacks` or `implicit` name,
// with the reason) and are read through `copyFor`, the registry's one named
// fallback to English; `content` tables (object and constellation names,
// knowledge texts, catalogue descriptions) are only listed, so that a new one
// is seen, not checked here.
const root = fileURLToPath(new URL("../../", import.meta.url));
const scanned = [
  "portal/src",
  "planner/src",
  "portal-app/src",
  "astro-core/src",
];
const french = "French is the source term itself (the table's key).";
const inventory = {
  "portal/src/i18n.js": { kind: "copy" },
  "portal/src/format.js": { kind: "copy" },
  "portal/src/components/LocaleSwitcher.js": { kind: "copy" },
  "portal/src/components/SourceNotice.js": { kind: "copy" },
  "portal/src/components/account/AccountPage.js": { kind: "copy" },
  "portal/src/components/admin/AdminPage.js": { kind: "copy" },
  "portal/src/components/admin/CaptureLibrary.js": {
    kind: "copy",
    implicit: ["fr"],
    reason: french,
  },
  "portal/src/components/admin/LogsLibrary.js": { kind: "copy" },
  "portal/src/components/admin/ReferenceLibrary.js": { kind: "copy" },
  "portal/src/components/admin/StaticDataLibrary.js": { kind: "copy" },
  "portal/src/components/admin/TargetLibrary.js": { kind: "copy" },
  "portal/src/components/admin/TranslationLibrary.js": { kind: "copy" },
  // The archive confirmation of the default equipment rows.
  "portal/src/components/admin/DefaultEquipmentSection.js": { kind: "copy" },
  "portal/src/components/auth/AuthPage.js": { kind: "copy" },
  "portal/src/components/detail/DetailsPanel.js": {
    kind: "copy",
    implicit: ["fr"],
    reason: french,
  },
  "portal/src/components/gallery/private-gallery-copy.js": { kind: "copy" },
  // The generic tags of the two galleries (`localizedTag`), moved out of
  // GalleryPage.js so that the private gallery's filter bar reads them
  // too: the same table, one entry.
  "portal/src/components/gallery/gallery-tags.js": {
    kind: "copy",
    implicit: ["fr"],
    reason: french,
  },
  "portal/src/components/manage/captures-copy.js": { kind: "copy" },
  // The words of a capture's metadata (the owner's screen, the visitor's rows).
  "portal/src/components/manage/capture-metadata-copy.js": { kind: "copy" },
  "portal/src/components/equipment/equipment-copy.js": { kind: "copy" },
  "portal/src/components/manage/manage-copy.js": { kind: "copy" },
  "portal/src/components/manage/portal-copy.js": { kind: "copy" },
  "portal/src/components/space/sign-in-copy.js": { kind: "copy" },
  // The page of an address that leads nowhere, and what the pages that need a
  // space say on a server with no sign-in.
  "portal/src/components/not-found/not-found-copy.js": { kind: "copy" },
  // The page of a page that failed while it drew.
  "portal/src/components/error/error-copy.js": { kind: "copy" },
  "portal/src/components/no-sign-in/no-sign-in-copy.js": { kind: "copy" },
  "portal/src/components/space/space-copy.js": {
    kind: "copy",
    lacks: { closed: ["fr"] },
    reason: "French closed-space words are `frenchClosed`, typographic.",
  },
  "portal/src/planner/export.js": { kind: "copy" },
  "portal/src/spaces/messages.js": { kind: "copy" },
  "portal/src/written-forms.js": { kind: "copy" },
  "portal/src/planner/flow-messages.js": { kind: "copy" },
  "planner/src/access-copy.js": { kind: "copy" },
  "planner/src/browser-plans-copy.js": { kind: "copy" },
  "planner/src/capability-gates.js": { kind: "copy" },
  "planner/src/components/PlannerNightSkyMap.js": { kind: "copy" },
  "planner/src/multi-night-access.js": { kind: "copy" },
  "planner/src/projects/components/copy.js": { kind: "copy" },
  "planner/src/projects/components/nights-copy.js": { kind: "copy" },
  "planner/src/planner.js": { kind: "copy" },
  "planner/src/suggest-messages.js": { kind: "copy" },
  "planner/src/quick-plan-messages.js": { kind: "copy" },
  "portal-app/src/lib/share-metadata.js": { kind: "copy" },
  "portal-app/src/lib/catalog.server.js": { kind: "content" },
  "portal-app/src/lib/target-library-database.server.js": { kind: "content" },
  "portal-app/src/lib/target-library.server.js": { kind: "content" },
  "portal-app/src/lib/target-research-profile.js": { kind: "content" },
  // The spoken register, written in the languages its templates have
  // words for (`spokenTextLocales`); the others read the written text
  // through their pronunciation lexicon.
  "portal-app/src/lib/target-spoken-register.js": { kind: "content" },
  "portal-app/src/lib/target-spoken-texts.js": { kind: "content" },
  // The number checker's scale words (« millions », « Millionen », 万, 億)
  // and month names, one entry per language it reads; the decimal marks
  // come from the registry.
  "portal-app/src/lib/target-text-check.js": { kind: "content" },
  "astro-core/src/catalog-taxonomy.ts": { kind: "content" },
  // The names of the 88 constellations and of the 92 bright stars, in every
  // shipped locale (generated from `astro-core/sky-data`).
  "astro-core/src/constellation-table.ts": { kind: "content" },
  "astro-core/src/bright-star-table.ts": { kind: "content" },
  // The short texts of the same stars and constellations, one entry per
  // shipped locale (generated from `astro-core/sky-data/texts`).
  "astro-core/src/sky-text-table.ts": { kind: "content" },
  "astro-core/src/planner-targets.ts": { kind: "content" },
  "astro-core/src/solar-system-catalogue.ts": { kind: "content" },
  "astro-core/src/target-catalogues.ts": { kind: "content" },
  "astro-core/src/target-common-names.ts": { kind: "content" },
  "astro-core/src/locale-names-more.ts": { kind: "content" },
  // The credit line of the nebula catalogues, in every shipped locale.
  "astro-core/src/catalogue-sources.ts": { kind: "copy" },
};
const files = () =>
  scanned.flatMap((directory) => sourceFiles(`${root}${directory}`));

const pseudo = { tag: "en-XA", language: "en", region: "XA", name: "Pseudo" };

test("every copy table of the core packages is inventoried and has every shipped locale", () => {
  const problems = copyTableProblems({
    root,
    files: files(),
    inventory,
    localeTags: shippedLocales(),
  });
  assert.deepEqual(problems, []);
});

test("the inventory covers its copy tables files and content files", () => {
  const kinds = Object.values(inventory).map((entry) => entry.kind);
  // The counts follow the inventory above: a new table is listed there.
  assert.equal(kinds.filter((kind) => kind === "copy").length, 43);
  assert.equal(kinds.filter((kind) => kind === "content").length, 16);
  for (const entry of Object.values(inventory))
    if (entry.implicit || entry.lacks) assert.ok(entry.reason);
});

test("a locale the catalogue lacks reads English, through the named fallback", () => {
  assert.equal(message("xx", "plannerDate"), message("en", "plannerDate"));
  assert.ok(
    copyFallbacks().some(
      (entry) => entry.table === "i18n.messages" && entry.locale === "xx",
    ),
  );
  assert.equal(message("fr", "plannerDate"), "Date");
  assert.equal(message("ja", "plannerDate"), "日付");
});

test("a pseudo-locale added to the registry is missing from every copy table, and the guard says so", (t) => {
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests({
    ...SHIPPED_LOCALE_REGISTRY,
    locales: [...SHIPPED_LOCALE_REGISTRY.locales, pseudo],
  });
  const problems = copyTableProblems({
    root,
    files: files(),
    inventory,
    localeTags: shippedLocales(),
  });
  const copyFiles = Object.entries(inventory)
    .filter(([, entry]) => entry.kind === "copy")
    .map(([path]) => path);
  for (const path of copyFiles)
    assert.ok(
      problems.some(
        (problem) => problem.startsWith(path) && problem.includes("en-XA"),
      ),
      `${path} should be reported without an en-XA entry`,
    );
  assert.equal(
    problems.every((problem) => problem.includes("has no en-XA entry")),
    true,
  );
  // The application still answers, in English, said aloud.
  assert.equal(message("en-XA", "plannerDate"), message("en", "plannerDate"));
  assert.equal(
    suggestMessage("en-XA", "suggestAction"),
    suggestMessage("en", "suggestAction"),
  );
  assert.equal(
    quickPlanMessage("en-XA", "planExistsTitle"),
    quickPlanMessage("en", "planExistsTitle"),
  );
  assert.ok(
    copyFallbacks().some(
      (entry) =>
        entry.table === "quick-plan-messages.quickPlanMessages" &&
        entry.locale === "en-XA",
    ),
  );
  assert.ok(
    copyFallbacks().some(
      (entry) =>
        entry.table === "suggest-messages.suggestionMessages" &&
        entry.locale === "en-XA",
    ),
  );
});

test("an unlisted table or a table that lost a locale fails the guard", () => {
  const problems = copyTableProblems({
    root,
    files: files(),
    inventory: Object.fromEntries(
      Object.entries(inventory).filter(
        ([path]) => path !== "portal/src/components/SourceNotice.js",
      ),
    ),
    localeTags: [...shippedLocales(), "xx"],
  });
  assert.ok(
    problems.some((problem) =>
      problem.startsWith("portal/src/components/SourceNotice.js holds"),
    ),
  );
  assert.ok(
    problems.some(
      (problem) =>
        problem.startsWith("portal/src/format.js") &&
        /has no (?:[\w-]+, )*xx entry/.test(problem),
    ),
  );
});

test("localeKeyGaps walks the registry: the shipped catalogue has full parity", () => {
  const gaps = localeKeyGaps();
  assert.deepEqual(
    Object.keys(gaps),
    shippedLocales().filter((tag) => tag !== "en"),
  );
  for (const gap of Object.values(gaps))
    assert.deepEqual(gap, { missing: [], extra: [] });
  assert.deepEqual(Object.keys(messages).sort(), [...shippedLocales()].sort());
});

test("localeKeyGaps over four locales reports the incomplete one, an absent one and an unregistered one", (t) => {
  const catalogue = {
    en: { plan: "Plan", night: "Night" },
    fr: { plan: "Planifier", night: "Nuit" },
    ja: { plan: "プランを立てる", night: "夜" },
    "en-XA": { plan: "[Þļåñ one]" },
  };
  assert.deepEqual(
    localeKeyGaps("en", catalogue, ["en", "fr", "ja", "en-XA"])["en-XA"],
    {
      missing: ["night"],
      extra: [],
    },
  );
  // The pseudo-locale registered, the shipped catalogue lacking it: every
  // key reported missing, the catalogue said absent.
  t.after(() => useLocaleRegistryForTests(null));
  useLocaleRegistryForTests({
    ...SHIPPED_LOCALE_REGISTRY,
    locales: [...SHIPPED_LOCALE_REGISTRY.locales, pseudo],
  });
  const gaps = localeKeyGaps();
  assert.equal(gaps["en-XA"].absent, true);
  assert.equal(gaps["en-XA"].missing.length, Object.keys(messages.en).length);
  useLocaleRegistryForTests(null);
  const { de } = localeKeyGaps(
    "en",
    { ...catalogue, de: { plan: "Planen", night: "Nacht" } },
    ["en"],
  );
  assert.deepEqual(de, { missing: [], extra: [], unregistered: true });
});
