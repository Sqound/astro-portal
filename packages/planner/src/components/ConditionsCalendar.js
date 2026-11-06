"use client";

// The calendar with the forecast band on the web: the date popover of the
// planner and "Conditions à {lieu}" share it. A sliding month from two days
// before today, Monday to Sunday; per date the day, the Moon, the weather glyph
// and the night's note, its digit in its level's tint. The forecast's sixteen
// days are one continuous band (classes `is-band`, `is-band-start`,
// `is-band-end`), hatched from the eleventh day (`is-trend`, "~58") with the
// "10 jours" marker; past nights have a dotted violet edge (`is-past`); after
// the band the Moon alone (`is-beyond`). Every difference is a pattern or a
// shape as well as a hue (red mode). The header keeps a reserved slot for the
// back-to-today icon: nothing moves when it appears.
import { lunarPhaseForDate, lunarPhasePath } from "astro-core/lunar-phase.js";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "portal/planner/flow-messages.js";
import {
  plannerDateAfterDays,
  plannerWeatherGlyph,
} from "portal/planner/calendar.js";
import { conditionsPastChoosableNights } from "../conditions-calendar.js";
import { BrandLoader } from "portal/components/BrandLoader.js";

const fill = (template, values) =>
  Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );

/** "12 oct.", a short date in the reader's language ("12 oct. 2025"
 * `withYear`). */
export function conditionsShortDate(date, locale, withYear = false) {
  return new Intl.DateTimeFormat(locale, {
    ...(withYear ? { year: "numeric" } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function fullDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function weekdays(locale) {
  return Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1 + offset))),
  );
}

const levelOf = (score) =>
  score >= 82
    ? "excellent"
    : score >= 64
      ? "favourable"
      : score >= 42
        ? "variable"
        : "poor";

/** "Chargement de l’historique d’août…" (French elides "de"). */
export function conditionsHistoryLine(locale, month) {
  const name = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));
  const elided = /^[aeiouyàâéèêîôû]/i.test(name);
  return fill(
    message(
      locale,
      elided ? "conditionsHistoryLoadingElided" : "conditionsHistoryLoading",
    ),
    { month: name },
  );
}

function Moon({ date, latitude }) {
  const phase = lunarPhaseForDate(date);
  if (!phase) return <span className="conditions-calendar-moon" />;
  return (
    <svg
      className="conditions-calendar-moon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" className="planner-calendar-moon-dark" />
      <path
        d={lunarPhasePath(phase.phaseDegrees)}
        className="planner-calendar-moon-light"
        transform={
          Number(latitude) < 0 ? "translate(24 0) scale(-1 1)" : undefined
        }
      />
      <circle cx="12" cy="12" r="9" className="planner-calendar-moon-outline" />
    </svg>
  );
}

/**
 * The calendar's four entries — the forecast, the trend, the Moon and the sky
 * alone, the nights computed afterwards — each with its drawing. Under the
 * calendar of the plans' date popover; on "Conditions à {lieu}" it lives in
 * the ⓘ dialog of the page, not above the grid.
 */
export function ConditionsLegend({ locale }) {
  return (
    <p className="conditions-calendar-legend">
      <span className="is-forecast">
        {message(locale, "conditionsLegendForecast")}
      </span>
      <span className="is-trend">
        {message(locale, "conditionsLegendTrend")}
      </span>
      <span className="is-beyond">
        {message(locale, "conditionsLegendMoonOnly")}
      </span>
      <span className="is-past">{message(locale, "conditionsLegendPast")}</span>
    </p>
  );
}

/** The state told once above the grid. */
export function ConditionsCalendarState({ calendar, locale, onRetry }) {
  const inBand = Object.values(calendar.cells).some(
    (cell) => cell.kind === "forecast" || cell.kind === "trend",
  );
  if (calendar.state === "offline")
    return (
      <div className="conditions-calendar-offline" role="status">
        <strong>{message(locale, "conditionsOfflineTitle")}</strong>
        <p>{message(locale, "conditionsOfflineBody")}</p>
      </div>
    );
  if (calendar.state === "loading" && inBand)
    return (
      <p className="conditions-calendar-state is-loading" role="status">
        <BrandLoader size={18} />
        <span>{message(locale, "plannerCalendarOutlookLoading")}</span>
      </p>
    );
  if (calendar.loadingMonth)
    return (
      <p className="conditions-calendar-state is-loading" role="status">
        <BrandLoader size={18} />
        <span>{conditionsHistoryLine(locale, calendar.loadingMonth)}</span>
      </p>
    );
  const retry = onRetry ? (
    <button className="btn-link" type="button" onClick={onRetry}>
      {flow(locale, "retry")}
    </button>
  ) : null;
  if (calendar.state === "unavailable" && inBand)
    return (
      <p className="conditions-calendar-state is-unavailable">
        <span>{message(locale, "plannerCalendarOutlookUnavailable")}</span>
        {retry}
      </p>
    );
  if (calendar.failedMonths.length)
    return (
      <p className="conditions-calendar-state is-unavailable">
        <span>{message(locale, "conditionsHistoryFailed")}</span>
        {retry}
      </p>
    );
  if (calendar.stale && calendar.bandVisible)
    return (
      <p className="conditions-calendar-state">
        {flow(locale, "weatherCached")}
      </p>
    );
  return null;
}

/**
 * `mode`: `conditions` (every date opens its note), `single` (a date is
 * chosen, a past night too — to declare a night already done — but no further
 * back than `conditionsPastChoosableNights`; older days are seen), `multiple`
 * (dates are declared available, `ticked`). `weekOf`: the pinned week alone.
 */
export function ConditionsCalendar({
  calendar,
  locale,
  mode = "conditions",
  latitude = null,
  selected = null,
  ticked = [],
  onDate = null,
  onShift = () => {},
  onToday = () => {},
  onRetry = null,
  showTodayIcon = false,
  weekOf = null,
  legend = true,
}) {
  const weeks = calendar.window.weeks;
  const rows = weekOf ? weeks.filter((week) => week.includes(weekOf)) : weeks;
  const hatchStart = calendar.bandVisible
    ? (() => {
        const [year, month, day] = calendar.reliableUntil
          .split("-")
          .map(Number);
        return new Date(Date.UTC(year, month - 1, day + 1))
          .toISOString()
          .slice(0, 10);
      })()
    : null;
  const tickedSet = new Set(ticked);
  // A window outside today's year names its year.
  const otherYear =
    calendar.window.firstDate.slice(0, 4) !== calendar.today.slice(0, 4) ||
    calendar.window.lastDate.slice(0, 4) !== calendar.today.slice(0, 4);
  return (
    <div className="conditions-calendar" data-conditions-calendar={mode}>
      {weekOf ? null : (
        <>
          <div className="conditions-calendar-header">
            <button
              type="button"
              className="conditions-calendar-chevron"
              aria-label={message(locale, "plannerCalendarPrevious")}
              onClick={() => onShift(-1)}
            >
              ‹
            </button>
            <strong className="conditions-calendar-range">
              {conditionsShortDate(
                calendar.window.firstDate,
                locale,
                otherYear,
              )}{" "}
              –{" "}
              {conditionsShortDate(calendar.window.lastDate, locale, otherYear)}
            </strong>
            {/* A reserved slot; the icon appears in it. */}
            <span className="conditions-calendar-today-slot">
              {showTodayIcon ? (
                <button
                  type="button"
                  className="conditions-calendar-today"
                  aria-label={message(locale, "conditionsBackToToday")}
                  title={message(locale, "conditionsBackToToday")}
                  onClick={onToday}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="5" width="16" height="15" rx="2" />
                    <path d="M4 10h16M8 3v4M16 3v4" />
                    <circle cx="12" cy="15" r="1.6" />
                  </svg>
                </button>
              ) : null}
            </span>
            <button
              type="button"
              className="conditions-calendar-chevron"
              aria-label={message(locale, "plannerCalendarNext")}
              onClick={() => onShift(1)}
            >
              ›
            </button>
          </div>
          {legend ? <ConditionsLegend locale={locale} /> : null}
          <ConditionsCalendarState
            calendar={calendar}
            locale={locale}
            onRetry={onRetry}
          />
          <div className="conditions-calendar-weekdays" aria-hidden="true">
            {weekdays(locale).map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
        </>
      )}
      <div className="conditions-calendar-grid">
        {rows.flat().map((date, index) => {
          if (!date)
            return <span key={`blank-${index}`} className="is-blank" />;
          const cell = calendar.cells[date];
          const band =
            calendar.bandVisible &&
            (cell.kind === "forecast" || cell.kind === "trend");
          const beyond =
            cell.kind === "beyond" ||
            (!calendar.bandVisible &&
              (cell.kind === "forecast" || cell.kind === "trend"));
          const offline =
            calendar.state === "offline" &&
            (cell.kind === "forecast" || cell.kind === "trend");
          const choosable =
            Boolean(onDate) &&
            (mode === "conditions" ||
              cell.kind !== "past" ||
              (mode === "single" &&
                date >=
                  plannerDateAfterDays(
                    calendar.today,
                    -conditionsPastChoosableNights,
                  )));
          const classes = [
            "conditions-calendar-day",
            band ? "is-band" : "",
            band && date === calendar.today ? "is-band-start" : "",
            band && date === calendar.bandEnd ? "is-band-end" : "",
            band && cell.kind === "trend" ? "is-trend" : "",
            cell.kind === "past" ? "is-past" : "",
            beyond ? "is-beyond" : "",
            date === calendar.today ? "is-today" : "",
            date === selected ? "is-selected" : "",
            tickedSet.has(date) ? "is-ticked" : "",
            cell.score !== null ? `is-${levelOf(cell.score)}` : "",
          ]
            .filter(Boolean)
            .join(" ");
          const label = [
            date === calendar.today
              ? `${fullDate(date, locale)}, ${message(locale, "plannerCalendarToday")}`
              : fullDate(date, locale),
            cell.score !== null
              ? `${message(locale, "plannerCalendarScore")} ${cell.score}/100`
              : null,
            message(
              locale,
              cell.kind === "trend"
                ? "conditionsLegendTrend"
                : cell.kind === "past"
                  ? "conditionsLegendPast"
                  : cell.kind === "beyond"
                    ? "conditionsLegendMoonOnly"
                    : "conditionsLegendForecast",
            ),
          ]
            .filter(Boolean)
            .join(" · ");
          const day = Number(date.slice(8));
          const content = (
            <>
              <strong className="conditions-calendar-number">
                {day === 1 ? conditionsShortDate(date, locale) : day}
              </strong>
              <Moon date={date} latitude={latitude} />
              <i className="conditions-calendar-note" aria-hidden="true">
                {cell.pending ? (
                  <span className="conditions-calendar-pending" />
                ) : offline ? (
                  "—"
                ) : cell.score !== null ? (
                  <>
                    <b>{plannerWeatherGlyph(cell.weatherCode)}</b>
                    <span className="conditions-calendar-digit">
                      {cell.kind === "trend" ? `~${cell.score}` : cell.score}
                    </span>
                  </>
                ) : null}
              </i>
              {date === hatchStart ? (
                <span className="conditions-calendar-marker" aria-hidden="true">
                  {message(locale, "conditionsReliableMarker")}
                </span>
              ) : null}
            </>
          );
          return choosable ? (
            <button
              key={date}
              type="button"
              className={classes}
              data-date={date}
              aria-label={label}
              aria-pressed={
                mode === "multiple" ? tickedSet.has(date) : undefined
              }
              aria-current={date === selected ? "date" : undefined}
              title={label}
              onClick={() => onDate(date)}
            >
              {content}
            </button>
          ) : (
            <span
              key={date}
              className={classes}
              data-date={date}
              role="img"
              aria-label={label}
              title={label}
            >
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
