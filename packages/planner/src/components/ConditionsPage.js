"use client";

// [COND] "Conditions à {lieu}" on the web (the same page in v1, from the
// place's detail). The calendar with the forecast band; a touched date takes the gold
// frame and the note's detail (the body of [NOTE], `ScoreSheetBody`, not a
// copy) appears under the calendar, the page scrolling softly to it (instant
// with `prefers-reduced-motion`, by CSS). Once the calendar has scrolled
// away, the chosen date's week stays pinned at the top (a zero-height
// `position: sticky` holder: nothing moves when it shows) with "Calendrier"
// to go back to the grid. Past nights can be held back by a profile: without the
// right, the Moon alone and, where a shell registered offers, the way to them. The best period of the year opens the page (`ConditionsTrendCard.js`).
import { useEffect, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { nightVerdict } from "portal/night-verdict.js";
import { lunarPhaseForDate } from "astro-core/lunar-phase.js";
import { InfoLine } from "portal/components/dialog/InfoButton.js";
import {
  ConditionsCalendar,
  ConditionsLegend,
  conditionsShortDate,
} from "./ConditionsCalendar.js";
import { offersCopy } from "../offers-slot.js";
import { ConditionsTrend } from "./ConditionsTrendCard.js";
import { ScoreSheetBody, ScoreSheetTitle } from "./NightDetailParts.js";
import { useConditionsCalendar } from "./useConditionsCalendar.js";
import {
  conditionsDayKind,
  conditionsNight,
  conditionsNightHours,
  conditionsNightSummary,
  conditionsOffsetFor,
} from "../conditions-calendar.js";
import { forecastMoonOfNight } from "../planner.js";
import { moonUpIntervals } from "../tonight-overview.js";
import { tonightScoreSheetWords } from "../tonight-words.js";
import { clock, fill } from "../wind-section.js";

const fullDate = (date, locale) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** The sheet of [NOTE] for `date` at `place` from `payload`, or `null`. */
export function conditionsSheet({
  date,
  place,
  payload,
  measured,
  locale,
  updated = null,
}) {
  const summary = conditionsNightSummary(date, place, payload, measured);
  const night = conditionsNight(date, place);
  if (!summary || !night) return null;
  const hours = conditionsNightHours(date, place, payload, measured);
  const verdict = nightVerdict({
    forecast: summary,
    night: { start: night.start, end: night.end },
    moon: {
      illumination: forecastMoonOfNight(night)?.illumination ?? null,
      up: moonUpIntervals(night.moonSeries),
    },
    clouds: hours,
  });
  const at = (value) =>
    value ? clock(value, locale, place?.timeZone || "UTC") : "—";
  return tonightScoreSheetWords(verdict, { locale, at, hours, updated });
}

// When the hours were forecast, under "Heure par heure" ("Mis à jour à
// 06:51"; an estimate when the service gave its kept copy).
function forecastUpdated(payload, place, locale) {
  const fetchedAt = payload?.fetchedAt;
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return null;
  return fill(
    message(
      locale,
      payload.stale === true
        ? "plannerForecastEstimateFrom"
        : "plannerForecastRefreshedAt",
    ),
    { time: clock(fetchedAt, locale, place?.timeZone || "UTC") },
  );
}

function MoonOnly({ date, locale, line }) {
  const phase = lunarPhaseForDate(date);
  return (
    <div className="conditions-moon-only" data-testid="conditions-moon-only">
      <strong>{fullDate(date, locale)}</strong>
      {phase ? (
        <p>
          {message(locale, "plannerMoon")} {phase.illumination}%
        </p>
      ) : null}
      <p className="conditions-muted">{line}</p>
    </div>
  );
}

export function ConditionsNightDetail({
  date,
  place,
  locale,
  calendar,
  forecast,
  history,
  offersHref = null,
}) {
  const kind = conditionsDayKind(date, calendar.today);
  if (kind === "past") {
    if (!calendar.cells[date] || calendar.cells[date].locked)
      return (
        <div
          className="conditions-past-locked"
          data-testid="conditions-past-locked"
        >
          <p>
            {offersCopy(locale, "conditionsPastLocked") ||
              message(locale, "conditionsPastLocked")}
          </p>
          {offersHref && offersCopy(locale, "conditionsSeeOffer") ? (
            <a className="btn-secondary" href={offersHref}>
              {offersCopy(locale, "conditionsSeeOffer")}
            </a>
          ) : null}
        </div>
      );
    const read = history[date.slice(0, 7)];
    const sheet =
      read?.status === "ready"
        ? conditionsSheet({
            date,
            place,
            payload: read.payload,
            measured: true,
            locale,
            // A past night's hours were measured.
            updated: message(locale, "conditionsHourlyMeasured"),
          })
        : null;
    return (
      <>
        <div
          className="conditions-past-notice"
          data-testid="conditions-past-notice"
        >
          <strong>{message(locale, "conditionsPastNotice")}</strong>
          <p>{message(locale, "conditionsPastNoticeDetail")}</p>
        </div>
        {sheet ? (
          <>
            <h2 className="conditions-note-title">
              <ScoreSheetTitle sheet={sheet} />
            </h2>
            <ScoreSheetBody
              sheet={sheet}
              locale={locale}
              measured={message(locale, "conditionsMeasuredHow")}
            />
          </>
        ) : (
          <MoonOnly
            date={date}
            locale={locale}
            line={message(locale, "conditionsHistoryFailed")}
          />
        )}
      </>
    );
  }
  if (kind === "beyond")
    return (
      <MoonOnly
        date={date}
        locale={locale}
        line={message(locale, "conditionsLegendMoonOnly")}
      />
    );
  const sheet =
    forecast.status === "ready"
      ? conditionsSheet({
          date,
          place,
          payload: forecast.payload,
          locale,
          updated: forecastUpdated(forecast.payload, place, locale),
        })
      : null;
  if (!sheet)
    return (
      <MoonOnly
        date={date}
        locale={locale}
        line={
          forecast.status === "offline"
            ? message(locale, "conditionsOfflineBody")
            : message(locale, "tonightVerdictUnavailable")
        }
      />
    );
  return (
    <>
      {kind === "trend" ? (
        <p
          className="conditions-trend-notice"
          data-testid="conditions-trend-notice"
        >
          {message(locale, "conditionsTrendNotice")}
        </p>
      ) : null}
      <h2 className="conditions-note-title">
        <ScoreSheetTitle sheet={sheet} />
      </h2>
      <ScoreSheetBody sheet={sheet} locale={locale} />
    </>
  );
}

/** The step of spacing between the pinned week and the note, 16 px. */
export const CONDITIONS_NOTE_GAP_PX = 16;

export function ConditionsPage({
  locale,
  place,
  date = null,
  pastAllowed = false,
  offersHref = null,
  onBack,
}) {
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(date);
  const [offset, setOffset] = useState(null);
  const { calendar, today, forecast, history, retryHistory } =
    useConditionsCalendar({
      place,
      offset: offset ?? 0,
      pastAllowed,
      retry,
    });
  useEffect(() => {
    setOffset(date ? conditionsOffsetFor(date, today) : 0);
  }, [date, today]);
  const noteRef = useRef(null);
  const calendarRef = useRef(null);
  const pinnedRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!selected) return undefined;
    const update = () => {
      const box = calendarRef.current?.getBoundingClientRect();
      setPinned(Boolean(box && box.bottom < 0));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [selected]);
  const touch = (value) => {
    setSelected(value);
    // The soft scroll to the note (CSS `scroll-behavior`, none with
    // `prefers-reduced-motion`).: the note stops one step of spacing under
    // the pinned week, not against it — the margin is the pinned week's own
    // height (laid out even while it is hidden, so it is known at the first
    // touch, at any text size) plus the step.
    window.requestAnimationFrame?.(() => {
      const note = noteRef.current;
      if (!note) return;
      const pinned = pinnedRef.current?.offsetHeight ?? 0;
      note.style.scrollMarginTop = `${pinned + CONDITIONS_NOTE_GAP_PX}px`;
      note.scrollIntoView?.({ block: "start" });
    });
  };
  const name = place?.name || place?.locality || "";
  if (!calendar) return null;
  const showToday =
    (offset ?? 0) !== 0 || (selected !== null && selected !== today);
  const week = selected
    ? calendar.window.weeks.find((row) => row.includes(selected))
    : null;
  const monday = week
    ? (() => {
        const [y, m, d] = selected.split("-").map(Number);
        const day = new Date(Date.UTC(y, m - 1, d));
        day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
        return day;
      })()
    : null;
  const iso = (day) => day.toISOString().slice(0, 10);
  return (
    <section className="conditions-page" data-testid="conditions-page">
      <header className="conditions-page-header">
        <button
          type="button"
          className="conditions-back"
          aria-label={message(locale, "placesBack")}
          onClick={onBack}
        >
          ←
        </button>
        <h1 className="conditions-title" data-testid="conditions-title">
          {fill(message(locale, "conditionsTitle"), { place: name })}
        </h1>
      </header>
      {/* The best period and the one to avoid, before the forecast
          sentence, at the column's width; it scrolls with the page. */}
      <ConditionsTrend locale={locale} place={place} />
      <div ref={calendarRef}>
        {/* The calendar's legend left the header; the ⓘ at the end of the
          intro line opens it, with its four drawings. */}
        <InfoLine
          locale={locale}
          className="conditions-intro-line"
          text={
            calendar.state === "offline"
              ? ""
              : calendar.window.lastDate < calendar.today
                ? message(locale, "conditionsPastIntro")
                : fill(message(locale, "conditionsIntro"), {
                    date: conditionsShortDate(calendar.reliableUntil, locale),
                  }).replace("..", ".")
          }
          label={message(locale, "conditionsLegendTitle")}
          title={message(locale, "conditionsLegendTitle")}
          testId="conditions-legend-info"
        >
          <ConditionsLegend locale={locale} />
        </InfoLine>
        <ConditionsCalendar
          calendar={calendar}
          locale={locale}
          mode="conditions"
          latitude={place?.latitude}
          legend={false}
          selected={selected}
          onDate={touch}
          onShift={(delta) => setOffset((current) => (current ?? 0) + delta)}
          onToday={() => {
            setOffset(0);
            touch(today);
          }}
          onRetry={() => {
            setRetry((value) => value + 1);
            retryHistory();
          }}
          showTodayIcon={showToday}
        />
        {selected ? null : (
          <p className="conditions-muted">
            {message(locale, "conditionsTouchHint")}
          </p>
        )}
      </div>
      {selected && week ? (
        <div className="conditions-pinned-holder">
          <div
            className={`conditions-pinned-week${pinned ? " is-pinned" : ""}`}
            ref={pinnedRef}
            data-testid="conditions-pinned-week"
            aria-hidden={pinned ? undefined : "true"}
          >
            <p>
              <span>
                {fill(message(locale, "conditionsWeek"), {
                  start: conditionsShortDate(iso(monday), locale),
                  end: conditionsShortDate(
                    iso(new Date(monday.getTime() + 6 * 86400000)),
                    locale,
                  ),
                })}
              </span>
              <button
                type="button"
                className="btn-link"
                tabIndex={pinned ? undefined : -1}
                onClick={() => window.scrollTo({ top: 0 })}
              >
                {message(locale, "conditionsCalendarLink")} ⌃
              </button>
            </p>
            <ConditionsCalendar
              calendar={calendar}
              locale={locale}
              mode="conditions"
              latitude={place?.latitude}
              selected={selected}
              onDate={touch}
              weekOf={selected}
            />
          </div>
        </div>
      ) : null}
      {selected ? (
        <div
          className="conditions-note"
          ref={noteRef}
          data-testid="conditions-note"
        >
          <ConditionsNightDetail
            date={selected}
            place={place}
            locale={locale}
            calendar={calendar}
            forecast={forecast}
            history={history}
            offersHref={offersHref}
          />
        </div>
      ) : null}
    </section>
  );
}
