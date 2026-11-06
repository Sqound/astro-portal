import { message } from "portal/i18n.js";
import { StatusTag } from "../status/StatusTag.js";
import { journalStateTone } from "../status/status-tones.js";
import { OUTCOME_MESSAGES } from "./journal-list-view.js";

const noPlanGlyph = (
  <svg className="status-tag-glyph" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * The outcome of a session as a tag of the shared palette: « À débriefer » blue, « Exécutée », « Exécutée en partie » and
 * « Abandonnée » grey — the grey says the night is past, a green would say
 * there is something to do —, « Sans plan » neutral, with the icon of its tone
 * (the feminine words). A click
 * on a tag opens the sheet of the statuses of a session. Not a button of
 * the four levels.
 */
export function JournalOutcomeChip({
  state,
  locale = "en",
  guidedEvening = false,
}) {
  const key = OUTCOME_MESSAGES[state];
  // The session of a guided evening is called « Soirée guidée · nom » where
  // it is drawn and has no outcome: never « Sans plan ».
  if (!key || guidedEvening) return null;
  const tone = journalStateTone(state);
  if (!tone)
    return (
      <span
        className="status-tag is-neutral journal-outcome"
        data-state={state}
      >
        {noPlanGlyph}
        <span>{message(locale, key)}</span>
      </span>
    );
  return (
    <StatusTag
      tone={tone}
      locale={locale}
      session
      className="journal-outcome"
      data-state={state}
    />
  );
}
