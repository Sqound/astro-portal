"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "./WebDialog.js";

/**
 * « One line, then ⓘ »: the web's one ⓘ. The outline info
 * glyph at 20 px on a 44 px target; it opens a dialog titled with the
 * section's or the control's title, holding the text the screen no longer
 * prints — moved, never deleted, word for word — and closed by « Fermer »
 * (tertiary).
 *
 * - `label`: the button's name (aria and tooltip). « En savoir plus »
 *   (`infoMore`) unless the screen's own wording or today's tooltip names
 *   the control.
 * - `title`: the dialog's title (the label when omitted).
 * - `body` (a sentence) and/or `children`: the moved content.
 * - `className`, `bodyClassName`: per-use styling; `testId`.
 */
export function InfoButton({
  locale = "en",
  label,
  title,
  body = null,
  children = null,
  className = "",
  bodyClassName = "",
  dialogClassName = "",
  testId,
}) {
  const [open, setOpen] = useState(false);
  const close = message(locale, "infoClose");
  const name = label || message(locale, "infoMore");
  return (
    <>
      <button
        type="button"
        className={`info-button ${className}`.trim()}
        aria-label={name}
        title={name}
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        <InfoGlyph />
      </button>
      {open ? (
        <WebDialog
          className={`info-dialog ${dialogClassName}`.trim()}
          bodyClassName={`info-dialog-body ${bodyClassName}`.trim()}
          closeLabel={close}
          closeOnBackdrop
          focusTitle
          title={title || name}
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setOpen(false)}
            >
              {close}
            </button>
          }
        >
          {body ? <p className="info-dialog-text">{body}</p> : null}
          {children}
        </WebDialog>
      ) : null}
    </>
  );
}

/** The ⓘ glyph (outline circle, stem and dot). */
export function InfoGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

/**
 * A text line with its ⓘ at the end of the row: the line is the short
 * summary, the dialog holds the detail.
 */
export function InfoLine({
  locale = "en",
  text,
  label,
  title,
  body = null,
  children = null,
  testId,
  className = "",
}) {
  return (
    <div className={`info-line ${className}`.trim()}>
      <p className="info-line-text">{text}</p>
      <InfoButton
        locale={locale}
        label={label}
        title={title}
        body={body}
        testId={testId}
      >
        {children}
      </InfoButton>
    </div>
  );
}

/**
 * The last section of a dialog, « Sources »: each `lines` entry is a
 * translated source line; each `attributions` entry is a licensor's own
 * attribution sentence, kept word for word in its language (`attributionLang`,
 * English), set apart under the heading and marked as such for the screen
 * reader.
 */
export function InfoSources({
  locale = "en",
  lines = [],
  attributions = [],
  attributionLang = "en",
}) {
  return (
    <section className="info-sources" data-kind="sources">
      <h3>{message(locale, "infoSources")}</h3>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {attributions.map((attribution) => (
        <p
          key={attribution}
          className="info-attribution"
          lang={attributionLang}
        >
          {attribution}
        </p>
      ))}
    </section>
  );
}
