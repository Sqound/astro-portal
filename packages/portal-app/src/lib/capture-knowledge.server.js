import { targetKnowledgeFor } from "./target-library.server.js";

/**
 * What the page of a capture tells of its first target itself — its story
 * and its sources, « À propos de la cible » — read on the server. One reader
 * for the public gallery's page and the private gallery's: they are one
 * page. `capture.targets[0]` is `{ id, designation }`; `null` when the
 * capture has no target or the library has no story for it.
 */
export async function captureKnowledgeOf(capture, locale) {
  const first = capture.targets[0];
  if (!first) return null;
  try {
    const knowledge = await targetKnowledgeFor(
      {
        id: first.id,
        designation: first.designation,
        objects: [first.designation],
      },
      locale,
    );
    if (!knowledge?.story) return null;
    return {
      story: knowledge.story,
      storyParagraphs: Array.isArray(knowledge.storyParagraphs)
        ? knowledge.storyParagraphs.filter((text) => typeof text === "string")
        : [],
      researchSources: Array.isArray(knowledge.researchSources)
        ? knowledge.researchSources
            .filter((entry) => entry?.url && entry?.label)
            .map(({ url, label }) => ({ url, label }))
        : [],
    };
  } catch {
    return null;
  }
}
