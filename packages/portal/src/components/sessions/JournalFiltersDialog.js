"use client";

import { useEffect, useState } from "react";
import { WebDialog } from "../dialog/WebDialog.js";
import { StatusChoice, countedText } from "../filters/FilterControls.js";
import { journalStateTone } from "../status/status-tones.js";
import { message } from "portal/i18n.js";
import {
  JOURNAL_SEASONS,
  JOURNAL_STATES,
  OUTCOME_MESSAGES,
  journalOutcomeSelection,
  journalOutcomesChosen,
  journalOutcomesTicked,
  journalRequestQuery,
} from "./journal-list-view.js";

const capital = (value) => value[0].toUpperCase() + value.slice(1);
const NONE = {
  year: null,
  instrument: null,
  season: null,
  outcomes: null,
  multiNightOnly: false,
};

// « Sans plan » has no tone of its own: the icon of its tag, two rings.
const noPlanGlyph = (
  <svg className="status-tag-glyph" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * « Filtrer les sessions »: the year, the instrument, the season and the
 * outcome, each on a line of its own and « Toutes » / « Tous » by default — the
 * outcome as the badges of the states, several at
 * once, everything ticked but « Abandonnée », « Toutes » ticking really
 * everything —, then the box « Plans multi-nuits seulement ». « Voir N sessions » is the primary
 * of the dialog — N is what the Journal would list with those filters, asked of
 * the service as the draft changes — and « Réinitialiser » its link.
 */
export function JournalFiltersDialog({
  locale,
  filters,
  years,
  instruments,
  total,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState({
    year: filters.year,
    instrument: filters.instrument,
    season: filters.season,
    outcomes: filters.outcomes,
    multiNightOnly: filters.multiNightOnly,
  });
  const [count, setCount] = useState(total);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        let lines = 0;
        let cursor = null;
        for (let page = 0; page < 10; page += 1) {
          const query = journalRequestQuery(draft);
          query.set("limit", "100");
          if (cursor) query.set("cursor", cursor);
          const response = await fetch(`/api/v1/journal?${query}`, {
            credentials: "same-origin",
          });
          if (!response.ok) return;
          const body = await response.json();
          lines += body.sessions?.length ?? 0;
          cursor = body.nextCursor ?? null;
          if (!cursor) break;
        }
        if (!cancelled) setCount(lines);
      } catch {
        // The button keeps the last count it knew.
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft]);
  const instrumentChoices = draft.instrument
    ? [...new Set([...instruments, draft.instrument])]
    : instruments;
  const yearChoices = draft.year
    ? [...new Set([...years, draft.year])].sort((a, b) => b - a)
    : years;
  const choice = (key, label, selected, onClick, name) => (
    <button
      key={key}
      type="button"
      className={`filter-choice${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      data-filter-choice={name}
      onClick={onClick}
    >
      {label}
    </button>
  );
  const group = (name, legend, all, choices) => (
    <fieldset className="filter-group" data-filter-group={name}>
      <legend>{legend}</legend>
      <div className="filter-choices">
        {choice(
          "all",
          all,
          draft[name] === null,
          () => setDraft((current) => ({ ...current, [name]: null })),
          `${name}-all`,
        )}
        {choices.map(({ value, label }) =>
          choice(
            value,
            label,
            draft[name] === value,
            () => setDraft((current) => ({ ...current, [name]: value })),
            `${name}-${value}`,
          ),
        )}
      </div>
    </fieldset>
  );
  return (
    <WebDialog
      className="plan-filters-dialog journal-filters-dialog"
      bodyClassName="journal-filters-body"
      closeLabel={message(locale, "infoClose")}
      title={message(locale, "journalFiltersTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            onClick={() => setDraft(NONE)}
          >
            {message(locale, "journalFiltersReset")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-autofocus=""
            onClick={() => onApply(draft)}
          >
            {countedText(locale, "journalFiltersApply", count)}
          </button>
        </>
      }
    >
      {group(
        "year",
        message(locale, "year"),
        message(locale, "journalFilterAllYears"),
        yearChoices.map((value) => ({ value, label: String(value) })),
      )}
      {instrumentChoices.length > 0 ? (
        <label className="filter-select">
          <span>{message(locale, "instrument")}</span>
          <select
            name="instrument"
            value={draft.instrument ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                instrument: event.target.value || null,
              }))
            }
          >
            <option value="">
              {message(locale, "journalFilterAllInstruments")}
            </option>
            {instrumentChoices.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {group(
        "season",
        message(locale, "astronomicalSeason"),
        message(locale, "journalFilterAllSeasons"),
        JOURNAL_SEASONS.map((value) => ({
          value,
          label: message(locale, `season${capital(value)}`),
        })),
      )}
      <fieldset className="filter-group" data-filter-group="outcome">
        <legend>{message(locale, "journalFilterOutcome")}</legend>
        <div className="filter-choices">
          {choice(
            "all",
            message(locale, "journalFilterAllOutcomes"),
            journalOutcomeSelection(draft) === "all",
            () =>
              setDraft((current) => ({
                ...current,
                outcomes:
                  journalOutcomeSelection(current) === "all"
                    ? null
                    : [...JOURNAL_STATES],
              })),
            "outcome-all",
          )}
          {JOURNAL_STATES.map((state) => {
            const ticked = journalOutcomesTicked(draft);
            const tone = journalStateTone(state);
            return (
              <StatusChoice
                key={state}
                tone={tone ?? "executed"}
                icon={tone ? null : noPlanGlyph}
                label={message(locale, OUTCOME_MESSAGES[state])}
                selected={ticked.includes(state)}
                data-filter-choice={`outcome-${state}`}
                onClick={() =>
                  setDraft((current) => {
                    const now = journalOutcomesTicked(current);
                    const next = now.includes(state)
                      ? now.filter((entry) => entry !== state)
                      : [...now, state];
                    // At least one outcome stays ticked: the service answers
                    // a list of none with a refusal.
                    return next.length
                      ? { ...current, outcomes: journalOutcomesChosen(next) }
                      : current;
                  })
                }
              />
            );
          })}
        </div>
      </fieldset>
      <label className="journal-multi-night-only">
        <input
          type="checkbox"
          name="multiNightOnly"
          checked={draft.multiNightOnly}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              multiNightOnly: event.target.checked,
            }))
          }
        />
        <span>{message(locale, "journalFilterMultiNightOnly")}</span>
      </label>
    </WebDialog>
  );
}
