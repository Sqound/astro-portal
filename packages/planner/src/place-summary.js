// The one line stage 1 (place and date) shows once it is folded away.
//
// It reads: the
// place, then the observing night's date, then whether a horizon mask is in
// force -- so that a folded stage still answers "which night, where, with
// what horizon" without being unfolded. The place leads, matching the open
// stage's own fields -- the date sheet's weather depends on the place, so the
// place is picked first.
//
// The composition is kept free of React and of the message catalogue: the
// caller passes the already-localized fragments, this decides what goes in
// and in what order. It lives with the planner's page (`packages/planner`),
// the only one to show it, rather than in `packages/portal`.

// How long a place fact may run before it is cut short. Long enough for
// almost any real name, short enough that a pathological one cannot push the
// date and the horizon fact off a phone-width summary line.
export const placeSummaryLabelLimit = 60;

const trimmed = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The place's own fragment: its name, then the geocoded locality, then --
 * when neither exists -- its coordinates. Two decimal places, deliberately
 * coarser than the open stage's five: a folded line identifies the place, it
 * does not survey it.
 *
 * @param {object} options
 * @param {string} [options.name]
 * @param {string} [options.locality]
 * @param {string} [options.coordinates] the already-formatted fallback.
 * @returns {string}
 */
export function placeSummaryLabel({ name, locality, coordinates } = {}) {
  const label = trimmed(name) || trimmed(locality) || trimmed(coordinates);
  return label.length <= placeSummaryLabelLimit
    ? label
    : `${label.slice(0, placeSummaryLabelLimit)}…`;
}

/**
 * @param {object} options every string already localized by the caller.
 * @param {string} options.dateLabel the observing night, e.g. "Nuit du 16 au
 *   17 septembre 2026".
 * @param {string} [options.placeLabel] from `placeSummaryLabel`; empty when
 *   no place has been chosen yet.
 * @param {string} [options.horizonLabel] "mask active" or "no mask".
 * @param {string} [options.noPlaceLabel] the invitation the open stage shows
 *   when there is no place -- reused rather than restated.
 * @returns {string}
 */
export function foldedPlaceSummary({
  dateLabel,
  placeLabel,
  horizonLabel,
  noPlaceLabel,
} = {}) {
  const date = trimmed(dateLabel);
  const place = trimmed(placeLabel);
  // No place means no horizon to describe either: the line invites one to be
  // chosen, exactly as the open stage does.
  if (!place) return [trimmed(noPlaceLabel), date].filter(Boolean).join(" · ");
  return [place, date, trimmed(horizonLabel)].filter(Boolean).join(" · ");
}
