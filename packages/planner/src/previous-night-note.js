// The seam through which the suggestions read the note of a night gone by
//
// A target done before is ranked lower the less tonight brings over that
// time, and the comparison needs the note the earlier night had. No note is
// stored with a finished night: it is worked out again from the weather
// measured that night, by the engine of the conditions calendar (the month
// read from `GET /v1/weather/history`, then `conditionsNightSummary` on the
// measured rows). Free: no right is checked and nothing is shown with it.
// Offline, without the archive or without coordinates this answers `null` —
// "unknown" — and the rule degrades to "no credit", never to an invention or
// an error.
import { requestAstronomyWeatherHistory } from "portal/astronomy-weather.js";
import { conditionsNightSummary } from "./conditions-calendar.js";

const kept = new Map();

// Forgets the answers kept (tests, and a changed archive).
export function resetPreviousNightNotes() {
  kept.clear();
}

// `date`: the civil date of the night (YYYY-MM-DD). `place`: the plan's
// `location` as the history keeps it (`id`, `latitude`, `longitude`).
// `history`: the month reader (test seam). Returns the note (0 to 100) of that
// night worked out from the measured weather, or `null` offline, without data
// or without coordinates. An answer is kept per (date, place); a `null` is
// not, since the archive may be there next time.
export async function previousNightNote(
  date,
  place,
  { history = requestAstronomyWeatherHistory } = {},
) {
  const latitude = Number(place?.latitude);
  const longitude = Number(place?.longitude);
  if (
    typeof date !== "string" ||
    date.length < 7 ||
    String(place?.latitude ?? "").trim() === "" ||
    String(place?.longitude ?? "").trim() === "" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  )
    return null;
  const key = JSON.stringify([date, place.id ?? null, latitude, longitude]);
  if (kept.has(key)) return kept.get(key);
  try {
    const payload = await history({ latitude, longitude }, date.slice(0, 7));
    const score = conditionsNightSummary(
      date,
      { ...place, latitude, longitude },
      payload,
      true,
    )?.score;
    if (!Number.isFinite(score)) return null;
    const note = Math.min(100, Math.max(0, Math.round(score)));
    if (kept.size > 400) kept.clear();
    kept.set(key, note);
    return note;
  } catch {
    return null;
  }
}
