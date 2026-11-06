/**
 * The batches of stars the annotations come in. The selector of the viewer
 * (« Étoiles jusqu'à … mag ») does not filter one list: it asks the portal
 * for the batch of its threshold — 3.5, 5.5, 8.5, 10 mag or all the stars of
 * the catalogue in the field —, each with its own ceiling of stars (brightest
 * first), so that « Toutes » really holds more than « 10 ». Pure, shared by
 * the server (which cuts the batch) and the viewer (which asks for it).
 */

/** The `magnitude` that asks for every star of the catalogue in the field. */
export const ALL_STARS_MAGNITUDE = 99;

/**
 * The batches, faintest threshold last. `max` is the ceiling of the stars
 * (listed or not) one answer holds: a field of a few square degrees holds
 * tens of HYG stars at most, the ceilings only keep an all-sky field from
 * sending the catalogue.
 */
export const STAR_BATCHES = Object.freeze([
  { upTo: 3.5, max: 400 },
  { upTo: 5.5, max: 800 },
  { upTo: 8.5, max: 2000 },
  { upTo: 10, max: 4000 },
  { upTo: Infinity, max: 10000 },
]);

/** The faintest star listed when the caller names no limit. */
export const DEFAULT_ANNOTATION_MAGNITUDE = 10;

/**
 * A star fainter than this is named on the image only when it has a name of
 * its own (a proper name, a Bayer–Flamsteed designation); a star known by a
 * catalogue number alone, or by none, is a point without a label — a field
 * holds hundreds of them, a label each would hide the image.
 */
export const LABEL_MAGNITUDE_LIMIT = 8.5;

/** The faintest magnitude as a number, `fallback` when it names none. */
export function magnitudeLimit(value, fallback = DEFAULT_ANNOTATION_MAGNITUDE) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** The batch that holds the stars to `magnitude`. */
export function starBatchOf(magnitude) {
  const limit = magnitudeLimit(magnitude);
  return STAR_BATCHES.find((batch) => limit <= batch.upTo);
}

/**
 * The `magnitude` to ask for to read the stars to `magnitude`: the threshold
 * of its batch (`3.5`, `5.5`, `8.5`, `10`, or `99` for all the stars).
 */
export function starBatchMagnitude(magnitude) {
  const batch = starBatchOf(magnitude);
  return Number.isFinite(batch.upTo) ? batch.upTo : ALL_STARS_MAGNITUDE;
}

/** The address of the batch `batch` (a threshold) of the annotations at `url`. */
export function starBatchUrl(url, batch) {
  return `${url}${String(url).includes("?") ? "&" : "?"}magnitude=${batch}`;
}

/**
 * Which of the batches read (`readThresholds`, thresholds) the viewer draws
 * while it wants the one of `wanted`: that one, else the smallest read that
 * holds it, else the largest read (the one before, while the wanted one is
 * on its way); `undefined` while none is read.
 */
export function batchToDraw(readThresholds, wanted) {
  const read = [...readThresholds].sort((left, right) => left - right);
  return read.includes(wanted)
    ? wanted
    : (read.find((threshold) => threshold >= wanted) ?? read.at(-1));
}
