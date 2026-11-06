import { bortleFromSqm } from "./sky-quality.js";

// The sky background a place shows, and where it comes from: the value the
// observer's own poses gave (measured by Astro Sync, read through
// `GET /v1/place-sky-measures`), else the value they typed in the place's
// form (`skyEntered`), else the model's estimate (`GET /v1/sky-quality`).
// The two values not chosen are answered too: the information sheet shows all three side by side.

// The range of a typed value, in mag/arcsec²: a hand-held meter reads about
// 16 under a city's sky and about 22 under the darkest natural one; a value
// outside this is a typing slip, not a sky.
export const skyEnteredRange = Object.freeze({
  min: 14,
  max: 22.5,
  step: 0.01,
});

// The range of a measured value as the service accepts it (the measure
// route's own bounds).
const measuredRange = Object.freeze({ min: 10, max: 25 });

const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const hundredths = (value) => Math.round(value * 100) / 100;
const nightPattern = /^\d{4}-\d{2}-\d{2}$/;
// The fraction of a second runs from 1 to 9 digits: clients write
// microseconds or milliseconds.
const instantPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const instant = (value) =>
  typeof value === "string" &&
  instantPattern.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : null;

const instantTime = (value) =>
  instant(value) === null ? -Infinity : Date.parse(value);

// The value a person typed for a place (additive field of the place
// document): `{ sqm, enteredAt }`, `sqm` a number inside `skyEnteredRange`
// kept to the hundredth, `enteredAt` an instant. Anything else is not a
// value, and the place simply has none.
export function normalizeSkyEntered(value) {
  if (!plain(value) || !finite(value.sqm)) return null;
  if (value.sqm < skyEnteredRange.min || value.sqm > skyEnteredRange.max)
    return null;
  const enteredAt = instant(value.enteredAt);
  if (enteredAt === null) return null;
  return { sqm: hundredths(value.sqm), enteredAt };
}

// A typed value read from a form field: « 21,35 » or « 21.35 », trimmed.
// Answers `{ sqm }` (empty field: `sqm` null, no value), or
// `{ error: "range" }` when the text is not a number inside the range.
export function parseSkyEnteredInput(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return { sqm: null };
  if (!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(trimmed)) return { error: "range" };
  const sqm = Number(trimmed.replace(",", "."));
  if (
    !Number.isFinite(sqm) ||
    sqm < skyEnteredRange.min ||
    sqm > skyEnteredRange.max
  )
    return { error: "range" };
  return { sqm: hundredths(sqm) };
}

// The place's `skyEntered` from the form's field [text]: `{ error: "range" }`
// for a slip; `{ skyEntered: null }` for an empty field (the value is
// removed); the [kept] value as it was (its date with it) when the number did
// not change; else a new value dated [enteredAt].
export function skyEnteredFromInput(text, kept, enteredAt) {
  const typed = parseSkyEnteredInput(text);
  if (typed.error) return typed;
  if (typed.sqm === null) return { skyEntered: null };
  const previous = normalizeSkyEntered(kept);
  if (previous && previous.sqm === typed.sqm) return { skyEntered: previous };
  return { skyEntered: { sqm: typed.sqm, enteredAt } };
}

// The measured nights of one place in the read route's answer
// (`{ places: [{ placeId, measures }] }`), or an empty list.
export function placeSkyMeasures(list, placeId) {
  if (!plain(list) || !Array.isArray(list.places) || !placeId) return [];
  const entry = list.places.find(
    (place) => plain(place) && place.placeId === String(placeId),
  );
  return entry && Array.isArray(entry.measures) ? entry.measures : [];
}

function usableMeasure(value) {
  return (
    plain(value) &&
    typeof value.night === "string" &&
    nightPattern.test(value.night) &&
    finite(value.sqm) &&
    value.sqm >= measuredRange.min &&
    value.sqm <= measuredRange.max &&
    Number.isInteger(value.poseCount) &&
    value.poseCount >= 1
  );
}

function latestMeasure(measures) {
  const usable = Array.isArray(measures) ? measures.filter(usableMeasure) : [];
  if (!usable.length) return null;
  const latest = usable.reduce((best, entry) => {
    if (entry.night !== best.night)
      return entry.night > best.night ? entry : best;
    return instantTime(entry.observedAt) > instantTime(best.observedAt)
      ? entry
      : best;
  });
  const sqm = hundredths(latest.sqm);
  return {
    sqm,
    bortleClass: bortleFromSqm(sqm),
    night: latest.night,
    poseCount: latest.poseCount,
    observedAt: instant(latest.observedAt),
    methodVersion:
      typeof latest.methodVersion === "string" ? latest.methodVersion : null,
    nightCount: new Set(usable.map((entry) => entry.night)).size,
  };
}

function modelValue(value) {
  if (!plain(value)) return null;
  const sqm = finite(value.sqm) ? value.sqm : null;
  const bortle =
    Number.isInteger(value.bortleClass) &&
    value.bortleClass >= 1 &&
    value.bortleClass <= 9
      ? value.bortleClass
      : sqm === null
        ? null
        : bortleFromSqm(sqm);
  if (bortle === null) return null;
  return { sqm, bortleClass: bortle };
}

/**
 * Rule: measured (the latest night at the place) > entered > model.
 *
 * `measures` are the place's measured nights (`placeSkyMeasures`), `entered`
 * the place's `skyEntered`, `model` the modelled estimate
 * (`{ bortleClass, sqm }`). Answers `{ source, shown, measured, entered,
 * model }`: `source` is `"measured"`, `"entered"`, `"model"` or `null` when
 * nothing is known; `shown` is `{ sqm, bortleClass }` of the chosen value;
 * the three others are each kind's value, or `null`.
 */
export function skyBrightnessSource({ measures, entered, model } = {}) {
  const measured = latestMeasure(measures);
  const typed = normalizeSkyEntered(entered);
  const enteredValue = typed
    ? { ...typed, bortleClass: bortleFromSqm(typed.sqm) }
    : null;
  const modelled = modelValue(model);
  const [source, chosen] = measured
    ? ["measured", measured]
    : enteredValue
      ? ["entered", enteredValue]
      : modelled
        ? ["model", modelled]
        : [null, null];
  return {
    source,
    shown: chosen ? { sqm: chosen.sqm, bortleClass: chosen.bortleClass } : null,
    measured,
    entered: enteredValue,
    model: modelled,
  };
}
