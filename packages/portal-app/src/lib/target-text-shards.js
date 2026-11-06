import { createHash } from "node:crypto";
import { publishedPageFields } from "./target-page-fields.js";

// The published pages of tiers B and C (tier C is about 15 900 targets
// in every shipped language, ≈ 350 MB) do not fit in the catalogue
// seed, nor in the memory of the service, and neither do the children's
// texts of any tier (tier A keeps its pages in the seed, its children's
// texts go here). They travel in the static-data package as shards, one
// folder per language:
//
//   target-library/texts/index.json
//   target-library/texts/<locale>/<shard>.json
//
// The service imports them one shard at a time into the `target_texts` table
// (`target-texts.server.js`) and a client imports the same files into its own
// database. This module is
// what they agree on: the layout, the stable shard of a target, the entry of a
// target and the shape of the two kinds of file (JSON Schema:
// `packages/astro-contracts/schemas/api/target-texts.schema.json`).
//
// A shard is `{ v: 1, locale, shard, revision, entries: [...] }`; an entry is
// `{ id, revision, tier, lede?, page?, children? }` where `page` holds what
// `GET /v1/targets/{id}` answers for a published page in that language, less
// what is derived from it (`storySections`, `researchSources`, and
// `researchNote` when the page has one; `story` and `storyParagraphs` follow
// from the sections, `portal/target-page-story.js`), `lede` the title and the
// first sentences of the page, `children` the children's text. Tier A is
// stored like the others (its pages left the seed for the shards); an entry
// of tier A with `children` only is the older form, whose page the seed still
// carries.

/** The tiers a shard entry can belong to. */
export const targetTextsTiers = Object.freeze(["A", "B", "C"]);

/** The version of the index and shard documents. */
export const targetTextsVersion = 1;

/** The folder of the shards, under `target-library/` of the package. */
export const targetTextsFolder = "texts";

/** The shard count of a new folder: about 500 targets per shard for tier C. A
 * folder keeps the count it was made with (moving a target between shards
 * would rewrite every file). */
export const targetTextsShardCountDefault = 32;

/** The average number of targets per shard above which the loader suggests
 * making the folder again with more shards. */
export const targetTextsShardCeiling = 800;

/** The shard (0-based) a target belongs to, for `shardCount` shards: a digest
 * of its identifier, so that a target keeps its shard as others come and go. */
export function targetTextShardOf(id, shardCount) {
  if (!Number.isInteger(shardCount) || shardCount < 1)
    throw new Error("The shard count must be a positive integer.");
  const digest = createHash("sha1").update(String(id)).digest();
  return digest.readUInt32BE(0) % shardCount;
}

/** The name of a shard: its number on three digits (`007`). */
export const targetTextShardName = (number) => String(number).padStart(3, "0");

/** The path of a shard file, relative to the texts folder. */
export const targetTextShardPath = (locale, shard) => `${locale}/${shard}.json`;

/** The SHA-256 of a file's bytes, in hexadecimal. */
export const targetTextSha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

/** The revision of an entry: a digest of what it says, so that an unchanged
 * target keeps it. */
export const targetTextEntryRevision = ({ tier, lede, page, children }) =>
  createHash("sha256")
    .update(
      JSON.stringify([tier, lede ?? null, page ?? null, children ?? null]),
    )
    .digest("hex")
    .slice(0, 16);

/** The revision of a shard: a digest of the revisions of its entries, in
 * order. */
export const targetTextShardRevision = (entries) =>
  createHash("sha256")
    .update(entries.map((entry) => `${entry.id}:${entry.revision}\n`).join(""))
    .digest("hex")
    .slice(0, 16);

const ledeBytes = 220;

/**
 * The lede of a page: its title, then the first sentence of its opening
 * paragraph, then the second when the whole stays within about 200 bytes. It
 * is what a list of targets shows under a name without opening the page.
 */
export function targetTextLede({ title, paragraph, locale }) {
  const segments = [];
  for (const { segment } of new Intl.Segmenter(locale, {
    granularity: "sentence",
  }).segment(String(paragraph || ""))) {
    if (!segment.trim()) continue;
    segments.push(segment);
    if (segments.length === 2) break;
  }
  const size = (text) => Buffer.byteLength(text, "utf8");
  // The segments keep their own spacing (none between Japanese sentences).
  const join = (parts) => {
    const text = parts.join("").trim();
    return text ? `${title} — ${text}` : title;
  };
  const first = join(segments.slice(0, 1));
  const both = join(segments);
  return segments.length === 2 && size(both) <= ledeBytes ? both : first;
}

/**
 * The entry of a target of any tier in `locale`, from its page as the
 * catalogue stores it (`pageContent` of `target-text-pages.js`).
 */
export function targetTextPageEntry({ id, tier, page, locale }) {
  const body = {
    tier,
    lede: targetTextLede({
      title: page.title,
      paragraph: page.sections?.[0]?.paragraphs?.[0],
      locale,
    }),
    page: publishedPageFields(page),
    ...(page.childrenParagraphs?.length
      ? { children: { paragraphs: page.childrenParagraphs } }
      : {}),
  };
  return { id, revision: targetTextEntryRevision(body), ...body };
}

/** The older form of an entry of tier A, in a language that has a children's
 * text: that text only (the page staying in the catalogue seed). The loader
 * writes the whole page for tier A now (`targetTextPageEntry`). */
export function targetTextChildrenEntry({ id, paragraphs }) {
  const body = { tier: "A", children: { paragraphs } };
  return { id, revision: targetTextEntryRevision(body), ...body };
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const isTexts = (value) =>
  Array.isArray(value) && value.length > 0 && value.every(isText);
const isLink = (value) =>
  isObject(value) && isText(value.label) && /^https?:\/\//u.test(value.url);

const pageFields = ["storySections", "researchSources", "researchNote"];

function assertPage(page) {
  if (!isObject(page)) throw new Error("the page is not an object");
  for (const field of Object.keys(page))
    if (!pageFields.includes(field))
      throw new Error(`the page holds ${field}, which is derived, not stored`);
  if (
    !Array.isArray(page.storySections) ||
    !page.storySections.length ||
    !page.storySections.every(
      (section) =>
        isObject(section) &&
        (section.heading === null || isText(section.heading)) &&
        isTexts(section.paragraphs),
    )
  )
    throw new Error("the page has no sections");
  if (
    !Array.isArray(page.researchSources) ||
    !page.researchSources.length ||
    !page.researchSources.every(isLink)
  )
    throw new Error("the page has no sources");
  if (page.researchNote !== undefined && !isText(page.researchNote))
    throw new Error("the page's note is not a text");
}

/** Throws, naming the problem, unless `entry` is a valid shard entry. */
export function assertTargetTextEntry(entry) {
  if (!isObject(entry)) throw new Error("not an object");
  if (!isText(entry.id)) throw new Error("no id");
  if (!isText(entry.revision)) throw new Error("no revision");
  if (!targetTextsTiers.includes(entry.tier))
    throw new Error(`unknown tier ${entry.tier}`);
  if (
    entry.children !== undefined &&
    !(isObject(entry.children) && isTexts(entry.children.paragraphs))
  )
    throw new Error("the children's text is not a list of paragraphs");
  if (
    entry.tier === "A" &&
    entry.page === undefined &&
    entry.lede === undefined
  ) {
    // The older form of tier A: its page stays in the catalogue seed, the
    // entry carries the children's text alone.
    if (entry.children === undefined) throw new Error("no children's text");
  } else {
    if (!isText(entry.lede)) throw new Error("no lede");
    assertPage(entry.page);
  }
}

/**
 * Checks a shard document `{ v, locale, shard, revision, entries }`; returns
 * it. Throws, naming the problem, when it is not one, is for another language
 * or shard than the one named, has entries out of order or invalid, or states
 * a revision its entries do not have.
 */
export function assertTargetTextShard(document, { locale, shard } = {}) {
  if (!isObject(document) || document.v !== targetTextsVersion)
    throw new Error("not a version 1 shard");
  if (!isText(document.locale) || !isText(document.shard))
    throw new Error("the shard names no language or number");
  if (locale !== undefined && document.locale !== locale)
    throw new Error(`the shard is for ${document.locale}, not ${locale}`);
  if (shard !== undefined && document.shard !== shard)
    throw new Error(`the shard is ${document.shard}, not ${shard}`);
  if (!Array.isArray(document.entries))
    throw new Error("the shard has no entries");
  let previous = null;
  for (const entry of document.entries) {
    try {
      assertTargetTextEntry(entry);
    } catch (error) {
      throw new Error(`target ${entry?.id}: ${error.message}`);
    }
    if (previous !== null && entry.id <= previous)
      throw new Error(`target ${entry.id}: entries are not in id order`);
    previous = entry.id;
  }
  if (document.revision !== targetTextShardRevision(document.entries))
    throw new Error("the shard's revision is not that of its entries");
  return document;
}

/**
 * Checks the index `{ v, shardCount, locales: { [locale]: [{ shard, path,
 * bytes, sha256, revision, count }] } }`; returns it. Throws, naming the
 * problem, when it is not one.
 */
export function assertTargetTextsIndex(document) {
  if (!isObject(document) || document.v !== targetTextsVersion)
    throw new Error("not a version 1 index");
  if (!Number.isInteger(document.shardCount) || document.shardCount < 1)
    throw new Error("the index has no shard count");
  if (!isObject(document.locales))
    throw new Error("the index has no languages");
  for (const [locale, shards] of Object.entries(document.locales)) {
    if (!Array.isArray(shards))
      throw new Error(`the index lists no shards for ${locale}`);
    const seen = new Set();
    for (const item of shards) {
      if (
        !isObject(item) ||
        !isText(item.shard) ||
        !isText(item.revision) ||
        !/^[0-9a-f]{64}$/u.test(item.sha256 ?? "") ||
        !Number.isInteger(item.bytes) ||
        !Number.isInteger(item.count) ||
        item.path !== targetTextShardPath(locale, item.shard)
      )
        throw new Error(`the index lists an invalid shard for ${locale}`);
      if (seen.has(item.shard))
        throw new Error(`the index lists ${locale}/${item.shard} twice`);
      seen.add(item.shard);
    }
  }
  return document;
}

/** The shards an index lists, flat: `{ locale, shard, path, bytes, sha256,
 * revision, count }`, languages and shards in order. */
export function targetTextsIndexShards(index) {
  return Object.entries(index.locales).flatMap(([locale, shards]) =>
    shards.map((item) => ({ locale, ...item })),
  );
}
