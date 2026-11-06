"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FilterBadges, FiltersButton } from "../filters/FilterControls.js";
import { message } from "portal/i18n.js";
import { JournalFiltersDialog } from "./JournalFiltersDialog.js";
import { journalStateTone } from "../status/status-tones.js";
import {
  JOURNAL_STATES,
  OUTCOME_MESSAGES,
  journalHref,
  journalOutcomeSelection,
  journalOutcomesChosen,
  journalOutcomesTicked,
  statsSegments,
} from "./journal-list-view.js";

const capital = (value) => value[0].toUpperCase() + value.slice(1);

/**
 * How many filters differ from the default (the count on « Filtres »): one per
 * badge — « Issue · Toutes » when every outcome is ticked, else one per outcome
 * ticked once the selection is not the preselection.
 */
export const journalFiltersCount = (filters) =>
  [
    // In the calendar the year is the calendar's own scope (it opens on the
    // latest year by itself), not a filter the person set.
    filters.view === "calendar" ? null : filters.year,
    filters.instrument,
    filters.season,
    filters.multiNightOnly,
  ].filter(Boolean).length +
  (journalOutcomeSelection(filters) === "preselection"
    ? 0
    : journalOutcomeSelection(filters) === "all"
      ? 1
      : journalOutcomesTicked(filters).length);

/**
 * The head of the Journal: « Sessions / Calendrier », **one**
 * « Filtres » button — it replaces the four lists and the box of before; it
 * opens « Filtrer les sessions » —, a badge « Catégorie · Valeur » for each
 * filter that differs from the default (the year is « Toutes » by default),
 * each taken off by its cross, « Réinitialiser » for all, and, at the right,
 * the figures of the selection. **The filters live in the address**
 * (`journalHref`): a change goes to the page of the address it makes, which the
 * server answers — so a filtered Journal is a link one can keep, and the back
 * button undoes a filter.
 */
export function JournalControls({
  locale = "en",
  filters,
  years = [],
  instruments = [],
  stats = null,
  total = 0,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const go = (change) =>
    router.push(
      journalHref(locale, {
        ...filters,
        // A change of the page closes the dialog of a target or an instrument.
        statsTarget: null,
        statsInstrument: null,
        ...change,
      }),
    );
  const count = journalFiltersCount(filters);
  const badges = [
    filters.year && filters.view !== "calendar"
      ? {
          id: "year",
          category: message(locale, "year"),
          value: String(filters.year),
          onRemove: () => go({ year: null }),
        }
      : null,
    filters.instrument
      ? {
          id: "instrument",
          category: message(locale, "instrument"),
          value: filters.instrument,
          onRemove: () => go({ instrument: null }),
        }
      : null,
    filters.season
      ? {
          id: "season",
          category: message(locale, "astronomicalSeason"),
          value: message(locale, `season${capital(filters.season)}`),
          onRemove: () => go({ season: null }),
        }
      : null,
    ...(journalOutcomeSelection(filters) === "all"
      ? [
          {
            id: "outcome-all",
            category: message(locale, "journalFilterOutcome"),
            value: message(locale, "journalFilterAllOutcomes"),
            onRemove: () => go({ outcomes: null }),
          },
        ]
      : journalOutcomeSelection(filters) === "custom"
        ? JOURNAL_STATES.filter((state) =>
            journalOutcomesTicked(filters).includes(state),
          ).map((state) => ({
            id: `outcome-${state}`,
            category: message(locale, "journalFilterOutcome"),
            value: message(locale, OUTCOME_MESSAGES[state]),
            tone: journalStateTone(state) ?? "executed",
            onRemove: () =>
              go({
                outcomes: journalOutcomesChosen(
                  journalOutcomesTicked(filters).filter(
                    (entry) => entry !== state,
                  ),
                ),
              }),
          }))
        : []),
    filters.multiNightOnly
      ? {
          id: "multi-night",
          category: message(locale, "journalFilterMultiNightOnly"),
          value: "",
          onRemove: () => go({ multiNightOnly: false }),
        }
      : null,
  ].filter(Boolean);
  return (
    <div className="sessions-tools journal-tools">
      <div className="journal-tools-row">
        <div
          className={`session-view-switch has-statistics${filters.view === "calendar" ? " is-calendar" : ""}`}
          role="tablist"
          aria-label={message(locale, "galleryJournal")}
        >
          <button
            className={filters.view === "list" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={filters.view === "list"}
            onClick={() => go({ view: "list" })}
          >
            {message(locale, "showSessionList")}
          </button>
          <button
            className={filters.view === "calendar" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={filters.view === "calendar"}
            onClick={() => go({ view: "calendar" })}
          >
            {message(locale, "showYearCalendar")}
          </button>
          <button
            className={filters.view === "statistics" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={filters.view === "statistics"}
            onClick={() => go({ view: "statistics" })}
            data-testid="journal-view-statistics"
          >
            {message(locale, "journalViewStatistics")}
          </button>
        </div>
        <FiltersButton
          locale={locale}
          count={count}
          onClick={() => setOpen(true)}
          testId="journal-filters-button"
        />
      </div>
      <FilterBadges
        locale={locale}
        badges={badges}
        onReset={() =>
          go({
            year: null,
            instrument: null,
            season: null,
            outcomes: null,
            multiNightOnly: false,
          })
        }
      />
      {stats && stats.sessions > 0 ? (
        <p className="journal-stats" aria-live="polite">
          {statsSegments(stats, filters.year, locale).map((segment, index) =>
            segment.bold ? (
              <b key={index}>{segment.text}</b>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      ) : null}
      {open ? (
        <JournalFiltersDialog
          locale={locale}
          filters={filters}
          years={years}
          instruments={instruments}
          total={total}
          onApply={(change) => {
            setOpen(false);
            go(change);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
