"use client";

import { message } from "portal/i18n.js";
import { StatusGlyph } from "../status/StatusTag.js";

export const pluralText = (locale, key, count) => {
  const category = new Intl.PluralRules(locale).select(count);
  const suffix = { one: "One", few: "Few" }[category];
  return message(locale, suffix ? `${key}${suffix}` : key);
};

/** `{name}` placeholders of a text filled in. */
export const fillText = (template, values) =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value ?? "")),
    template,
  );

/** « Voir 3 plans » / « Voir 1 session »: a count word in the language's plural. */
export const countedText = (locale, key, count) =>
  fillText(pluralText(locale, key, count), {
    count: new Intl.NumberFormat(locale).format(count),
  });

const FunnelGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 1.8v-7.2z" />
  </svg>
);

/**
 * The one « Filtres » button of a list: the filter icon,
 * the word and, when some filter differs from the default, their count; it
 * opens the sheet of the filters. A tertiary. The screen reader says the count of active filters.
 */
export function FiltersButton({ locale = "en", count = 0, onClick, testId }) {
  return (
    <button
      type="button"
      className="btn-tertiary filters-button"
      aria-haspopup="dialog"
      aria-label={
        count > 0
          ? countedText(locale, "filtersActiveCount", count)
          : message(locale, "plannerFilters")
      }
      data-testid={testId}
      onClick={onClick}
    >
      <FunnelGlyph />
      <span>{message(locale, "plannerFilters")}</span>
      {count > 0 ? (
        <span className="filters-button-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The badges of the filters chosen: « Catégorie · Valeur », one for
 * each filter that differs from the default, on a line of their own, each
 * taken off by its cross; « Réinitialiser » (link) takes them all off.
 * `badges`: `{ id, category, value, onRemove }`; with a `tone`
 * the badge is the badge of that status — its icon, its word (`value`),
 * its colours — with its cross.
 */
export function FilterBadges({ locale = "en", badges, onReset }) {
  if (!badges.length) return null;
  return (
    <div className="filter-badges" data-testid="filter-badges">
      <ul>
        {badges.map((badge) => {
          // A filter with no value (« Plans multi-nuits seulement ») is its
          // category alone.
          const label = badge.value
            ? fillText(message(locale, "filterChipLabel"), {
                category: badge.category,
                value: badge.value,
              })
            : badge.category;
          return (
            <li key={badge.id}>
              <button
                type="button"
                className={`filter-badge${badge.tone ? ` is-status is-${badge.tone}` : ""}`}
                data-filter={badge.id}
                aria-label={fillText(message(locale, "filterChipRemove"), {
                  label,
                })}
                title={fillText(message(locale, "filterChipRemove"), {
                  label,
                })}
                onClick={badge.onRemove}
              >
                {badge.tone ? (
                  <StatusGlyph tone={badge.glyph ?? badge.tone} />
                ) : null}
                <span>{badge.tone ? badge.value : label}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 7l10 10M17 7L7 17" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="btn-link" onClick={onReset}>
        {message(locale, "plannerPlanFilterReset")}
      </button>
    </div>
  );
}

/**
 * One choice of a group of statuses, several of which may be chosen: the badge of the status
 * at the size of a touch — its tone, its icon, its word. Chosen: the fill of the
 * tone, an edge of 2, a tick in place of the icon. Not a button of the four
 * levels (a badge is a chosen value); the word and the tick carry the choice,
 * never the hue alone.
 */
export function StatusChoice({
  tone,
  glyph = tone,
  icon = null,
  label,
  selected,
  onClick,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`status-choice is-${tone}${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
      {...rest}
    >
      {selected ? (
        <svg
          className="status-tag-glyph"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      ) : (
        (icon ?? <StatusGlyph tone={glyph} />)
      )}
      <span>{label}</span>
    </button>
  );
}
