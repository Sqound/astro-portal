"use client";

import { message } from "portal/i18n.js";
import {
  acquisitionFramesText,
  acquisitionLineText,
  acquisitionProvenanceText,
} from "../acquisition-words.js";

// The small pieces "Prise de vue par cible" puts on the screens that exist: the
// line of a target with its count, the chip "suggéré", the link "Paramètres de
// la pose ›", the frozen line of a launched plan. Each draws what the design
// draws and nothing else; the screens keep their own layout around them.

/** The chip "suggéré": a line that is the rule's, not the person's. */
export function AcquisitionSuggestedChip({ locale }) {
  return (
    <span className="acq-suggested-chip" data-acquisition="suggested">
      {message(locale, "acqSuggestedChip")}
    </span>
  );
}

/**
 * "Paramètres de la pose ›": the link that opens the dialog (the weakest
 * button level: going to see elsewhere).
 */
export function AcquisitionLink({
  locale,
  label = null,
  disabled = false,
  onClick,
  testId,
}) {
  return (
    <button
      type="button"
      className="btn-link acq-link"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
    >
      {label ?? message(locale, "acqSheetTitle")}
      <span aria-hidden="true"> ›</span>
    </button>
  );
}

/**
 * The line of a target at the foot of its card, under the facts: "120 s ·
 * gain 100 · UV/IR-cut · ≈ 39 poses" as one text, then the chip "suggéré"
 * when every field is the rule's. Nothing in visual mode, nothing for a
 * target with no line to say (`view` is `null`).
 */
export function AcquisitionCardLine({ locale, view }) {
  if (!view) return null;
  const frames = acquisitionFramesText(locale, view.line);
  return (
    <div className="acq-card-line" data-acquisition="card">
      <p
        className={`acq-card-line-text${view.line.fitsSlot ? "" : " is-warning"}`}
        data-acquisition="text"
      >
        {[acquisitionLineText(locale, view.line), frames]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {view.suggested ? (
        <AcquisitionSuggestedChip locale={locale} />
      ) : view.frozen ? (
        <span className="acq-frozen-line" data-acquisition="frozen">
          {message(locale, "acqFrozenLine")}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The line of a target in the interval editor: under the hours, beside the
 * round buttons — the effective line, where it comes from, and the link
 * "Paramètres de la pose ›". The frame count follows the slot: the editor
 * hands the view read at the slot as the handles left it.
 */
export function AcquisitionEditorLine({ locale, view, onOpen }) {
  if (!view) return null;
  const frames = acquisitionFramesText(locale, view.line);
  const provenance = view.frozen
    ? message(locale, "acqFrozenLine")
    : acquisitionProvenanceText(locale, view.live);
  return (
    <div className="acq-editor-line" data-acquisition="editor">
      <p
        className={`acq-editor-text${view.line.fitsSlot ? "" : " is-warning"}`}
        data-acquisition="text"
      >
        {[acquisitionLineText(locale, view.line), frames]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="acq-editor-provenance" data-acquisition="provenance">
        {provenance}
      </p>
      <AcquisitionLink
        locale={locale}
        testId="acquisition-editor-link"
        onClick={onOpen}
      />
    </div>
  );
}

/**
 * The block under a target of the dialog of a plan: its effective line with the
 * count and the chip "suggéré" (or "figé au lancement").: no link "Paramètres
 * de la pose › repeated on every target — the pencil of the "Prise de vue" line
 * is the dialog's one visible entry to the setting; the target's own line is the way to ITS
 * setting and opens the same dialog for that target.
 */
export function AcquisitionTargetBlock({ locale, view, onOpen, rowKey }) {
  if (!view) return null;
  const open = (event) => {
    if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ")
      return;
    event.preventDefault();
    onOpen?.();
  };
  return (
    <div
      className="acq-target-block"
      data-acquisition="target"
      data-item={rowKey}
      data-testid={`acquisition-link-${rowKey}`}
      role="button"
      tabIndex={0}
      aria-label={message(locale, "acqSheetTitle")}
      onClick={open}
      onKeyDown={open}
    >
      <AcquisitionCardLine locale={locale} view={view} />
    </div>
  );
}
