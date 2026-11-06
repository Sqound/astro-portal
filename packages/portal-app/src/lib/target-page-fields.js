// What a shard holds of a published page in one language: `storySections`,
// `researchSources` and `researchNote`. `story` and `storyParagraphs`, which
// `GET /v1/targets/{targetId}` also answers, are not stored: they are derived
// from the sections when the page is read (`targetPageStory` of
// `portal/target-page-story.js`). The stored fields are computed here when
// the shards are written.

/** A list of `{ label, url }` links, the malformed entries dropped. */
export function sourceLinks(sources) {
  return Array.isArray(sources)
    ? sources
        .filter((source) => source?.label && source?.url)
        .map((source) => ({
          label: String(source.label),
          url: String(source.url),
        }))
    : [];
}

/** The sections (intertitle and paragraphs) of a published page, in the shape
 * the sheets show; none for a generated profile, which has paragraphs only. */
export function sectionsOf(content) {
  if (!Array.isArray(content?.sections)) return [];
  return content.sections
    .map((section) => ({
      heading: section?.heading ? String(section.heading) : null,
      paragraphs: Array.isArray(section?.paragraphs)
        ? section.paragraphs
            .map((text) => String(text || "").trim())
            .filter(Boolean)
        : [],
    }))
    .filter((section) => section.paragraphs.length);
}

/**
 * The fields a shard stores for the page `content` (`pageContent` of
 * `target-text-pages.js`): `{ storySections, researchSources, researchNote? }`.
 */
export function publishedPageFields(content) {
  const note = content?.note ? String(content.note) : null;
  return {
    storySections: sectionsOf(content),
    researchSources: sourceLinks(content?.sources),
    ...(note ? { researchNote: note } : {}),
  };
}
