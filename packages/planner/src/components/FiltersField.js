"use client";

import { InfoLine } from "portal/components/dialog/InfoButton.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import { useState } from "react";
import { equipmentNotFoundText } from "../equipment-picker.js";
import { equipmentSearchThreshold } from "../equipment-search.js";
import { filterDisplayName } from "../telescope-order.js";
import {
  DefineEquipmentLink,
  EquipmentSearchBar,
  useEquipmentSearch,
} from "./EquipmentPicker.js";

// The filters of the equipment stage are a field "Filtres · N sélectionnés"
// ("Aucun" at zero) that opens a dialog of check boxes — "Mon matériel" then
// the other group, the search field and the menu « Type » (the family) of
// every equipment picker above twelve filters, « Définir mon matériel » just
// above "Effacer" (link) and "Appliquer" (primary) — the chosen filters
// recalled as small tags under the field,
// one line and a ⓘ in place of the paragraph of help. Selection semantics are
// unchanged: a target matches at least one chosen filter under the equipment
// restriction.

/**
 * More filters than this, and the dialog opens with a search field: the
 * threshold of every equipment picker.
 */
export const filtersSearchThreshold = equipmentSearchThreshold;

/** The value of the field: "Aucun", "1 sélectionné", "2 sélectionnés". */
export function filtersFieldValue(locale, count) {
  if (count <= 0) return message(locale, "plannerFiltersNone");
  return message(
    locale,
    count === 1 ? "plannerFiltersSelectedOne" : "plannerFiltersSelected",
  ).replace("{count}", count);
}

/** How many filters the groups hold. */
export function filtersTotal(groups) {
  return groups.reduce((sum, group) => sum + group.profiles.length, 0);
}

/** The chosen filters, in the order they were chosen, that the groups know. */
export function chosenFilterProfiles(groups, selectedIds) {
  const byId = new Map();
  for (const group of groups)
    for (const profile of group.profiles) byId.set(profile.id, profile);
  return selectedIds.map((id) => byId.get(id)).filter(Boolean);
}

function FieldChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="planner-filters-chevron"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * The rows of the dialog: one check row per filter under its group's label.
 * [chosen] are the ids ticked; [onToggle] receives an id.
 */
export function FilterChoices({
  locale,
  groups,
  chosen,
  onToggle,
  labelOf = (profile) => filterDisplayName(profile),
}) {
  return (
    <div
      className="planner-filter-choices"
      role="group"
      aria-label={message(locale, "plannerFilters")}
    >
      {groups.map((group) => (
        <section key={group.key} data-group={group.key}>
          {group.label ? (
            <p className="planner-filter-group-label">{group.label}</p>
          ) : null}
          <ul>
            {group.profiles.map((profile) => (
              <li key={profile.id}>
                <label
                  className="planner-filter-choice"
                  data-filter={profile.id}
                >
                  <span>{labelOf(profile)}</span>
                  <input
                    type="checkbox"
                    checked={chosen.includes(profile.id)}
                    onChange={() => onToggle(profile.id)}
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "{name} only offers its own filters.": said when the plan's telescope or
 * camera offers its own filters only, with "Edit" (a link to the page where
 * "My equipment" is edited) when the person owns it. `line` is
 * `{ name, href }`, `href` null when the equipment is not the person's.
 */
function OwnOnlyLine({ locale, line }) {
  return (
    <p className="planner-filters-own-only" data-filters-own-only>
      <span>
        {message(locale, "filtersSheetOwnOnly").replace("{name}", line.name)}
      </span>
      {line.href ? (
        <a className="btn-link" href={line.href}>
          {message(locale, "filtersOwnOnlyEdit")}
        </a>
      ) : null}
    </p>
  );
}

/**
 * The dialog: the choices are edited here and written as a whole by
 * "Appliquer"; the cross, Escape or a click outside leave them as they were.
 * The search and « Type » follow the rule of every equipment picker
 * (`equipmentSearch`): « Mon matériel » follows the search only.
 */
function FiltersDialog({
  locale,
  groups,
  selectedIds,
  labelOf,
  ownOnly,
  define = null,
  onApply,
  onClose,
}) {
  const [chosen, setChosen] = useState(selectedIds);
  const search = useEquipmentSearch({
    category: "filter",
    mine: groups
      .filter((group) => group.key === "mine")
      .flatMap((group) => group.profiles),
    defaults: groups
      .filter((group) => group.key !== "mine")
      .flatMap((group) => group.profiles),
    nameOf: labelOf,
  });
  const kept = new Set(
    [...search.shown.mine, ...search.shown.defaults].map(
      (profile) => profile.id,
    ),
  );
  const shown = groups
    .map((group) => ({
      ...group,
      profiles: group.profiles.filter((profile) => kept.has(profile.id)),
    }))
    .filter((group) => group.profiles.length > 0);
  const noMatch = search.shown.noMatch;
  const toggle = (id) =>
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  return (
    <WebDialog
      className="planner-filters-dialog"
      title={message(locale, "plannerFilters")}
      closeLabel={message(locale, "infoClose")}
      closeOnBackdrop
      onClose={onClose}
      footer={
        <>
          {/* Just above « Effacer » and « Appliquer », which stay as they
              are; nothing matching, the link is in the body instead. */}
          {define?.href && !noMatch ? (
            <DefineEquipmentLink
              locale={locale}
              className="planner-filters-define"
              {...define}
            />
          ) : null}
          <button
            type="button"
            className="btn-link"
            data-filters-clear
            disabled={chosen.length === 0}
            onClick={() => setChosen([])}
          >
            {message(locale, "plannerFiltersClear")}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-filters-apply
            onClick={() => {
              onApply(chosen);
              onClose();
            }}
          >
            {message(locale, "plannerFiltersApply")}
          </button>
        </>
      }
    >
      <EquipmentSearchBar locale={locale} category="filter" {...search} />
      {noMatch ? (
        <div className="planner-equipment-no-match" data-filters-no-match>
          <p className="planner-filters-no-match">
            {message(locale, "plannerFiltersNoMatch")}
          </p>
          <p className="planner-filters-no-match">
            {equipmentNotFoundText(locale, "filter")}
          </p>
          {define?.href ? (
            <DefineEquipmentLink locale={locale} {...define} />
          ) : null}
        </div>
      ) : (
        <FilterChoices
          locale={locale}
          groups={shown}
          chosen={chosen}
          onToggle={toggle}
          labelOf={labelOf}
        />
      )}
      {ownOnly ? <OwnOnlyLine locale={locale} line={ownOnly} /> : null}
    </WebDialog>
  );
}

/**
 * The filters of the equipment stage: the field, the tags of the chosen
 * filters, one line and the ⓘ. [groups] are `{ key, label, profiles }` in
 * display order (a visitor has one group without a label); [onApply]
 * receives the ids chosen in the dialog; [define] the props of « Définir mon
 * matériel » (`DefineEquipmentLink`), none for a page that offers none.
 */
export function FiltersField({
  locale,
  groups,
  selectedIds,
  onApply,
  labelOf = (profile) => filterDisplayName(profile),
  ownOnly = null,
  define = null,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  if (filtersTotal(groups) === 0) return null;
  const tags = chosenFilterProfiles(groups, selectedIds);
  return (
    <fieldset
      className={`planner-setting-group planner-equipment-group planner-equipment-filter-group ${className}`.trim()}
    >
      <legend>{message(locale, "plannerFilters")}</legend>
      <button
        type="button"
        className="planner-filters-field"
        data-filters-field
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="planner-filters-value">
          {filtersFieldValue(locale, selectedIds.length)}
        </span>
        <FieldChevron />
      </button>
      {tags.length > 0 ? (
        <ul className="planner-filter-tags" data-filter-tags>
          {tags.map((profile) => (
            <li key={profile.id} data-filter={profile.id}>
              {labelOf(profile)}
            </li>
          ))}
        </ul>
      ) : null}
      {/* « Une ligne, puis ⓘ »: the sentence that matters stays, the
          rest of the help — word for word — is behind the ⓘ. */}
      <InfoLine
        locale={locale}
        className="planner-filter-line"
        text={message(locale, "plannerFiltersNoChoiceLine")}
        title={message(locale, "plannerFilters")}
        testId="planner-filters-info"
      >
        <p className="info-dialog-text">{flow(locale, "filterHelp")}</p>
        <p className="info-dialog-text">{flow(locale, "filterActive")}</p>
      </InfoLine>
      {open ? (
        <FiltersDialog
          locale={locale}
          groups={groups}
          selectedIds={selectedIds}
          labelOf={labelOf}
          ownOnly={ownOnly}
          define={define}
          onApply={onApply}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </fieldset>
  );
}
