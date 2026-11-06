// A list of suggestions is shown at once, before the forecast has come in;
// when the forecast arrives and the list changes (its set or its order), a
// notice says "Liste mise à jour avec la météo". When the forecast confirms
// the list, nothing is said.

// What the person has been reading: the ids of the list in order, and whether
// the forecast was in it.
//
// `previous` is the last read (or `null` before any list was shown); `ids` the
// list now; `hasForecast` whether the forecast's hours are in it. Returns the
// read to keep and whether the notice is due -- only on the arrival of the
// forecast after a list was shown without it, and only when the list changed.
export function noteSuggestionRead(previous, { ids, hasForecast }) {
  if (!ids.length) return { read: previous, notice: false };
  const read = { ids: [...ids], hasForecast: Boolean(hasForecast) };
  const notice =
    Boolean(previous) &&
    !previous.hasForecast &&
    read.hasForecast &&
    previous.ids.join("\u0000") !== read.ids.join("\u0000");
  return { read, notice };
}

// How long the notice stays (ms).
export const suggestionsForecastNoticeDuration = 8000;
