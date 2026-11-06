// Tonight's note for the suggestions: the note
// of the night, place and slot the suggestion is for, against which the
// targets already done are compared.
//
// `summary`: the forecast's summary over the night (`summarizeAstronomyForecast`,
// whose `score` is the note); `hourly` and `span` (`{start, end}`, a slot the
// plan or the card of the night chose): a chosen slot gives the slot's note —
// the mean of its hours' scores, as the card does. `null` without a forecast,
// so that the rule gives no credit rather than invent one.
const finite = (value) => typeof value === "number" && Number.isFinite(value);

export function suggestionNoteNow({
  summary = null,
  hourly = null,
  span = null,
} = {}) {
  const start = Date.parse(span?.start);
  const end = Date.parse(span?.end);
  if (Array.isArray(hourly) && Number.isFinite(start) && Number.isFinite(end)) {
    const scores = hourly
      .filter((row) => {
        const time = Date.parse(row?.time);
        return time >= start && time < end && finite(row?.score);
      })
      .map((row) => row.score);
    if (scores.length)
      return Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length);
  }
  return finite(summary?.score) ? Math.round(summary.score) : null;
}
