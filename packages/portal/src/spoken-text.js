/**
 * Which text the read-aloud voice speaks for one target: its knowledge
 * carries, beside the written story, two optional spoken texts —
 * `spokenParagraphs`, written to be heard, and `childrenSpokenParagraphs`,
 * the children's variant. Written once here:
 *
 * - with `children` on and a children's text: `{ source: "children", … }`;
 * - else the spoken text when there is one: `{ source: "spoken", … }`;
 * - else the written text, read through the pronunciation lexicon:
 *   `storyParagraphs` when the field is a list, else `story`
 *   (`{ source: "written", … }`);
 * - else nothing to read: `{ source: "none", paragraphs: [] }`.
 *
 * A list keeps its non-empty strings only; an empty list is absent.
 */
export function spokenTextChoice(knowledge, { children = false } = {}) {
  const strings = (value) =>
    Array.isArray(value)
      ? value.filter((entry) => typeof entry === "string" && entry.length > 0)
      : null;
  const childrens = strings(knowledge?.childrenSpokenParagraphs) || [];
  if (children === true && childrens.length > 0)
    return { source: "children", paragraphs: childrens };
  const spoken = strings(knowledge?.spokenParagraphs) || [];
  if (spoken.length > 0) return { source: "spoken", paragraphs: spoken };
  const written = strings(knowledge?.storyParagraphs);
  if (written !== null)
    return written.length > 0
      ? { source: "written", paragraphs: written }
      : { source: "none", paragraphs: [] };
  const story = knowledge?.story;
  return typeof story === "string" && story.length > 0
    ? { source: "written", paragraphs: [story] }
    : { source: "none", paragraphs: [] };
}
