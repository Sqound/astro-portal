import { message } from "portal/i18n.js";
import { ImageOrPictogram } from "../ObjectPictogram.js";
import { managePath } from "../manage/manage-copy.js";
import {
  fill,
  pictogramTargetOf,
  targetDesignation,
  targetLine,
  targetThumbnailSrc,
  visibleTargets,
} from "./journal-list-view.js";

/**
 * The targets of a session, each with its thumbnail — the final photo when the
 * session has one, else the pictogram of the target —, its name, what it gave
 * (« 40 poses · Dual-band · 2 h 00 · photo finale ») and, when it has a
 * capture, « Voir la fiche de NGC 7000 » (a link, UI rule 7: it names its
 * object); the thumbnail leads to the same page, the capture's. A target the
 * session removed is not drawn.
 */
export function JournalTargetRows({ item, pictures = null, locale = "en" }) {
  const targets = visibleTargets(item);
  if (!targets.length) return null;
  return (
    <div className="session-targets journal-targets">
      {targets.map((target) => {
        const href = target.captureId
          ? managePath(locale, "captures", target.captureId)
          : null;
        const label = fill(message(locale, "sessionTargetDetailsNamed"), {
          target: targetDesignation(target.label),
        });
        const content = (
          <>
            <ImageOrPictogram
              src={targetThumbnailSrc(target, pictures)}
              target={pictogramTargetOf(
                pictures,
                target.targetId,
                target.label,
              )}
              locale={locale}
              className="session-target-image"
            />
            <span className="session-target-summary">
              <strong>{target.label}</strong>
              <small>
                {targetLine(target, locale, {
                  imported: item.readOnly === true,
                }) || "—"}
              </small>
            </span>
          </>
        );
        return (
          <div
            className="session-target-item"
            key={target.planItemId ?? target.targetId}
            data-target-id={target.targetId}
          >
            <div className="session-target-header">
              {href ? (
                <a
                  className="session-target-toggle"
                  href={href}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  {content}
                </a>
              ) : (
                <span className="session-target-toggle">{content}</span>
              )}
              {href ? (
                <a
                  className="btn-link session-target-open-detail"
                  href={href}
                  title={label}
                  aria-label={label}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <span>{label}</span>
                </a>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
