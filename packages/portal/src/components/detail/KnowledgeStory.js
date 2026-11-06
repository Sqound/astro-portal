import { message } from "portal/i18n.js";
import { knowledgeSections } from "portal/knowledge-sections.js";

/**
 * A target's knowledge text on a capture's detail page: its sections with
 * their intertitles when the target has a published page, else its
 * paragraphs, then the sources and the note on their licences. `paragraphs`
 * is the text without intertitles (`storyParagraphs`, or the single `story`).
 * The text is always shown whole: no « Voir plus » on a target's page.
 */
export function KnowledgeStory({ knowledge, paragraphs, locale }) {
  const sections = knowledgeSections(knowledge);
  const sources = !Array.isArray(knowledge?.researchSources)
    ? []
    : knowledge.researchSources.filter((entry) => entry?.url && entry?.label);
  return (
    <>
      {sections.length > 0
        ? sections.map((section, sectionIndex) => (
            <div className="detail-target-section" key={sectionIndex}>
              {section.heading && <h4>{section.heading}</h4>}
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          ))
        : paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {sources.length > 0 && (
        <p className="detail-target-research-sources">
          <b>{message(locale, "plannerTargetKnowledgeSources")}</b>{" "}
          {sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 && " · "}
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            </span>
          ))}
        </p>
      )}
      {sources.length > 0 && knowledge?.researchNote && (
        <p className="detail-target-research-note">{knowledge.researchNote}</p>
      )}
    </>
  );
}
