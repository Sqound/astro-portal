"use client";

import { useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import {
  StatusChoice,
  countedText,
} from "portal/components/filters/FilterControls.js";
import { statusWord } from "portal/components/status/status-tones.js";
import { message } from "portal/i18n.js";
import {
  noPlanFilters,
  planFilterStatusChoices,
  planFiltersWithStatuses,
  planStatusPreselection,
  planStatusSelection,
  planStatusesTicked,
} from "../plan-library-filters.js";

// "Filtrer les plans": the year on a line of its own ("Toutes" by default),
// then the statuses — several at once, each the badge of its status, ticked or
// not (the tone, the icon, the word; ticked: the fill, an edge of 2, a tick).
// The preselection ticks everything but "Abandonné" and "Archivé"; "Tous" ticks
// really everything and, ticked again, comes back to it. In the calendar
// (`main` `null`) there is no main filter: the six statuses. "Voir N plans" is
// the primary of the dialog and "Réinitialiser" its link.
export const planFilterWord = (locale, status) => statusWord(locale, status);

export function PlanFiltersDialog({
  locale,
  main,
  filters,
  years,
  countOf,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(filters);
  const choices = planFilterStatusChoices(main);
  const ticked = planStatusesTicked(draft, main);
  const everything = planStatusSelection(draft, main) === "all";
  const setStatuses = (statuses) =>
    setDraft((current) => planFiltersWithStatuses(current, statuses, main));
  const toggle = (status) =>
    setStatuses(
      ticked.includes(status)
        ? ticked.filter((entry) => entry !== status)
        : [...ticked, status],
    );
  const choice = (key, label, selected, onClick, attributes = {}) => (
    <button
      key={key}
      type="button"
      className={`filter-choice${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
      {...attributes}
    >
      {label}
    </button>
  );
  return (
    <WebDialog
      className="plan-filters-dialog"
      bodyClassName="plan-filters-body"
      closeLabel={message(locale, "infoClose")}
      title={message(locale, "planFiltersTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            onClick={() => setDraft(noPlanFilters)}
          >
            {message(locale, "plannerPlanFilterReset")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-autofocus=""
            onClick={() => onApply(draft)}
          >
            {countedText(locale, "planFiltersApply", countOf(draft))}
          </button>
        </>
      }
    >
      <fieldset className="filter-group">
        <legend>{message(locale, "year")}</legend>
        <div className="filter-choices">
          {choice(
            "all",
            message(locale, "journalFilterAllYears"),
            draft.year === null,
            () => setDraft((current) => ({ ...current, year: null })),
            { "data-year": "all" },
          )}
          {years.map((year) =>
            choice(
              year,
              year,
              draft.year === year,
              () => setDraft((current) => ({ ...current, year })),
              { "data-year": year },
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>
          {message(
            locale,
            main === "executed"
              ? "planFiltersStatusExecuted"
              : main === "to_execute"
                ? "planFiltersStatusToExecute"
                : "filterCategoryStatus",
          )}
        </legend>
        <div className="filter-choices">
          {choice(
            "all",
            message(locale, "plannerPlanFilterAll"),
            everything,
            () =>
              setStatuses(everything ? planStatusPreselection(main) : choices),
            { "data-status": "all" },
          )}
          {choices.map((status) => (
            <StatusChoice
              key={status}
              tone={status}
              label={planFilterWord(locale, status)}
              selected={ticked.includes(status)}
              onClick={() => toggle(status)}
              data-status={status}
            />
          ))}
        </div>
      </fieldset>
    </WebDialog>
  );
}
