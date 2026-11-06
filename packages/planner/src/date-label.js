/**
 * The planner's calendar dates (`YYYY-MM-DD`, a night's date, a plan's date)
 * and how a page writes them.
 *
 * A date the page cannot read must never stop the page: the import
 * of an export into a private portal writes the
 * planner's document with no date at all (« the planner chooses it when it
 * opens »), and `new Intl.DateTimeFormat(…).format(new Date("nullT12:00:00Z"))`
 * threw `RangeError: Invalid time value` while the page rendered -- « This
 * page couldn’t load », every request answered 200. A date of the document
 * that is not a real day falls back to the day the planner would have opened
 * on; a label for a date that is not a real day is empty.
 */

/** Is `value` a real calendar day written `YYYY-MM-DD`? */
export function isPlannerDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const day = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value
  );
}

/**
 * The date a saved document opens on: its own when it is a real day, else
 * `fallback` (tonight's, from the page's defaults). The spread of a document
 * over the defaults keeps a `null` or a stray string, so this is applied after.
 */
export function savedPlannerDate(value, fallback) {
  return isPlannerDate(value) ? value : fallback;
}

/** « Wednesday, October 21, 2026 » for a planner date; empty for one that is not a day. */
export function dateLabel(value, locale) {
  if (!isPlannerDate(value)) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
