"use client";

import { useState } from "react";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { countedText } from "portal/components/filters/FilterControls.js";
import { message } from "portal/i18n.js";
import {
  normalizeSuggestFilters,
  suggestFilterCatalogues,
  suggestFilterFamilies,
  suggestFilterPeriods,
} from "../suggest-filters.js";
import {
  suggestFamilyWord,
  suggestPeriodWord,
} from "../suggest-filters-web.js";

// « Filtrer les suggestions » on the
// web, the same frame as « Filtrer les plans » (`PlanFiltersDialog`): the
// catalogues and the types, several at once (« Tous » ticks nothing — no
// filter); the thirds of the night with their hours; the mask, a pill that is
// pressed (`aria-pressed`, as the statuses of the plans), with its
// consequence under it — off and disabled with « Ce lieu n'a pas de masque
// d'horizon. » where there is none. « Voir N cibles » is the primary,
// « Réinitialiser » the link.
export function SuggestFiltersDialog({
  locale,
  filters,
  periods = null,
  clock = (iso) => iso,
  hasMask = false,
  countOf,
  onApply,
  onClose,
}) {
  const [draft, setDraft] = useState(() => normalizeSuggestFilters(filters));
  const toggle = (field, value) =>
    setDraft((current) =>
      normalizeSuggestFilters({
        ...current,
        [field]: current[field].includes(value)
          ? current[field].filter((entry) => entry !== value)
          : [...current[field], value],
      }),
    );
  const choice = (key, label, selected, onClick, attributes = {}, extra) => (
    <button
      key={key}
      type="button"
      className={`filter-choice${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
      {...attributes}
    >
      {extra ? (
        <span
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 1.2,
          }}
        >
          <span>{label}</span>
          <span
            className="suggest-filter-hours"
            style={{ fontSize: "0.8em", fontWeight: 400 }}
          >
            {extra}
          </span>
        </span>
      ) : (
        label
      )}
    </button>
  );
  const count = countOf ? countOf(draft) : null;
  return (
    <WebDialog
      className="plan-filters-dialog suggest-filters-dialog"
      bodyClassName="plan-filters-body"
      closeLabel={message(locale, "infoClose")}
      title={message(locale, "suggestFiltersTitle")}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn-link"
            data-testid="suggest-filters-reset"
            onClick={() => setDraft(normalizeSuggestFilters(null))}
          >
            {message(locale, "plannerPlanFilterReset")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-autofocus=""
            data-testid="suggest-filters-apply"
            onClick={() => onApply(draft)}
          >
            {count === null || count === undefined
              ? message(locale, "suggestFiltersApplyPending")
              : countedText(locale, "suggestFiltersApply", count)}
          </button>
        </>
      }
    >
      <fieldset className="filter-group">
        <legend>{message(locale, "suggestFiltersCatalogues")}</legend>
        <div className="filter-choices">
          {choice(
            "all",
            message(locale, "plannerPlanFilterAll"),
            !draft.catalogues.length,
            () => setDraft((current) => ({ ...current, catalogues: [] })),
            { "data-catalogue": "all" },
          )}
          {suggestFilterCatalogues.map((catalogue) =>
            choice(
              catalogue,
              catalogue,
              draft.catalogues.includes(catalogue),
              () => toggle("catalogues", catalogue),
              { "data-catalogue": catalogue },
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>{message(locale, "suggestFiltersType")}</legend>
        <div className="filter-choices">
          {choice(
            "all",
            message(locale, "plannerPlanFilterAll"),
            !draft.families.length,
            () => setDraft((current) => ({ ...current, families: [] })),
            { "data-family": "all" },
          )}
          {suggestFilterFamilies.map((family) =>
            choice(
              family,
              suggestFamilyWord(locale, family),
              draft.families.includes(family),
              () => toggle("families", family),
              { "data-family": family },
            ),
          )}
        </div>
      </fieldset>
      <fieldset className="filter-group">
        <legend>{message(locale, "suggestFiltersPeriod")}</legend>
        <div
          className="filter-choices"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          }}
        >
          {suggestFilterPeriods.map((period, index) =>
            choice(
              period,
              suggestPeriodWord(locale, period),
              draft.periods.includes(period),
              () => toggle("periods", period),
              { "data-period": period },
              periods
                ? `${clock(periods[index].start)} – ${clock(periods[index].end)}`
                : null,
            ),
          )}
        </div>
        {periods ? (
          <p className="planner-autofill-muted">
            {message(locale, "suggestFiltersPeriodHelp")
              .replace("{start}", clock(periods[0].start))
              .replace("{end}", clock(periods[periods.length - 1].end))}
          </p>
        ) : null}
      </fieldset>
      <fieldset className="filter-group">
        <legend>{message(locale, "suggestFiltersMask")}</legend>
        <div className="filter-choices">
          {choice(
            "mask",
            message(locale, "suggestFiltersIgnoreMask"),
            hasMask && draft.ignoreMask,
            () =>
              setDraft((current) => ({
                ...current,
                ignoreMask: !current.ignoreMask,
              })),
            { "data-mask": "ignore", disabled: !hasMask },
          )}
        </div>
        <p
          className="planner-autofill-muted"
          data-testid="suggest-filter-mask-help"
        >
          {message(
            locale,
            hasMask ? "suggestFiltersIgnoreMaskHelp" : "suggestFiltersNoMask",
          )}
        </p>
      </fieldset>
    </WebDialog>
  );
}
