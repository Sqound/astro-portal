"use client";

import { Fragment, useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { chosenOutsideGroups } from "../equipment-groups.js";
import {
  equipmentCountText,
  equipmentFieldLabel,
  equipmentKindLabel,
  equipmentKindShortLabel,
  equipmentMenuOptionLabel,
  equipmentNotFoundText,
  equipmentSearchLabel,
  searchableEquipmentCategories,
} from "../equipment-picker.js";
import { rememberEquipmentForReturn } from "../equipment-return.js";
import { equipmentSearch } from "../equipment-search.js";
import { telescopeDisplayName, telescopeMaker } from "../telescope-order.js";
import { telescopeGroups, telescopeOptionLabel } from "../telescope-picker.js";

// The equipment pickers of the web planner: one native `<select>` per field
// (telescope, camera, eyepiece, reducer or Barlow, mount), with above it the
// search field and the two menus « Marque » and « Type » that narrow its
// options (`equipment-search.js`: they never take away « Mon matériel »),
// under it the count line and « Effacer les filtres ». « Mon matériel » is
// the first `<optgroup>`; « Choisir… » names a field with nothing chosen,
// and « Aucun choix », first of the telescope, camera and eyepiece, takes the
// choice back (the field reads « Choisir… » again); nothing matching, the
// select says so and the sentence and « Définir mon matériel » follow. The
// same search bar serves the filters' dialog.

const ALL = "*";

/** The option value of « Aucun choix » (never an equipment id). */
export const noChoiceValue = "__no-choice__";

/** The categories whose picker opens on « Aucun choix »: the reducer and the mount have « Aucun » / « Aucune ». */
export const noChoiceCategories = Object.freeze([
  "telescope",
  "camera",
  "eyepiece",
]);

/**
 * The value a field takes from its select: `null` for « Aucun choix », the
 * id otherwise; `undefined` for the placeholder (nothing to change).
 */
export function equipmentPickerChoice(raw) {
  if (raw === noChoiceValue) return null;
  return raw ? raw : undefined;
}

/** The small wrench of the equipment links (« Gérer mon matériel » too). */
function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5.5a4.2 4.2 0 0 0-4.6 5.6L4.6 17a2.1 2.1 0 0 0 3 3l5.9-5.8A4.2 4.2 0 0 0 19 9.6L16.2 12.4 13.6 10.4 15.6 7.6z" />
    </svg>
  );
}

/**
 * « Définir mon matériel »: a link (the lowest of the four levels), gold, a
 * small wrench, on the right. `href` is `defineEquipmentHref` (« Mon
 * espace » → « Matériel », or the sign-in page for a visitor). With
 * `inventory` (the items of `GET /api/equipment`), the click notes what is
 * known so that the return picks the piece just declared. `onNavigate`
 * receives the click (a caller that stays on its page prevents it).
 */
export function DefineEquipmentLink({
  locale,
  href,
  inventory = null,
  onNavigate,
  className = "",
}) {
  return (
    <p className={`planner-equipment-define ${className}`.trim()}>
      <a
        className="btn-link planner-equipment-define-link"
        href={href}
        onClick={(event) => {
          if (inventory) {
            let storage = null;
            try {
              storage = window.sessionStorage;
            } catch {
              storage = null;
            }
            rememberEquipmentForReturn(storage, inventory);
          }
          onNavigate?.(event);
        }}
      >
        <WrenchIcon />
        {message(locale, "plannerEquipmentDefineMine")}
      </a>
    </p>
  );
}

/**
 * The defaults hidden and nothing of one's own: the existing sentence and
 * « Définir mon matériel », one link.
 */
export function EquipmentHiddenEmptyNotice({ locale, define }) {
  return (
    <div className="planner-equipment-in-space">
      <p className="planner-equipment-readout">
        {message(locale, "plannerEquipmentAddInSpace")}
      </p>
      {define?.href ? (
        <DefineEquipmentLink locale={locale} {...define} />
      ) : null}
    </div>
  );
}

/**
 * One menu, « Marque » or « Type »: a native select of single choice. The
 * closed select shows the chosen option's text, so that option reads its
 * `chosenLabel` (the short name of a long kind) with its count; the others
 * keep their full `label`.
 */
function FilterMenu({ locale, name, allLabel, value, options, onChange }) {
  return (
    <label className={`planner-equipment-menu${value ? " is-set" : ""}`.trim()}>
      <select
        aria-label={name}
        value={value ?? ""}
        onChange={(event) =>
          onChange(
            event.target.value === ALL || event.target.value === ""
              ? null
              : event.target.value,
          )
        }
      >
        <option hidden value="">
          {name}
        </option>
        <option value={ALL}>{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {equipmentMenuOptionLabel(
              locale,
              option.value === value && option.chosenLabel
                ? option.chosenLabel
                : option.label,
              option.count,
            )}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The search field, the menus and the count line of one category, given the
 * answer of `equipmentSearch` (`shown`). Each part is drawn when the rule says
 * so; the count line goes under `children` (the field's own select).
 */
export function EquipmentSearchBar({
  locale,
  category,
  shown,
  query,
  onQuery,
  onMaker,
  onKind,
  children = null,
}) {
  const searchLabel = equipmentSearchLabel(locale, category);
  return (
    <Fragment>
      {shown.showsSearch ? (
        <label className="planner-equipment-search planner-telescope-search">
          <input
            type="search"
            autoComplete="off"
            spellCheck={false}
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
      ) : null}
      {shown.showsMakerMenu || shown.showsKindMenu ? (
        <div className="planner-equipment-menus">
          {shown.showsMakerMenu ? (
            <FilterMenu
              locale={locale}
              name={message(locale, "plannerEquipmentBrand")}
              allLabel={message(locale, "plannerEquipmentAllBrands")}
              value={shown.maker}
              options={shown.makers.map((maker) => ({
                ...maker,
                label: maker.value,
              }))}
              onChange={onMaker}
            />
          ) : null}
          {shown.showsKindMenu ? (
            <FilterMenu
              locale={locale}
              name={message(locale, "plannerEquipmentType")}
              allLabel={message(locale, "plannerEquipmentAllTypes")}
              value={shown.kind}
              options={shown.kinds.map((kind) => ({
                ...kind,
                label: equipmentKindLabel(locale, category, kind.value),
                chosenLabel: equipmentKindShortLabel(
                  locale,
                  category,
                  kind.value,
                ),
              }))}
              onChange={onKind}
            />
          ) : null}
        </div>
      ) : null}
      {children}
      {shown.showsMenus ? (
        <p className="planner-equipment-count">
          <span>{equipmentCountText(locale, category, shown.count)}</span>
          {shown.filtered ? (
            <Fragment>
              <span aria-hidden="true"> · </span>
              <button
                type="button"
                className="btn-link planner-equipment-clear-filters"
                onClick={() => {
                  onMaker(null);
                  onKind(null);
                }}
              >
                {message(locale, "plannerEquipmentClearFilters")}
              </button>
            </Fragment>
          ) : null}
        </p>
      ) : null}
    </Fragment>
  );
}

/**
 * The state of a search bar: the text and the two menus, and what the rule
 * shows for them. `options` are those of `equipmentSearch` (`category`,
 * `mine`, `defaults`, `nameOf`, `makerOf`).
 */
export function useEquipmentSearch(
  options,
  { initialQuery = "", initialMaker = null, initialKind = null } = {},
) {
  const [query, setQuery] = useState(initialQuery);
  const [maker, setMaker] = useState(initialMaker);
  const [kind, setKind] = useState(initialKind);
  // A mount is neither searched nor filtered: every row, no field, no menu.
  const searchable = searchableEquipmentCategories.includes(options.category);
  const shown = equipmentSearch(
    searchable ? { ...options, query, maker, kind } : options,
  );
  return {
    query,
    shown: searchable
      ? shown
      : {
          ...shown,
          showsSearch: false,
          showsMenus: false,
          showsMakerMenu: false,
          showsKindMenu: false,
          makers: [],
          kinds: [],
        },
    onQuery: setQuery,
    onMaker: setMaker,
    onKind: setKind,
  };
}

const plainLabel = (profile) => profile.name;

/**
 * The picker of one field. Props:
 * - `category`: "telescope", "camera", "eyepiece", "modifier" or "mount" (a
 *   mount is not searched nor filtered);
 * - `value` (an id, `null` when nothing is chosen: « Choisir… »), `onChange(id)`;
 * - `mine` (one's own, without the archived), `defaults` (the default list,
 *   empty when the space hides it), `known` (every profile the plan may name,
 *   the hidden defaults too, so that the closed select still names it);
 * - `defaultsLabelled`: a person signed in to a space — « Mon matériel » and
 *   « Matériel par défaut » are `<optgroup>`s; a visitor's defaults are listed
 *   without that heading (the telescopes keep their kinds);
 * - `leading`: options before everything, outside the groups and the
 *   filters (`[{ id, label }]`: « Aucun » of the reducer, « Aucune » of the
 *   mount); a telescope, a camera or an eyepiece opens on « Aucun choix »,
 *   outside the groups and the filters too, which hands `onChange(null)`;
 * - `optionLabel(profile)`: the text of an option (the telescopes default to
 *   « name · line of facts »);
 * - `define`: the props of « Définir mon matériel » (`href`, `inventory`,
 *   `onNavigate`), drawn here only when nothing matches (the section draws it
 *   once otherwise); `hiddenEmpty`: the defaults hidden and nothing of one's
 *   own, the select gives way to `EquipmentHiddenEmptyNotice`;
 * - `onNoMatchChange(boolean)`: told when « nothing matches » starts or
 *   ends, so the section hides its own link meanwhile (one link on screen).
 */
export function EquipmentPicker({
  locale,
  category,
  value = null,
  onChange,
  mine = [],
  defaults = [],
  known = null,
  defaultsLabelled = false,
  leading = [],
  optionLabel,
  label,
  define = null,
  hiddenEmpty = false,
  onNoMatchChange,
  disabled = false,
  initialQuery = "",
  initialMaker = null,
  initialKind = null,
}) {
  const telescopes = category === "telescope";
  const leadingIds = new Set(leading.map((option) => option.id));
  const listedDefaults = defaults.filter(
    (profile) => !leadingIds.has(profile.id),
  );
  const listedMine = mine.filter((profile) => !leadingIds.has(profile.id));
  const search = useEquipmentSearch(
    {
      category,
      mine: listedMine,
      defaults: listedDefaults,
      ...(telescopes
        ? { nameOf: telescopeDisplayName, makerOf: telescopeMaker }
        : {}),
    },
    { initialQuery, initialMaker, initialKind },
  );
  const { shown } = search;
  const noMatch = shown.noMatch;
  useEffect(() => {
    onNoMatchChange?.(noMatch);
  }, [noMatch, onNoMatchChange]);
  // A picker that leaves the screen (the mode changed) matches again.
  useEffect(() => () => onNoMatchChange?.(false), [onNoMatchChange]);

  if (hiddenEmpty)
    return <EquipmentHiddenEmptyNotice locale={locale} define={define} />;

  const textOf =
    optionLabel ??
    (telescopes
      ? (profile) => telescopeOptionLabel(locale, profile)
      : plainLabel);
  const groups = telescopes
    ? telescopeGroups(
        locale,
        { mine: listedMine, common: listedDefaults, defaultsLabelled },
        search.query,
        { maker: shown.maker, kind: shown.kind },
      )
    : [
        ...(shown.mine.length
          ? [
              {
                key: "mine",
                label: message(locale, "plannerGroupMine"),
                profiles: shown.mine,
              },
            ]
          : []),
        ...(shown.defaults.length
          ? [
              {
                key: "default",
                label: defaultsLabelled
                  ? message(locale, "plannerGroupDefault")
                  : "",
                profiles: shown.defaults,
              },
            ]
          : []),
      ];
  const everyProfile = known || [...mine, ...defaults];
  const chosenHidden = leadingIds.has(value)
    ? null
    : chosenOutsideGroups(value, everyProfile, groups);
  // An id no list holds reads « Choisir… » too, never the first option.
  const nothingChosen =
    value === null ||
    value === undefined ||
    value === "" ||
    !(
      leadingIds.has(value) ||
      everyProfile.some((profile) => profile.id === value)
    );
  const fieldLabel = label ?? equipmentFieldLabel(locale, category);
  const noChoice = noChoiceCategories.includes(category);

  return (
    <div
      className={`planner-equipment-picker planner-telescope-picker${noMatch ? " is-no-match" : ""}`}
      data-equipment-category={category}
    >
      <EquipmentSearchBar locale={locale} category={category} {...search}>
        <label className="planner-equipment-choice">
          <select
            aria-label={fieldLabel}
            value={nothingChosen ? "" : value}
            disabled={disabled}
            onChange={(event) => {
              const chosen = equipmentPickerChoice(event.target.value);
              if (chosen !== undefined) onChange(chosen);
            }}
          >
            {nothingChosen ? (
              <option disabled hidden value="">
                {message(locale, "plannerEquipmentChoose")}
              </option>
            ) : null}
            {chosenHidden ? (
              <option hidden value={chosenHidden.id}>
                {telescopes
                  ? telescopeDisplayName(chosenHidden)
                  : textOf(chosenHidden)}
              </option>
            ) : null}
            {noChoice ? (
              <option value={noChoiceValue}>
                {message(locale, "plannerEquipmentNoChoice")}
              </option>
            ) : null}
            {leading.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
            {groups.map((group) => {
              const options = group.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {textOf(profile)}
                </option>
              ));
              return group.label ? (
                <optgroup key={group.key} label={group.label}>
                  {options}
                </optgroup>
              ) : (
                <Fragment key={group.key}>{options}</Fragment>
              );
            })}
            {noMatch ? (
              <option disabled value="">
                {message(locale, "plannerTelescopeNoMatch")}
              </option>
            ) : null}
          </select>
        </label>
      </EquipmentSearchBar>
      {noMatch ? (
        <div className="planner-equipment-no-match">
          <p className="planner-equipment-readout">
            {equipmentNotFoundText(locale, category)}
          </p>
          {define?.href ? (
            <DefineEquipmentLink locale={locale} {...define} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
