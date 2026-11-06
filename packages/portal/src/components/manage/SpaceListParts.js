"use client";

import { message } from "portal/i18n.js";
import { ActionMenu } from "../menu/ActionMenu.js";
import { countedText } from "../filters/FilterControls.js";

/**
 * The pieces the tabs « Plans » and « Sessions » of « Mon espace » share
 * (SPACE-DATA-MANAGE-01): the band of the list (the search on its own line,
 * the filter chips and the order a tertiary at the end), a row (its box,
 * its eyebrow, title and line, its state, its figures and its ⋯), and the
 * bar of a selection. The model is the tab « Captures »: the same classes
 * for the band (`captures-band`, `filter-tag`, `captures-sort`), the shared
 * menu (`ActionMenu`) for the ⋯.
 */

const SearchIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);

const SortIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3" />
  </svg>
);

/** The search, then one band: the chips, the order at its end. */
export function ListBand({
  filters,
  filter,
  onFilter,
  query,
  onQuery,
  searchLabel,
  oldestFirst,
  onSort,
  sortWords,
}) {
  return (
    <div className="captures-tools space-list-tools">
      {onQuery ? (
        <label className="captures-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={searchLabel}
            aria-label={searchLabel}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
      ) : null}
      <div className="captures-band">
        <div className="filters private-gallery-filters captures-filters">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`filter-tag${filter === key ? " is-active" : ""}`}
              aria-pressed={filter === key}
              data-filter={key}
              onClick={() => onFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {onSort ? (
          <button
            type="button"
            className="btn-tertiary captures-sort"
            aria-label={sortWords.label}
            title={sortWords.label}
            onClick={onSort}
          >
            <SortIcon />
            <span className="captures-sort-label">
              {oldestFirst ? sortWords.oldest : sortWords.newest}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One row: its box (a 44 px target), its eyebrow (the night), its title (and
 * the badge of the multi-night plan it follows), its line (the place, the
 * targets), its state, its figures and its ⋯ menu. The title opens the row
 * (`href`).
 */
export function ListRow({
  row,
  selected,
  onSelect,
  selectLabel,
  href,
  badge = null,
  state,
  menuLabel,
  menuItems,
}) {
  return (
    <li
      className={`space-list-row${selected ? " is-selected" : ""}`}
      data-row={row.key}
      data-kind={row.kind}
    >
      <label className="space-list-check">
        <input
          type="checkbox"
          checked={selected}
          aria-label={selectLabel}
          onChange={(event) => onSelect(event.target.checked)}
        />
      </label>
      <a className="space-list-main" href={href ?? undefined}>
        {row.eyebrow ? (
          <span className="space-list-eyebrow">{row.eyebrow}</span>
        ) : null}
        <span className="space-list-title">
          <span className="space-list-name">{row.name}</span>
          {badge ? (
            <span className="journal-badge is-plan">{badge}</span>
          ) : null}
        </span>
        {row.line ? <span className="space-list-line">{row.line}</span> : null}
      </a>
      <span className="space-list-state">{state}</span>
      <span className="space-list-meta">
        {row.meta ? <b>{row.meta}</b> : null}
        {row.metaLine ? <span>{row.metaLine}</span> : null}
      </span>
      <span className="space-list-actions">
        <ActionMenu
          label={menuLabel}
          items={menuItems}
          testId="space-list-menu"
        />
      </span>
    </li>
  );
}

/**
 * The bar of a selection, from the first box ticked: « 2 plans sélectionnés »,
 * « Tout sélectionner » (the rows shown only) or « Tout désélectionner »
 * (links), « Archiver » (a tertiary, plans only), then the deletion, a
 * tertiary in the destructive tint.
 */
export function SelectionBar({
  locale,
  count,
  shown,
  countKey,
  deleteKey,
  onAll,
  onNone,
  onArchive = null,
  onDelete,
  busy = false,
}) {
  if (!count) return null;
  return (
    <div
      className="space-list-selbar"
      role="region"
      aria-label={message(locale, "spaceSelectionLabel")}
      data-testid="space-list-selection"
    >
      <span className="space-list-selcount" aria-live="polite">
        {countedText(locale, countKey, count)}
      </span>
      {count < shown ? (
        <button
          type="button"
          className="btn-link"
          onClick={onAll}
          disabled={busy}
        >
          {message(locale, "spaceSelectAll")}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-link"
        onClick={onNone}
        disabled={busy}
      >
        {message(locale, "spaceSelectNone")}
      </button>
      {onArchive ? (
        <button
          type="button"
          className="btn-tertiary"
          data-action="archive-selection"
          onClick={onArchive}
          disabled={busy}
        >
          {message(locale, "spaceSelectionArchive")}
        </button>
      ) : null}
      <button
        type="button"
        className="btn-tertiary is-destructive"
        data-action="delete-selection"
        onClick={onDelete}
        disabled={busy}
      >
        {countedText(locale, deleteKey, count)}
      </button>
    </div>
  );
}

/** A sentence that stays on the tab after an action, until the next one. */
export function ListNotice({ notice }) {
  if (!notice) return null;
  return (
    <p
      className={`journal-notice space-list-notice${notice.kind === "alert" ? " is-alert" : ""}`}
      role={notice.kind === "alert" ? "alert" : "status"}
      data-testid="space-list-notice"
    >
      {notice.text}
    </p>
  );
}
