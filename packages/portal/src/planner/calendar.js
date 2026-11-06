// Civil-calendar arithmetic for the planner's date picker and its ten-day
// outlook. Every date is a `YYYY-MM-DD` civil day, resolved in UTC so the
// grid never shifts with the reader's own offset.

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function plannerDateParts(value) {
  const [year, month, day] = String(value || "")
    .split("-")
    .map(Number);
  return { year, month, day };
}

export function plannerDateAfterDays(value, days) {
  const { year, month, day } = plannerDateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days)));
  return isoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

// Monday-first grid: `firstWeekday` is the number of blank cells before the
// first of the month.
export function plannerCalendarMonth(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    return null;
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    firstWeekday,
    dayCount,
    days: Array.from({ length: dayCount }, (_, index) =>
      isoDate(year, month, index + 1),
    ),
  };
}

export function plannerCalendarShift(value, offset) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  const next = new Date(Date.UTC(year, month - 1 + Number(offset), 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
}

// The outlook window the shared weather request covers, starting today.
export function plannerOutlookDates(startDate, count = 10) {
  const length = Number.isInteger(count) && count > 0 ? count : 10;
  const { year, month, day } = plannerDateParts(startDate);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  )
    return [];
  return Array.from({ length }, (_, index) =>
    plannerDateAfterDays(startDate, index),
  );
}

// The same civil day `months` months later, its day clamped to the length
// of the month it lands in (31 January + 1 month → 28 or 29 February).
function plannerDateAfterMonths(value, months) {
  const { year, month, day } = plannerDateParts(value);
  const first = new Date(Date.UTC(year, month - 1 + Number(months), 1));
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return isoDate(
    first.getUTCFullYear(),
    first.getUTCMonth() + 1,
    Math.min(day, length),
  );
}

// Monday = 0 … Sunday = 6.
const weekdayOf = (date) => {
  const { year, month, day } = plannerDateParts(date);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
};

/**
 * The calendar's window:
 * a sliding month that starts two days before `today` (the place's night,
 * `YYYY-MM-DD`), moved by `offset` whole months (negative: into the past).
 * The window runs from `firstDate` to the day before the same date a month
 * later; `weeks` are the rows of the grid, Monday to Sunday, a date or
 * `null` for a cell outside the window; `monthStarts` the window's dates
 * that are the first of a month (their cell reads « 1 nov. »); `months` the
 * civil months the window touches (`YYYY-MM`, the history loads one at a
 * time); `containsToday` whether `today` is inside. `null` for an invalid
 * date.
 */
export function plannerCalendarWindow(today, offset = 0) {
  const { year, month, day } = plannerDateParts(today);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  )
    return null;
  const shift = Number.isInteger(offset) ? offset : 0;
  const anchor = plannerDateAfterDays(today, -2);
  const firstDate = plannerDateAfterMonths(anchor, shift);
  const lastDate = plannerDateAfterDays(
    plannerDateAfterMonths(anchor, shift + 1),
    -1,
  );
  const weeks = [];
  let cursor = plannerDateAfterDays(firstDate, -weekdayOf(firstDate));
  while (cursor <= lastDate) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      week.push(cursor >= firstDate && cursor <= lastDate ? cursor : null);
      cursor = plannerDateAfterDays(cursor, 1);
    }
    weeks.push(week);
  }
  const dates = weeks.flat().filter((date) => date !== null);
  return {
    today,
    offset: shift,
    firstDate,
    lastDate,
    weeks,
    monthStarts: dates.filter((date) => date.endsWith("-01")),
    months: [...new Set(dates.map((date) => date.slice(0, 7)))],
    containsToday: today >= firstDate && today <= lastDate,
  };
}

// WMO weather code → the single glyph a calendar cell can hold.
export function plannerWeatherGlyph(code) {
  if (!Number.isFinite(code)) return "·";
  if (code === 0) return "☀";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁";
  if (code === 45 || code === 48) return "≋";
  if (code <= 67 || code >= 80) return "☂";
  if (code <= 77) return "❄";
  if (code <= 82) return "☂";
  return "ϟ";
}
