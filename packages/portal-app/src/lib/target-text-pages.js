import { createHash } from "node:crypto";

// The long catalogue pages ("tier A"): one Markdown page per target and
// language, written outside the application and loaded into the catalogue.
// This module is the pure part of that load:
// reading the registry of finished targets, reading one page into its title,
// sections (intertitles) and sources, and building the
// `editorial.catalogueResearch` record the catalogue stores for a target.
//
// A page looks like this (the same in every language; only the words differ):
//
//   # Title
//
//   Lede paragraph(s), before the first intertitle.
//
//   ## Intertitle
//
//   Paragraph(s).
//
//   ## Sources        <- the last intertitle: a bullet list, then a note
//
//   - Label — https://example.org/page — consulted on …
//
//   A closing note on the licences of the sources.

/** Names the kind of record the loader writes, so a catalogue sync can tell a
 * published page from a generated profile. */
export const publishedPagesProfileVersion = "2026-10-pages-v1";

/** The `tier` the stored record carries when the caller names none (the
 * first published pages were tier A; tiers B and C name theirs). */
export const publishedPagesTier = "A";

/** The tiers a published page can belong to. */
export const publishedPagesTiers = Object.freeze(["A", "B", "C"]);

/** The tiers whose pages travel in the offline pack. Tier C (about 15 000
 * targets, ≈ 37 MB of text per language) is served online only: offline, its sheet shows what the pack and the device's own
 * cache hold. */
export const offlinePackPagesTiers = Object.freeze(["A", "B"]);

/** Whether a stored record is a published page the offline pack carries. */
export function isOfflinePackPagesResearch(research) {
  return (
    isPublishedPagesResearch(research) &&
    offlinePackPagesTiers.includes(research.tier || publishedPagesTier)
  );
}

/** Whether a stored `catalogueResearch` record is a set of published pages. */
export function isPublishedPagesResearch(research) {
  return (
    research?.profileVersion === publishedPagesProfileVersion &&
    typeof research?.pagesRevision === "string" &&
    research.pagesRevision.length > 0
  );
}

/**
 * The rows of the registry table (a Markdown table): one object per target,
 * `{ rank, name, id, slug, languages, status, date, commit }`. Rows that are
 * not table rows of a target (header, separator, prose) are skipped.
 */
export function parseTargetRegistry(markdown) {
  const rows = [];
  for (const line of String(markdown).split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    rows.push({
      rank: Number(cells[0]),
      name: cells[1],
      id: cells[2],
      slug: cells[3],
      languages: cells[4],
      status: cells[5],
      date: cells[6] || "",
      commit: cells[7] || "",
    });
  }
  return rows;
}

/** The registry's word for a target whose ten pages passed every check. */
export const registryDoneStatus = "terminée";

const sourceLine =
  /^(?<label>.+?)\s+—\s+(?<url>https?:\/\/\S+)(?:\s+—\s+(?<accessed>.+))?$/u;

/** One bullet of the sources list, read into `{ label, url, accessed }`. */
export function parseSourceLine(text) {
  const match = sourceLine.exec(String(text).trim());
  if (!match) return null;
  return {
    label: match.groups.label.trim(),
    url: match.groups.url,
    accessed: match.groups.accessed?.trim() || null,
  };
}

/**
 * Reads one page. Returns `{ title, lede, sections, sources, note }`:
 * `lede` is the paragraphs before the first intertitle, `sections` the other
 * intertitles with their paragraphs (the sources section excluded),
 * `sources` the bullets of the last intertitle and `note` its closing
 * paragraph(s). Throws, naming the problem, when the page does not have that
 * shape.
 */
export function parseTargetPage(markdown) {
  const lines = String(markdown).replace(/\r\n?/gu, "\n").split("\n");
  let title = null;
  const blocks = [{ heading: null, paragraphs: [], bullets: [] }];
  let current = blocks[0];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) current.paragraphs.push(paragraph.join(" "));
    paragraph = [];
  };
  for (const line of lines) {
    const text = line.trim();
    if (text.startsWith("# ")) {
      flush();
      if (title !== null) throw new Error("The page has more than one title.");
      if (blocks.length > 1 || current.paragraphs.length)
        throw new Error("The title must come first.");
      title = text.slice(2).trim();
    } else if (text.startsWith("## ")) {
      flush();
      current = {
        heading: text.slice(3).trim(),
        paragraphs: [],
        bullets: [],
      };
      blocks.push(current);
    } else if (/^[-*]\s+/u.test(text)) {
      flush();
      current.bullets.push(text.replace(/^[-*]\s+/u, ""));
    } else if (!text) flush();
    else paragraph.push(text);
  }
  flush();
  if (!title) throw new Error("The page has no title.");
  const sourcesBlock = blocks.length > 1 ? blocks[blocks.length - 1] : null;
  if (!sourcesBlock?.bullets.length)
    throw new Error("The page ends with no list of sources.");
  const sources = sourcesBlock.bullets.map((bullet) => {
    const source = parseSourceLine(bullet);
    if (!source) throw new Error(`A source has no link: « ${bullet} ».`);
    return source;
  });
  const [ledeBlock, ...rest] = blocks.slice(0, -1);
  if (!rest.length) throw new Error("The page has no intertitle.");
  for (const block of [ledeBlock, ...rest]) {
    if (block.bullets.length)
      throw new Error(
        `A list outside the sources${block.heading ? ` (« ${block.heading} »)` : ""}.`,
      );
    if (block.heading !== null && !block.paragraphs.length)
      throw new Error(`The intertitle « ${block.heading} » has no text.`);
  }
  if (!ledeBlock.paragraphs.length) throw new Error("The page has no lede.");
  return {
    title,
    lede: ledeBlock.paragraphs,
    sections: rest.map(({ heading, paragraphs }) => ({ heading, paragraphs })),
    sourcesHeading: sourcesBlock.heading,
    sources,
    note: sourcesBlock.paragraphs.join(" "),
  };
}

/**
 * Reads a children's text (`<slug>.<locale>.children.md`): one or two
 * paragraphs, read aloud to a child, with no title, intertitle or list.
 * Returns the paragraphs; throws, naming the problem, otherwise.
 */
export function parseChildrenText(markdown) {
  const paragraphs = String(markdown)
    .replace(/\r\n?/gu, "\n")
    .split(/\n\s*\n/u)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .join(" ")
        .trim(),
    )
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("The children's text is empty.");
  if (paragraphs.length > 2)
    throw new Error("The children's text has more than two paragraphs.");
  for (const paragraph of paragraphs)
    if (/^(?:#|[-*]\s)/u.test(paragraph))
      throw new Error(
        "The children's text has a title, an intertitle or a list.",
      );
  return paragraphs;
}

/** The text a page states about its target, for the number check: the title,
 * the lede and every section with its intertitle, never the sources. */
export function targetPageBody(page) {
  return [
    page.title,
    ...page.lede,
    ...page.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
    ]),
  ].join("\n");
}

/** The sources of a page as the catalogue stores and shows them: one line of
 * words and one link each. */
export function pageSources(page) {
  return page.sources.map((source) => ({
    label: source.accessed
      ? `${source.label} — ${source.accessed}`
      : source.label,
    url: source.url,
  }));
}

/** What the catalogue stores for one language of a target; `children` are
 * the paragraphs of its children's text, when it has one. */
export function pageContent(page, children = null) {
  const sections = [{ heading: null, paragraphs: page.lede }, ...page.sections];
  return {
    title: page.title,
    paragraphs: sections.flatMap((section) => section.paragraphs),
    sections,
    sources: pageSources(page),
    note: page.note,
    ...(children?.length ? { childrenParagraphs: children } : {}),
  };
}

/**
 * The `editorial.catalogueResearch` record of a target made of its pages:
 * `pages` is `{ [locale]: parsed page }`, `children` `{ [locale]: paragraphs }`
 * for the languages that have a children's text. The record carries a revision (a
 * digest of the content) so that a catalogue holding the same pages is left
 * alone and one holding older pages takes these.
 */
export function researchFromPages({
  pages,
  sourceLocale,
  tier = publishedPagesTier,
  children = {},
}) {
  if (!publishedPagesTiers.includes(tier))
    throw new Error(`Unknown tier « ${tier} ».`);
  const content = {};
  for (const locale of Object.keys(pages).sort())
    content[locale] = pageContent(pages[locale], children[locale]);
  const reference = content[sourceLocale] || Object.values(content)[0];
  const pagesRevision = createHash("sha256")
    .update(JSON.stringify(content))
    .digest("hex")
    .slice(0, 16);
  return {
    schemaVersion: 1,
    profileVersion: publishedPagesProfileVersion,
    pagesRevision,
    sourceLocale,
    tier,
    content,
    // The links every language shares: those of the source language's page.
    sources: reference.sources,
  };
}
