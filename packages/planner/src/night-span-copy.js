// The words of "Durée de la nuit" on the web: the span line, the forecast
// line and the timeline's description, from `nightSpanForecastSummary` and
// `planNightSpanSky`.
import { message } from "portal/i18n.js";
import { civilDateLabel } from "portal/planner/day-words.js";

// `{name}` placeholders of a message filled from `values`.
export function fillMessage(text, values = {}) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    name in values ? String(values[name]) : match,
  );
}

const say = (locale, key, values) => fillMessage(message(locale, key), values);

// "pas de pluie", "pluie faible après 03:00"…; `null` without rain
// amounts in the forecast.
export function nightSpanRainPhrase(locale, rain, clock) {
  if (!rain || typeof rain !== "object") return null;
  const level = { light: "Light", moderate: "Moderate", heavy: "Heavy" }[
    rain.level
  ];
  if (rain.level === "none") return say(locale, "plannerNightSpanNoRain");
  if (!level) return null;
  return rain.fromStart
    ? say(locale, `plannerNightSpanRain${level}FromStart`)
    : say(locale, `plannerNightSpanRain${level}After`, {
        time: clock(rain.from),
      });
}

// "Lune levée jusqu’à 21:05" and its variants.
export function nightSpanMoonPhrase(locale, summary, clock) {
  const periods = summary?.moon?.periods || [];
  const first = periods[0];
  const last = periods.at(-1);
  switch (summary?.moon?.kind) {
    case "all":
      return say(locale, "plannerNightSpanMoonAll");
    case "until":
      return say(locale, "plannerNightSpanMoonUntil", {
        time: clock(first.end),
      });
    case "from":
      return say(locale, "plannerNightSpanMoonFrom", {
        time: clock(last.start),
      });
    case "until-from":
      return say(locale, "plannerNightSpanMoonUntilFrom", {
        end: clock(first.end),
        start: clock(last.start),
      });
    case "between":
      return say(locale, "plannerNightSpanMoonBetween", {
        start: clock(first.start),
        end: clock(last.end),
      });
    default:
      return say(locale, "plannerNightSpanMoonNone");
  }
}

// "nuages 8 à 18 % · pas de pluie · Lune levée jusqu’à 21:05", or `null`
// without a forecast for the span.
export function nightSpanForecastParts(locale, summary, clock) {
  const forecast = summary?.forecast;
  if (!forecast) return null;
  const parts = [];
  if (
    typeof forecast.cloudMin === "number" &&
    typeof forecast.cloudMax === "number"
  )
    parts.push(
      forecast.cloudMin === forecast.cloudMax
        ? say(locale, "plannerNightSpanCloudsSingle", {
            value: Math.round(forecast.cloudMin),
          })
        : say(locale, "plannerNightSpanClouds", {
            min: Math.round(forecast.cloudMin),
            max: Math.round(forecast.cloudMax),
          }),
    );
  const rain = nightSpanRainPhrase(locale, forecast.rain, clock);
  if (rain) parts.push(rain);
  parts.push(nightSpanMoonPhrase(locale, summary, clock));
  return parts.join(" · ");
}

const frMonths = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const enMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ruMonths = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// "14" and "15 octobre" for "Nuit du 14 au 15 octobre".
export function nightSpanNightDates(date, locale) {
  const first = new Date(`${date}T12:00:00Z`);
  const second = new Date(first.getTime() + 86400000);
  const day = (value) => value.getUTCDate();
  const month = (value) => value.getUTCMonth();
  const sameMonth = month(first) === month(second);
  // German, Spanish, Italian, Portuguese: the day words of
  // `portal/planner/day-words.js` ("14." and "15. Oktober", "14" and
  // "15 de octubre", "31 ottobre" and "1º novembre").
  const from = civilDateLabel(locale, first, { month: !sameMonth });
  if (from !== null) return { from, to: civilDateLabel(locale, second) };
  if (locale === "fr")
    return {
      from: sameMonth
        ? `${day(first)}`
        : `${day(first)} ${frMonths[month(first)]}`,
      to: `${day(second)} ${frMonths[month(second)]}`,
    };
  if (locale === "ja" || locale === "zh-Hans" || locale === "zh-Hant")
    return {
      from: `${month(first) + 1}月${day(first)}日`,
      to: sameMonth
        ? `${day(second)}日`
        : `${month(second) + 1}月${day(second)}日`,
    };
  // "Ночь с 14 на 15 октября": the month once, in the genitive.
  if (locale === "ru")
    return {
      from: sameMonth
        ? `${day(first)}`
        : `${day(first)} ${ruMonths[month(first)]}`,
      to: `${day(second)} ${ruMonths[month(second)]}`,
    };
  return {
    from: `${enMonths[month(first)]} ${day(first)}`,
    to: sameMonth
      ? `${day(second)}`
      : `${enMonths[month(second)]} ${day(second)}`,
  };
}

const sentence = (phrase) =>
  phrase ? `${phrase[0].toUpperCase()}${phrase.slice(1)}.` : phrase;

// What the timeline says to a screen reader.
export function nightSpanChartDescription({
  locale,
  sky,
  summary,
  custom,
  date,
  clock,
}) {
  const dates = nightSpanNightDates(date, locale);
  const sentences = [
    say(locale, "plannerNightSpanChartNight", {
      from: dates.from,
      to: dates.to,
      start: clock(sky.scaleStart),
      end: clock(sky.scaleEnd),
    }),
    say(
      locale,
      custom ? "plannerNightSpanChartDark" : "plannerNightSpanChartWholeDark",
      { start: clock(sky.darkStart), end: clock(sky.darkEnd) },
    ),
  ];
  const forecast = summary?.forecast;
  if (forecast) {
    if (
      typeof forecast.cloudMin === "number" &&
      typeof forecast.cloudMax === "number"
    )
      sentences.push(
        say(locale, "plannerNightSpanChartClouds", {
          min: Math.round(forecast.cloudMin),
          max: Math.round(forecast.cloudMax),
        }),
      );
    const rain = nightSpanRainPhrase(locale, forecast.rain, clock);
    if (rain) sentences.push(sentence(rain));
  }
  sentences.push(sentence(nightSpanMoonPhrase(locale, summary, clock)));
  if (!forecast) sentences.push(say(locale, "plannerNightSpanChartNoForecast"));
  if (custom)
    sentences.push(
      say(locale, "plannerNightSpanChartChosen", {
        start: clock(summary?.start),
        end: clock(summary?.end),
      }),
    );
  return sentences.join(" ");
}
