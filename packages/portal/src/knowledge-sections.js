/**
 * The sections of a target's knowledge text (`storySections` on the wire: a
 * published page cut at its intertitles), read defensively: each section has
 * a heading (`null` for the opening) and at least one paragraph. Empty when
 * the target's text is a short generated one, which the sheets then show as
 * paragraphs (`storyParagraphs`).
 */
export function knowledgeSections(knowledge) {
  if (!Array.isArray(knowledge?.storySections)) return [];
  return knowledge.storySections
    .map((section) => ({
      heading:
        typeof section?.heading === "string" && section.heading.trim()
          ? section.heading.trim()
          : null,
      paragraphs: Array.isArray(section?.paragraphs)
        ? section.paragraphs.filter(
            (paragraph) => typeof paragraph === "string" && paragraph.trim(),
          )
        : [],
    }))
    .filter((section) => section.paragraphs.length > 0);
}
