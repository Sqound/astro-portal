// Additive: the passages a person declares for a target at
// the debriefing or in « Remanier » — one at a time, in the order of the
// night (`debrief.schema.json`, `session-rework.schema.json`,
// `$defs.declaredPassage`). The first start and the last end are the
// target's `startedAt` / `finishedAt`; its acquired time is the sum of its
// passages.

export const MAX_DECLARED_PASSAGES = 50;

const isTimestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/**
 * `value` as declared passages, sorted, or an error thrown by `fail(message)`:
 * 1 to 50 `{ start, end }` with `end` after `start`, none overlapping
 * another (two that touch are one passage: the client joins them).
 */
export function validatedPassages(value, label, fail) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_DECLARED_PASSAGES
  )
    throw fail(
      `${label} must be a list of 1 to ${MAX_DECLARED_PASSAGES} passages.`,
    );
  const passages = value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw fail(`${label}[${index}] must be an object.`);
    const unknown = Object.keys(entry).find(
      (key) => key !== "start" && key !== "end",
    );
    if (unknown)
      throw fail(`${label}[${index}] has an unexpected property "${unknown}".`);
    if (!isTimestamp(entry.start) || !isTimestamp(entry.end))
      throw fail(
        `${label}[${index}].start and .end must be ISO 8601 date-times.`,
      );
    if (Date.parse(entry.end) <= Date.parse(entry.start))
      throw fail(`${label}[${index}].end must be after its start.`);
    return { start: entry.start, end: entry.end };
  });
  passages.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (let index = 1; index < passages.length; index += 1)
    if (Date.parse(passages[index].start) < Date.parse(passages[index - 1].end))
      throw fail(`${label} must not hold two passages that overlap.`);
  return passages;
}

/** The passages read back from storage, or `null` when none is valid. */
export function storedPassages(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const passages = value.filter(
    (entry) =>
      entry &&
      isTimestamp(entry.start) &&
      isTimestamp(entry.end) &&
      Date.parse(entry.end) > Date.parse(entry.start),
  );
  return passages.length
    ? passages
        .map((entry) => ({ start: entry.start, end: entry.end }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    : null;
}

/** The seconds the passages cover. */
export function passagesSeconds(passages) {
  return Math.round(
    passages.reduce(
      (sum, passage) =>
        sum + (Date.parse(passage.end) - Date.parse(passage.start)),
      0,
    ) / 1000,
  );
}
