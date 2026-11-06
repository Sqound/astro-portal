import { message } from "portal/i18n.js";
import { ImageOrPictogram } from "../ObjectPictogram.js";
import { JournalOutcomeChip } from "./JournalOutcomeChip.js";
import { JournalSessionMenu } from "./JournalSessionMenu.js";
import { JournalQuality } from "./JournalQuality.js";
import { JournalTargetRows } from "./JournalTargetRows.js";
import {
  cardHeading,
  eveningText,
  fill,
  journalLineHref,
  pictogramTargetOf,
  promiseText,
  targetThumbnailSrc,
  totalBlock,
  visibleTargets,
} from "./journal-list-view.js";

/**
 * A session of the Journal, in the form of the old journal's card (boards
 * `JournalSessionsWeb` state 1, `JournalSessionsWebMore`): the evening in small
 * gold capitals, the place and the instrument, the outcome — and « Mesurée par
 * Astro Sync », « importée », the multi-night plan's name when it has one —,
 * the total on the right; then « Qualité des captures » when Astro Sync
 * measured, the targets with their thumbnails, and « Voir la session ».
 *
 * A night **to debrief** shows the promise (dashed thumbnails, what was
 * planned) and « Débriefer cette session »; both it and « Voir la session » lead
 * to the page of the session (or, for a plan carried out without the
 * application, to the debriefing of the plan, which makes the session). A
 * session not carried out keeps its reason under its total. A night of a
 * private server's catalogue (`readOnly`) has a page that only reads
 * (« Voir la session »).
 *
 * Buttons: « Voir la session » the
 * secondary of the card (a card has no primary), « Débriefer cette session »
 * the secondary too, in the blue of the badge « À débriefer » (one blue « Débriefer » on every surface), « Voir la fiche de … »
 * links. The ⋯ at the top right opens the menu of the session:
 * « Voir la session », « Débriefer cette session », then « Supprimer la
 * session ».
 */
export function JournalSessionCard({
  item,
  curves = null,
  slots = null,
  pictures = null,
  locale = "en",
}) {
  const promise = item.state === "to_debrief";
  const total = totalBlock(item, locale);
  const href = journalLineHref(locale, item);
  // A session the person named is called by its name.
  const heading = cardHeading(item, locale);
  return (
    <article
      className={`session-card journal-session is-${item.state}`}
      data-state={item.state}
      data-session={item.sessionId ?? ""}
      data-plan={item.planId ?? ""}
    >
      <div className="session-card-heading">
        <div>
          <p className="eyebrow">{eveningText(item.eveningDate, locale)}</p>
          {heading.title ? (
            <h2
              className={`journal-session-place${heading.named ? " journal-session-title" : ""}`}
            >
              {heading.title}
            </h2>
          ) : null}
          {heading.line ? (
            <p className="journal-session-place-line">{heading.line}</p>
          ) : null}
          <div className="journal-session-chips">
            <JournalOutcomeChip
              state={item.state}
              locale={locale}
              guidedEvening={item.guidedEvening === true}
            />
            {item.origin === "import" && (
              <span className="journal-badge is-import">
                {message(locale, "journalOriginImported")}
              </span>
            )}
            {item.measured && (
              <span className="journal-badge is-measured">
                {message(locale, "sessionMeasuredBadge")}
              </span>
            )}
            {item.projectName && (
              <span className="journal-badge is-plan">
                {fill(message(locale, "journalMultiNightLabel"), {
                  plan: item.projectName,
                })}
              </span>
            )}
          </div>
        </div>
        <div className="session-card-side">
          <div className="session-totals">
            <strong>{total.figure}</strong>
            {total.line ? <span>{total.line}</span> : null}
          </div>
          <JournalSessionMenu item={item} href={href} locale={locale} />
        </div>
      </div>
      {promise ? (
        <div className="journal-promise">
          <span className="journal-promise-thumbs" aria-hidden="true">
            {visibleTargets(item)
              .slice(0, 3)
              .map((target) => (
                <ImageOrPictogram
                  key={target.targetId}
                  src={targetThumbnailSrc(target, pictures)}
                  target={pictogramTargetOf(
                    pictures,
                    target.targetId,
                    target.label,
                  )}
                  locale={locale}
                  named={false}
                  className="journal-promise-thumb"
                />
              ))}
          </span>
          <span className="journal-promise-text">
            {promiseText(item, locale, slots)}
          </span>
          <a
            className="btn-secondary is-debrief journal-debrief-action"
            href={href}
          >
            {message(locale, "journalDebriefSession")}
          </a>
        </div>
      ) : (
        <>
          <JournalQuality item={item} curves={curves} locale={locale} />
          <JournalTargetRows item={item} pictures={pictures} locale={locale} />
          {item.sessionId || item.planId ? (
            <div className="journal-session-footer">
              <a className="btn-secondary journal-see-session" href={href}>
                {message(locale, "planSeeSession")}
              </a>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
