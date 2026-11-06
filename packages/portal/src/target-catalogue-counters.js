/**
 * The faceted "x/n" counter contract: a filter dropdown option or a summary
 * tile shows a plain, formatted count while no facetable filter is active
 * anywhere on the page, and `count/total` once one is — `count` being the
 * faceted result under every *other* active filter (this option's own filter
 * dimension is already excepted server-side, see
 * `evaluateFilterDimensions`/`matchesExcept` in
 * `portal-app/lib/target-library.server.js`), `total` the same breakdown with
 * nothing filtered at all (the server's `countsUnfiltered`/`.total` fields).
 *
 * Shared by the admin target library screen
 * (`packages/portal/src/components/admin/TargetLibrary.js`) and the
 * planner's own Catalogue view, so the two web surfaces never drift into two
 * slightly different readings of the same server contract.
 *
 * `count` missing (`null`/`undefined`) answers `null` — a caller then falls
 * back to whatever it shows in place of a counter (a bare option label, an
 * em dash…), exactly as neither existing consumer ever had a counter to
 * omit for an option that carries none (the hemisphere/season options).
 * `total` missing or non-finite (a portal predating `countsUnfiltered`, or a
 * dimension the server never paired with an unfiltered figure) falls back to
 * the plain count, exactly like `hasActiveFilter` being false.
 *
 * @param {number|null|undefined} count
 * @param {number|null|undefined} total
 * @param {boolean} hasActiveFilter
 * @param {(value: number) => string} [formatNumber] Locale-aware formatter,
 *   e.g. `(value) => new Intl.NumberFormat(locale).format(value)`. Defaults
 *   to a plain decimal string.
 * @returns {string|null}
 */
export function facetedCounterLabel(
  count,
  total,
  hasActiveFilter,
  formatNumber = (value) => String(value),
) {
  if (count === null || count === undefined) return null;
  if (hasActiveFilter && Number.isFinite(total)) {
    return `${formatNumber(count)}/${formatNumber(total)}`;
  }
  return formatNumber(count);
}

/**
 * Whether any of the catalogue's facetable filter dimensions carries a
 * value — the trigger for the "x/n" display in {@link facetedCounterLabel}.
 * A plain OR across whatever dimensions the caller's screen exposes: the
 * admin screen passes its six dropdowns/search box, the planner's Catalogue
 * view adds its own favorites-tab state on top.
 *
 * `favorites`/`featured` are not one of the server's facet dimensions (they
 * restrict the pool the facets are computed over instead, see
 * `libraryQueryPlan` in `portal-app/lib/target-library.server.js`), but a caller
 * with its own favorites tab still passes a truthy value here when it is
 * active: turning it on narrows `countsUnfiltered` itself down to
 * "favorites only", so the same "x/n once something narrows the pool"
 * reading still applies.
 *
 * @param {Array<unknown>} values
 * @returns {boolean}
 */
export function hasActiveFacetFilter(values) {
  return values.some((value) => Boolean(value));
}
