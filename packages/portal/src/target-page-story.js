/**
 * The two flat forms of a published page's text, derived from its sections
 * (`storySections`: `{ heading, paragraphs }`, the opening lede having a
 * `null` heading) — the one place the rule is written, pinned by the
 * `target-page-story` conformance fixture. The
 * catalogue text shards (docs/STATIC_DATA.md) store the sections only;
 * `story` and `storyParagraphs` are derived whenever a page is read:
 *
 * - `storyParagraphs`: the paragraphs of every section, in order, one after
 *   the other; the intertitles (`heading`) are not part of it. A paragraph
 *   that is not a non-empty string is skipped; nothing is trimmed or
 *   reworded (the loader writes trimmed paragraphs);
 * - `story`: those paragraphs joined by a single space (U+0020), whatever the
 *   language — the empty string when there is none.
 *
 * A value that is not a list of sections gives no paragraph.
 */
export function targetPageStory(storySections) {
  const storyParagraphs = (Array.isArray(storySections) ? storySections : [])
    .flatMap((section) =>
      Array.isArray(section?.paragraphs) ? section.paragraphs : [],
    )
    .filter((paragraph) => typeof paragraph === "string" && paragraph !== "");
  return { story: storyParagraphs.join(" "), storyParagraphs };
}
