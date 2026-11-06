/**
 * One writing per notion: a duration, a clock time, the running
 * counter and the score on 100. Every screen writes these four notions
 * through these functions (pinned by the conformance fixtures
 * `duration-text`, `clock-text`, `counter-text` and `score-on-100`).
 */

import { copyFor, matchDeviceLocale } from "astro-contracts/locales";

/**
 * The shipped locale of `locale` (`fr-FR` and `fr` read French, `pt` the
 * Brazilian forms, `zh` the simplified ones, `zh_Hant` the traditional
 * ones), by the locale registry.
 */
function shippedLocale(locale) {
  return matchDeviceLocale(String(locale || "").replaceAll("_", "-"));
}

// Every space inside a duration is a no-break space: a number never parts
// from its unit, and « 2 h 30 » never breaks across two lines (the
// glossaries of de, es, it, pt-BR and ru ask for it between a number and
// its unit; French and English already wrote it so).
const NBSP = "\u00a0";

/**
 * Hours and minutes of each language: `hours` and `minutes` write one
 * part alone, `both` the two together.
 */
const SYMBOLS = {
  hours: (h) => `${h}${NBSP}h`,
  minutes: (m) => `${m}${NBSP}min`,
  both: (h, m) => `${h}${NBSP}h${NBSP}${m}${NBSP}min`,
};
const DURATION_UNITS = {
  fr: {
    ...SYMBOLS,
    // « 2 h 30 », « 2 h 05 »: after the hours, the minutes alone, on two
    // digits.
    both: (h, m) => `${h}${NBSP}h${NBSP}${String(m).padStart(2, "0")}`,
  },
  en: SYMBOLS,
  de: SYMBOLS,
  es: SYMBOLS,
  it: SYMBOLS,
  "pt-BR": SYMBOLS,
  ru: {
    hours: (h) => `${h}${NBSP}ч`,
    minutes: (m) => `${m}${NBSP}мин`,
    both: (h, m) => `${h}${NBSP}ч${NBSP}${m}${NBSP}мин`,
  },
  ja: {
    hours: (h) => `${h}時間`,
    minutes: (m) => `${m}分`,
    both: (h, m) => `${h}時間${m}分`,
  },
  "zh-Hans": {
    hours: (h) => `${h}小时`,
    minutes: (m) => `${m}分钟`,
    both: (h, m) => `${h}小时${m}分钟`,
  },
  "zh-Hant": {
    hours: (h) => `${h}小時`,
    minutes: (m) => `${m}分鐘`,
    both: (h, m) => `${h}小時${m}分鐘`,
  },
};

/**
 * The separator between a label and its value, « label : value »: French
 * writes a no-break space before the colon, the Japanese and the Chinese a
 * full-width colon with no space, the others a colon and a space. The
 * phone's catalogue holds the same tokens (`labelValueSeparator`).
 */
const LABEL_VALUE_SEPARATORS = {
  fr: `${NBSP}: `,
  en: ": ",
  de: ": ",
  es: ": ",
  it: ": ",
  "pt-BR": ": ",
  ru: ": ",
  ja: "：",
  "zh-Hans": "：",
  "zh-Hant": "：",
};

export function labelValueSeparator(locale) {
  return copyFor(
    LABEL_VALUE_SEPARATORS,
    shippedLocale(locale),
    "written-forms.LABEL_VALUE_SEPARATORS",
  );
}

/** « label : value » in the language of `locale`. */
export function labelValue(label, value, locale) {
  return `${label}${labelValueSeparator(locale)}${value}`;
}

function wholeMinutes(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Half up: 90 s is 2 min, 89 s is 1 min.
  return Math.floor(value + 0.5);
}

/**
 * A duration, from minutes (a fraction of a minute is rounded half up):
 * fr « 2 h 30 », « 2 h 05 », « 2 h », « 38 min », « 0 min »; en « 2 h 30 min »;
 * ja « 2時間40分 », « 3時間 », « 40分 » (never « 0時間… » nor « …時間0分 »).
 */
export function durationText(minutes, locale) {
  const total = wholeMinutes(minutes);
  const units = copyFor(
    DURATION_UNITS,
    shippedLocale(locale),
    "written-forms.DURATION_UNITS",
  );
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return units.minutes(rest);
  if (rest === 0) return units.hours(hours);
  return units.both(hours, rest);
}

const pad2 = (value) => String(value).padStart(2, "0");

function instantMilliseconds(instant) {
  if (instant instanceof Date) return instant.getTime();
  if (typeof instant === "number") return instant;
  if (typeof instant === "string" && instant.trim()) {
    return Date.parse(instant);
  }
  return Number.NaN;
}

/**
 * A clock time « HH:mm » on 24 hours (« 21:13 », « 01:10 »), in every
 * language. `zone` is the place's offset from UTC in minutes, or its IANA
 * time zone name; without one, the time is UTC (the caller then says
 * « UTC »). An instant that cannot be read gives « — ».
 */
export function clockText(instant, zone) {
  const epoch = instantMilliseconds(instant);
  if (!Number.isFinite(epoch)) return "—";
  if (typeof zone === "string" && zone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(epoch));
      const part = (type) =>
        Number(parts.find((entry) => entry.type === type)?.value);
      return `${pad2(part("hour") % 24)}:${pad2(part("minute"))}`;
    } catch {
      // An unknown zone name reads UTC, like a place without a zone.
    }
  }
  const offset =
    typeof zone === "number" && Number.isFinite(zone) ? Math.round(zone) : 0;
  const local = new Date(epoch + offset * 60_000);
  return `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}

/**
 * The running counter « H:MM:SS » with unpadded hours (« 3:57:00 »,
 * « 0:12:30 »): only for a span that ticks every second on screen. Whole
 * seconds elapsed; a negative span reads « 0:00:00 ».
 */
export function counterText(seconds) {
  const value = Number(seconds);
  const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${pad2(minutes)}:${pad2(total % 60)}`;
}

/**
 * The score shown, always on 100: 100 × total ÷ max of the rated
 * criteria, rounded half up (74 of 90 is 82). `null` when nothing was
 * rated.
 */
export function scoreOn100(score) {
  const total = Number(score?.total);
  const max = Number(score?.max);
  if (!Number.isFinite(total) || !Number.isFinite(max) || max <= 0) {
    return null;
  }
  // Half up without the float drift of 100 × total ÷ max + 0.5.
  return Math.floor((200 * total + max) / (2 * max));
}
