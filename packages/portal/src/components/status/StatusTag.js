"use client";

import { useState } from "react";
import { WebDialog } from "../dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { STATUS_SENTENCES, STATUS_TONES, statusWord } from "./status-tones.js";

// The icons of the tones: a calendar, a sheet with
// a tick, a ringed tick, a half-filled ring, a ring struck through, a box.
// 12 px, in the ink of the tone.
const glyphs = {
  planned: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  toDebrief: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 11.5l2.2 2.2 4-4.2" />
    </>
  ),
  executed: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12.3l2.6 2.6L16 9.4" />
    </>
  ),
  partial: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
    </>
  ),
  abandoned: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6 18L18 6" />
    </>
  ),
  draft: (
    <>
      <path d="M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  // The play arrow of a plan whose night runs on a phone (tone `planned`).
  running: <path d="M8 5.5v13l10-6.5z" />,
  // Two bars, a night that waits for its resume.
  paused: <path d="M8 5.5v13M16 5.5v13" />,
  archived: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5" />
      <path d="M5.5 9v9a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
    </>
  ),
};

export const StatusGlyph = ({ tone }) => (
  <svg className="status-tag-glyph" viewBox="0 0 24 24" aria-hidden="true">
    {glyphs[tone]}
  </svg>
);

/**
 * One state tag: the tone's icon and
 * word in the tone's ink, on the shared palette. A click opens the scheme of
 * the statuses (a small diagram, then a short description under each badge) unless `scheme` is false; the tag is then a plain label.
 * `session` says the word of a session (feminine); `className` and
 * `dataAttributes` are the caller's, for the hooks a screen already has.
 */
export function StatusTag({
  tone,
  locale = "en",
  session = false,
  scheme = true,
  className = "",
  label = null,
  glyph = tone,
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const word = label ?? statusWord(locale, tone, { session });
  const inner = (
    <>
      <StatusGlyph tone={glyph} />
      <span>{word}</span>
    </>
  );
  // « Brouillon » is the plan's readiness, not a step of the path the scheme
  // draws: a plain label.
  if (!scheme || tone === "draft")
    return (
      <span
        className={`status-tag is-${tone} ${className}`}
        data-status-tone={tone}
        {...rest}
      >
        {inner}
      </span>
    );
  return (
    <>
      <button
        type="button"
        className={`status-tag is-${tone} is-openable ${className}`}
        data-status-tone={tone}
        aria-haspopup="dialog"
        title={message(
          locale,
          session ? "statusSheetSessionTitle" : "statusSheetPlanTitle",
        )}
        onClick={(event) => {
          // A tag inside a card that opens on a click keeps the click.
          event.stopPropagation();
          setOpen(true);
        }}
        {...rest}
      >
        {inner}
      </button>
      {open ? (
        <StatusSchemeDialog
          locale={locale}
          session={session}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const arrow = (label) => (
  <p className="status-scheme-arrow" aria-hidden="true">
    <svg viewBox="0 0 12 14">
      <path d="M6 1v11M2.5 8.5L6 12l3.5-3.5" />
    </svg>
    {label ? <span>{label}</span> : null}
  </p>
);

/**
 * The sheet of the statuses: the intro (colour waits for an action, grey is past),
 * a small scheme of the path drawn with the tags themselves joined by thin
 * arrows — Planifié, the night, Exécuté / En partie / Abandonné, À débriefer,
 * the debriefing, the session debriefed in the Journal; Archivé aside —,
 * then each tag with its sentence, and « Fermer » (tertiary, as every sheet of
 * help). `session` says the words of a session.
 */
export function StatusSchemeDialog({
  locale = "en",
  session = false,
  onClose,
}) {
  const tag = (tone) => (
    <StatusTag tone={tone} locale={locale} session={session} scheme={false} />
  );
  return (
    <WebDialog
      className="status-scheme-dialog"
      bodyClassName="status-scheme-body"
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      focusTitle
      title={message(
        locale,
        session ? "statusSheetSessionTitle" : "statusSheetPlanTitle",
      )}
      onClose={onClose}
      footer={
        <button type="button" className="btn-tertiary" onClick={onClose}>
          {message(locale, "infoClose")}
        </button>
      }
    >
      <p className="status-scheme-intro">
        {message(locale, "statusSheetIntro")}
      </p>
      <div className="status-scheme-path" aria-hidden="true">
        {tag("planned")}
        {arrow(message(locale, "statusSheetNight"))}
        <div className="status-scheme-row">
          {tag("executed")}
          {tag("partial")}
          {tag("abandoned")}
        </div>
        {arrow()}
        {tag("toDebrief")}
        {arrow(message(locale, "statusSheetDebriefing"))}
        <div className="status-scheme-row">
          <StatusTag
            tone="executed"
            glyph="toDebrief"
            locale={locale}
            scheme={false}
            label={message(locale, "statusSheetSessionDebriefed")}
          />
          <span className="status-scheme-note">
            {message(locale, "statusSheetInJournal")}
          </span>
        </div>
        <hr />
        <div className="status-scheme-row">
          {tag("archived")}
          <span className="status-scheme-note">
            {message(locale, "statusSheetArchivedAside")}
          </span>
        </div>
      </div>
      <dl className="status-scheme-list">
        {STATUS_TONES.map((tone) => (
          <div key={tone} data-status-row={tone}>
            <dt>{tag(tone)}</dt>
            <dd>{message(locale, STATUS_SENTENCES[tone])}</dd>
          </div>
        ))}
      </dl>
    </WebDialog>
  );
}
