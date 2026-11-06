"use client";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { pastNightDebriefWords } from "../past-night-debrief.js";

/**
 * The web dialog "Plan d’une nuit passée". "Plus tard" is the secondary and
 * closes, the plan staying "À débriefer"; "Débriefer maintenant" is the
 * primary and leads to the debriefing of the plan (`href`), last, at the
 * right of the footer.
 */
export function PastNightDebriefActions({
  locale = "en",
  hasSpace = true,
  href,
  onClose,
}) {
  const words = pastNightDebriefWords(locale, { hasSpace });
  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        data-past-night-debrief-later
        onClick={onClose}
      >
        {words.later}
      </button>
      <a
        className="btn-primary"
        data-past-night-debrief-now
        data-autofocus
        href={href}
      >
        {words.now}
      </a>
    </>
  );
}

export function PastNightDebriefDialog({
  locale = "en",
  hasSpace = true,
  href,
  onClose,
}) {
  const words = pastNightDebriefWords(locale, { hasSpace });
  return (
    <WebDialog
      title={words.title}
      closeLabel={message(locale, "plannerFlowClose")}
      onClose={onClose}
      className="past-night-debrief-dialog"
      footer={
        <PastNightDebriefActions
          locale={locale}
          hasSpace={hasSpace}
          href={href}
          onClose={onClose}
        />
      }
    >
      <p data-past-night-debrief-body>{words.body}</p>
    </WebDialog>
  );
}
