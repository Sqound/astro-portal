// The time left before a plan's night on the web: on the day, "commence dans
// 1 h 39" — to the start of the astronomical night of the plan's place —,
// and before it "dans 3 jours", "dans 27 jours", counted from the night
// the place is in (until its dawn, the night of the evening before). Nothing
// once the night has begun, nothing for a night that is over.
import { message } from "portal/i18n.js";
import { durationText } from "portal/written-forms.js";
import { planNightWindow } from "./planner.js";
import { tonightDate } from "./tonight-overview.js";

const minute = 60000;
const day = 86400000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const instant = (value) => {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dayNumber = (date) => Math.round(Date.parse(`${date}T12:00:00Z`) / day);

/**
 * `{ kind: "startsIn", minutes }` on the day before the night starts,
 * `{ kind: "started" }` once it has, `{ kind: "inDays", days }` for a later
 * night; `null` without a date or once the night is over. `now` is in epoch
 * milliseconds.
 */
export function planTimeLeft({
  date,
  location = null,
  darkness,
  now = Date.now(),
} = {}) {
  if (typeof date !== "string" || !datePattern.test(date)) return null;
  const lived = tonightDate({ now, place: location });
  if (date < lived) return null;
  if (date === lived) {
    let window = null;
    try {
      window = planNightWindow({ date, darkness }, location);
    } catch {
      window = null;
    }
    const start = instant(window?.darkStart);
    const end = instant(window?.darkEnd);
    if (end !== null && now > end) return null;
    if (start !== null && now < start)
      return { kind: "startsIn", minutes: Math.floor((start - now) / minute) };
    return { kind: "started" };
  }
  return {
    kind: "inDays",
    days: Math.max(1, dayNumber(date) - dayNumber(lived)),
  };
}

/**
 * Whether the night of a plan has not begun: a night to come — in some
 * days, tomorrow, or tonight before the astronomical night starts. `false`
 * for a night in progress, a night that is over and, because nothing says it
 * is ahead, a plan whose date cannot be read. The one rule of "Marquer comme
 * exécuté" and "abandonné" (offered once the night has begun, never for a
 * plan that is still ahead).
 */
export function planNightIsAhead({
  date,
  location = null,
  darkness,
  now = Date.now(),
} = {}) {
  const left = planTimeLeft({ date, location, darkness, now });
  return left !== null && left.kind !== "started";
}

/**
 * "commence dans 1 h 39", "dans 3 jours", "Dans 3 jours" when it opens
 * a line (`sentenceStart`); `null` when there is nothing to say.
 */
export function planTimeLeftText(
  locale,
  timeLeft,
  { sentenceStart = false } = {},
) {
  if (!timeLeft) return null;
  if (timeLeft.kind === "startsIn")
    return message(locale, "planTimeLeftStartsIn").replace(
      "{duration}",
      durationText(timeLeft.minutes, locale),
    );
  if (timeLeft.kind !== "inDays") return null;
  const key = `planTimeLeftInDays${sentenceStart ? "Start" : ""}${
    timeLeft.days === 1 ? "One" : ""
  }`;
  return message(locale, key).replace("{count}", String(timeLeft.days));
}

/**
 * The line that opens a card in "details": "Tonight · starts in
 * 1 h 39", "Tonight", "In 3 days".
 */
export function planTimeLeftHeadline(locale, timeLeft) {
  if (!timeLeft) return null;
  if (timeLeft.kind === "inDays")
    return planTimeLeftText(locale, timeLeft, { sentenceStart: true });
  const startsIn = planTimeLeftText(locale, timeLeft);
  return startsIn
    ? message(locale, "planTimeLeftTonightStartsIn").replace(
        "{timeLeft}",
        startsIn,
      )
    : message(locale, "planTimeLeftTonight");
}
