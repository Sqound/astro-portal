import assert from "node:assert/strict";
import test from "node:test";
import {
  isOfflinePackPagesResearch,
  isPublishedPagesResearch,
  pageContent,
  parseChildrenText,
  parseSourceLine,
  parseTargetPage,
  parseTargetRegistry,
  publishedPagesProfileVersion,
  registryDoneStatus,
  researchFromPages,
  targetPageBody,
} from "portal-app/lib/target-text-pages.js";

const page = `# The Moon

The Moon is Earth's only natural satellite.
It is bright.

Second lede paragraph.

## Craters

Craters are everywhere.

## What to look for

Look at the terminator.

## Sources

- NASA Science, « The Moon » — https://science.nasa.gov/moon/ — consulted on 17 October 2026
- Wikidata — Moon (Q405), CC0 — https://www.wikidata.org/wiki/Q405

Data under CC0. Observing advice is PlanAstro's own.
`;

test("a page is read into its title, lede, sections, sources and note", () => {
  const read = parseTargetPage(page);
  assert.equal(read.title, "The Moon");
  assert.deepEqual(read.lede, [
    "The Moon is Earth's only natural satellite. It is bright.",
    "Second lede paragraph.",
  ]);
  assert.deepEqual(
    read.sections.map((section) => section.heading),
    ["Craters", "What to look for"],
  );
  assert.deepEqual(read.sections[1].paragraphs, ["Look at the terminator."]);
  assert.deepEqual(read.sources, [
    {
      label: "NASA Science, « The Moon »",
      url: "https://science.nasa.gov/moon/",
      accessed: "consulted on 17 October 2026",
    },
    {
      label: "Wikidata — Moon (Q405), CC0",
      url: "https://www.wikidata.org/wiki/Q405",
      accessed: null,
    },
  ]);
  assert.equal(
    read.note,
    "Data under CC0. Observing advice is PlanAstro's own.",
  );
});

test("the stored content keeps the opening as a section without a heading and the paragraphs without intertitles", () => {
  const content = pageContent(parseTargetPage(page));
  assert.deepEqual(
    content.sections.map((section) => section.heading),
    [null, "Craters", "What to look for"],
  );
  assert.deepEqual(content.paragraphs, [
    "The Moon is Earth's only natural satellite. It is bright.",
    "Second lede paragraph.",
    "Craters are everywhere.",
    "Look at the terminator.",
  ]);
  assert.equal(
    content.sources[0].label,
    "NASA Science, « The Moon » — consulted on 17 October 2026",
  );
  assert.equal(content.sources[1].label, "Wikidata — Moon (Q405), CC0");
});

test("the text checked is the page without its sources", () => {
  const body = targetPageBody(parseTargetPage(page));
  assert.match(body, /Craters are everywhere/);
  assert.match(body, /Craters\n/);
  assert.doesNotMatch(body, /17 October/);
  assert.doesNotMatch(body, /science\.nasa\.gov/);
});

test("a page without the expected shape is refused, saying why", () => {
  assert.throws(() => parseTargetPage("No title\n"), /no title/);
  assert.throws(
    () => parseTargetPage("# T\n\nLede.\n\n## A\n\nBody.\n"),
    /no list of sources/,
  );
  assert.throws(
    () => parseTargetPage("# T\n\nLede.\n\n## Sources\n\n- No link here\n"),
    /no intertitle|has no link/,
  );
  assert.throws(
    () =>
      parseTargetPage(
        "# T\n\nLede.\n\n## A\n\n- stray — https://x.test/\n\nBody.\n\n## Sources\n\n- s — https://x.test/\n",
      ),
    /list outside the sources/,
  );
  assert.throws(
    () =>
      parseTargetPage(
        "# T\n\n## A\n\nBody.\n\n## Sources\n\n- s — https://x.test/\n",
      ),
    /no lede/,
  );
});

test("a source line is a label, a link and an optional date", () => {
  assert.deepEqual(parseSourceLine("A — B — https://x.test/p — consulté"), {
    label: "A — B",
    url: "https://x.test/p",
    accessed: "consulté",
  });
  assert.equal(parseSourceLine("only words"), null);
});

test("the registry rows are read, the others skipped", () => {
  const rows = parseTargetRegistry(`# Registre

| #   | Cible | Id catalogue | Slug | Langues | Statut   | Date       | Commit |
| --- | ----- | ------------ | ---- | ------- | -------- | ---------- | ------ |
| 1   | Soleil | solar-system-sun | soleil | 10/10 | terminée | 2026-10-17 | abc |
| 2   | M61 | openngc-ngc4303 | m61 | — | à faire |  |  |
`);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    rank: 1,
    name: "Soleil",
    id: "solar-system-sun",
    slug: "soleil",
    languages: "10/10",
    status: registryDoneStatus,
    date: "2026-10-17",
    commit: "abc",
  });
  assert.equal(rows[1].status, "à faire");
});

test("a children's text is one or two paragraphs, with no title or list", () => {
  assert.deepEqual(parseChildrenText("Une phrase.\nSuite.\n\nDeux.\n"), [
    "Une phrase. Suite.",
    "Deux.",
  ]);
  assert.throws(() => parseChildrenText(""), /empty/u);
  assert.throws(() => parseChildrenText("Un.\n\nDeux.\n\nTrois."), /two/u);
  assert.throws(() => parseChildrenText("# Titre\n\nTexte."), /title/u);
  const read = parseTargetPage(page);
  const research = researchFromPages({
    pages: { fr: read, en: read },
    children: { fr: ["Deux."] },
    sourceLocale: "fr",
  });
  assert.deepEqual(research.content.fr.childrenParagraphs, ["Deux."]);
  assert.equal("childrenParagraphs" in research.content.en, false);
  assert.notEqual(
    research.pagesRevision,
    researchFromPages({ pages: { fr: read, en: read }, sourceLocale: "fr" })
      .pagesRevision,
  );
});

test("the stored record carries a revision that follows the content", () => {
  const read = parseTargetPage(page);
  const first = researchFromPages({
    pages: { en: read, fr: read },
    sourceLocale: "fr",
  });
  const same = researchFromPages({
    pages: { fr: read, en: read },
    sourceLocale: "fr",
  });
  assert.equal(first.pagesRevision, same.pagesRevision);
  assert.equal(first.tier, "A");
  assert.equal(
    researchFromPages({ pages: { fr: read }, sourceLocale: "fr", tier: "C" })
      .tier,
    "C",
  );
  assert.throws(
    () =>
      researchFromPages({ pages: { fr: read }, sourceLocale: "fr", tier: "D" }),
    /Unknown tier/u,
  );
  assert.equal(first.profileVersion, publishedPagesProfileVersion);
  assert.equal(isPublishedPagesResearch(first), true);
  assert.equal(isPublishedPagesResearch({ schemaVersion: 1 }), false);
  // Tiers A and B ride in the offline pack; tier C is online only.
  assert.equal(isOfflinePackPagesResearch(first), true);
  for (const [tier, inPack] of [
    ["A", true],
    ["B", true],
    ["C", false],
  ])
    assert.equal(
      isOfflinePackPagesResearch(
        researchFromPages({ pages: { fr: read }, sourceLocale: "fr", tier }),
      ),
      inPack,
      tier,
    );
  const other = parseTargetPage(page.replace("Craters are", "Craters were"));
  assert.notEqual(
    researchFromPages({ pages: { fr: other }, sourceLocale: "fr" })
      .pagesRevision,
    researchFromPages({ pages: { fr: read }, sourceLocale: "fr" })
      .pagesRevision,
  );
});
