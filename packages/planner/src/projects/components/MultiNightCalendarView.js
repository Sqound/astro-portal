"use client";

import { useEffect, useMemo, useState } from "react";
import { ConditionsCalendar } from "../../components/ConditionsCalendar.js";
import { useConditionsCalendar } from "../../components/useConditionsCalendar.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { weatherCodeForDate } from "portal/astronomy-forecast.js";
import { multiNightCalendar } from "../multi-night-calendar.js";
import { openMultiNightRoute } from "./client.js";
import { choose, say } from "./copy.js";
import {
  multiNightCalendarFirstPage,
  multiNightClock,
  multiNightDuration,
  multiNightForecastNights,
  multiNightTrendFrom,
  multiNightForecastWord,
  multiNightLongDate,
  multiNightMoonRule,
  multiNightNextNightPlan,
  multiNightNoWindowReason,
  multiNightPlaceDiffers,
  multiNightRowLabel,
  projectDateAfter,
} from "./model.js";
import { MultiNightBack } from "./MultiNightParts.js";

// "Nuits à venir" — the calendar of the multi-night plans followed at one
// place: one line per night until the next new Moon, its dark duration, the
// Moon, the weather word of the first five nights, and each plan's usable
// windows. A night declared "Disponible" is kept in this browser only. Nothing
// is allocated: a click opens the night.

const AVAILABLE_KEY = "astro-portal:multi-night:available-nights:v1";
const MORE = 14;
const COMPUTED = 30;

function readAvailable(today) {
  try {
    const stored = JSON.parse(localStorage.getItem(AVAILABLE_KEY) || "[]");
    return Array.isArray(stored)
      ? stored.filter((date) => typeof date === "string" && date >= today)
      : [];
  } catch {
    return [];
  }
}

function writeAvailable(dates) {
  try {
    localStorage.setItem(AVAILABLE_KEY, JSON.stringify([...dates].sort()));
  } catch {
    // Kept for this visit only.
  }
}

const PALETTE = ["is-gold", "is-blue", "is-green", "is-rose"];

function axisOf(nights, timeZone) {
  const minutesOf = (iso) => {
    const [hours, minutes] = multiNightClock(iso, timeZone)
      .split(":")
      .map(Number);
    const value = hours * 60 + minutes;
    return value < 12 * 60 ? value + 24 * 60 : value;
  };
  const starts = nights.map((night) => minutesOf(night.start));
  const ends = nights.map((night) => minutesOf(night.end));
  const from = Math.floor((Math.min(...starts) - 20) / 30) * 30;
  const to = Math.ceil((Math.max(...ends) + 20) / 30) * 30;
  return { from, to, minutesOf };
}

function NightRow({
  locale,
  night,
  projects,
  axis,
  timeZone,
  today,
  available,
  onOpen,
}) {
  const span = axis.to - axis.from;
  const x = (iso) =>
    Math.max(
      0,
      Math.min(100, ((axis.minutesOf(iso) - axis.from) / span) * 100),
    );
  const reason = multiNightNoWindowReason(night);
  const forecast = night.forecast;
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${night.date}T12:00:00Z`));
  return (
    <li
      className={`multi-night-calendar-night${available ? " is-available" : ""}`}
    >
      <button
        className="multi-night-calendar-row"
        type="button"
        aria-label={multiNightRowLabel(locale, night, projects, timeZone)}
        onClick={onOpen}
      >
        <span className="multi-night-calendar-day">
          <small>{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</small>
          <strong>{Number(night.date.slice(8, 10))}</strong>
          {night.date === today && <em>{say(locale, "tonight")}</em>}
        </span>
        <span className="multi-night-calendar-body">
          <span className="multi-night-calendar-figures">
            <span>
              {multiNightDuration(locale, night.darkMinutes)} · ☾{" "}
              {Math.round(night.moonIllumination)} %
            </span>
            {available && (
              <span className="multi-night-available">
                {say(locale, "available")}
              </span>
            )}
            <span className={`multi-night-forecast is-${forecast}`}>
              {choose(locale, "forecast", forecast)}
            </span>
          </span>
          <span className="multi-night-calendar-track" aria-hidden="true">
            <span
              className="multi-night-calendar-dark"
              style={{
                left: `${x(night.start)}%`,
                right: `${100 - x(night.end)}%`,
              }}
            />
            {(night.moonUp || []).map((up) => (
              <span
                key={up.start}
                className="multi-night-calendar-moon"
                style={{
                  left: `${x(up.start)}%`,
                  right: `${100 - x(up.end)}%`,
                  opacity: 0.25 + (night.moonIllumination / 100) * 0.6,
                }}
              />
            ))}
          </span>
          {reason ? (
            <span className="multi-night-calendar-none">
              {choose(locale, "noWindow", reason)}
            </span>
          ) : (
            projects.map((project, index) => {
              const entry = night.projects.find(
                (item) => item.projectId === project.id,
              );
              return (
                <span
                  key={project.id}
                  className={`multi-night-calendar-lane ${PALETTE[index % PALETTE.length]}`}
                  aria-hidden="true"
                >
                  {(entry?.windows || []).map((window) => (
                    <span
                      key={window.start}
                      style={{
                        left: `${x(window.start)}%`,
                        right: `${100 - x(window.end)}%`,
                      }}
                    />
                  ))}
                </span>
              );
            })
          )}
        </span>
      </button>
    </li>
  );
}

export function MultiNightCalendarView({ host, data, projectId = null }) {
  const { locale } = host;
  const { projects: all, todayAt, targetOf, views } = data;
  // One calendar per place: the plan opened from, else the most recent.
  const anchor =
    all.find((project) => project.id === projectId) || all[0] || null;
  const projects = useMemo(
    () =>
      anchor
        ? all.filter(
            (project) =>
              project.status === "active" &&
              !multiNightPlaceDiffers(project.place, anchor),
          )
        : [],
    [all, anchor],
  );
  const timeZone = anchor?.place?.timeZone || null;
  const today = todayAt(anchor?.place);
  const [count, setCount] = useState(null);
  const [computed, setComputed] = useState(null);
  const [weather, setWeather] = useState(null);
  const [available, setAvailable] = useState(() => new Set());
  const [opened, setOpened] = useState(null);
  useEffect(() => setAvailable(new Set(readAvailable(today))), [today]);
  const key = projects
    .map((project) => `${project.id}:${project.revision}`)
    .join(",");
  const want = Math.max(COMPUTED, count ?? 0);
  useEffect(() => {
    if (!anchor) return undefined;
    const timer = setTimeout(() => {
      try {
        setComputed(
          multiNightCalendar({
            projects: projects.map((project) => ({
              id: project.id,
              target: targetOf(project),
              constraints: project.constraints,
              filters: project.equipment?.filterIds || [],
            })),
            place: anchor.place,
            from: today,
            nights: Math.min(120, want),
          }) || { nights: [] },
        );
      } catch {
        setComputed({ nights: [] });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [key, today, want]);
  useEffect(() => {
    if (!anchor?.place) return undefined;
    const controller = new AbortController();
    const query = new URLSearchParams({
      latitude: String(anchor.place.latitude),
      longitude: String(anchor.place.longitude),
    });
    fetch(`/api/v1/weather?${query}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setWeather(payload?.daily || null))
      .catch(() => {});
    return () => controller.abort();
  }, [anchor?.place?.latitude, anchor?.place?.longitude]);
  const back = () =>
    projectId
      ? openMultiNightRoute({ screen: "detail", projectId })
      : openMultiNightRoute({ screen: "list" });
  if (!anchor)
    return (
      <main className="multi-night-screen multi-night-calendar">
        <MultiNightBack label={say(locale, "back")} onBack={back} />
        <p className="multi-night-help">{say(locale, "noneInProgress")}</p>
      </main>
    );
  const nights = computed?.nights || [];
  const first = multiNightCalendarFirstPage(nights);
  const shown = nights.slice(0, count ?? first.count).map((night, index) => ({
    ...night,
    forecast:
      index < multiNightForecastNights && weather
        ? index >= multiNightTrendFrom &&
          weatherCodeForDate(weather, night.date) !== null
          ? "uncertain"
          : multiNightForecastWord(weatherCodeForDate(weather, night.date))
        : "none",
  }));
  const axis = shown.length ? axisOf(shown, timeZone) : null;
  const ticks = [];
  if (axis)
    for (
      let minute = Math.ceil(axis.from / 120) * 120 + 60;
      minute < axis.to;
      minute += 120
    )
      ticks.push(minute);
  const toggleAvailable = (date) =>
    setAvailable((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      writeAvailable(next);
      return next;
    });
  const months = [];
  for (const night of shown) {
    const month = night.date.slice(0, 7);
    if (months.at(-1)?.month !== month) months.push({ month, nights: [] });
    months.at(-1).nights.push(night);
  }
  const openNight = shown.find((night) => night.date === opened) || null;
  const nightPlans = openNight
    ? host.plans.filter(
        (plan) =>
          plan.date === openNight.date &&
          !multiNightPlaceDiffers(plan.location, anchor),
      )
    : [];
  return (
    <main className="multi-night-screen multi-night-calendar">
      <header className="multi-night-screen-header">
        <MultiNightBack label={say(locale, "back")} onBack={back} />
      </header>
      <h2 className="multi-night-screen-title">
        {say(locale, "calendarTitle")}
      </h2>
      <p className="multi-night-calendar-place">
        <strong>
          {say(locale, "calendarFollowed", {
            place: anchor.place?.name,
            count: projects.length,
          })}
        </strong>
      </p>
      {shown.length > 0 && (
        <p className="multi-night-help">
          {say(
            locale,
            count === null && first.newMoon
              ? "calendarRange"
              : "calendarRangePlain",
            {
              from: multiNightLongDate(locale, shown[0].date),
              to: multiNightLongDate(locale, shown.at(-1).date),
            },
          )}
        </p>
      )}
      {/* The calendar of « Conditions à {lieu} » in
          several-dates mode, above the list: a touched date is declared
          available or not (the gold tick), the list stays. */}
      <MultiNightAvailabilityGrid
        locale={locale}
        place={anchor.place}
        available={available}
        onToggle={toggleAvailable}
      />
      <section
        className="multi-night-panel multi-night-legend"
        aria-label={say(locale, "legend")}
      >
        <ul className="multi-night-legend-plans">
          {projects.map((project, index) => (
            <li key={project.id} className={PALETTE[index % PALETTE.length]}>
              <strong>{project.target?.name}</strong>
              <small>{multiNightMoonRule(locale, project)}</small>
            </li>
          ))}
        </ul>
        <p className="multi-night-legend-keys">
          <span className="is-moon">{say(locale, "legendMoonUp")}</span>
          <span className="is-dark">{say(locale, "legendDark")}</span>
          <span className="is-twilight">{say(locale, "legendTwilight")}</span>
        </p>
        <p className="multi-night-help">
          {say(locale, "calendarGuide")}{" "}
          <strong className="multi-night-available-word">
            {say(locale, "available")}
          </strong>
          {say(locale, "availableMeaning")}
        </p>
      </section>
      {computed === null ? (
        <p className="multi-night-help">{say(locale, "loading")}</p>
      ) : !shown.length ? (
        <p className="multi-night-help">{say(locale, "calendarUnavailable")}</p>
      ) : (
        <section
          className="multi-night-panel multi-night-calendar-nights"
          aria-label={say(locale, "calendarNightsLabel", {
            from: multiNightLongDate(locale, shown[0].date),
            to: multiNightLongDate(locale, shown.at(-1).date),
          })}
        >
          <div className="multi-night-calendar-axis" aria-hidden="true">
            {ticks.map((minute) => (
              <span
                key={minute}
                style={{
                  left: `${((minute - axis.from) / (axis.to - axis.from)) * 100}%`,
                }}
              >
                {String(Math.floor(minute / 60) % 24).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {months.map(({ month, nights: monthNights }) => (
            <div key={month}>
              <h3 className="multi-night-calendar-month">
                {(() => {
                  const name = new Intl.DateTimeFormat(locale, {
                    month: "long",
                    timeZone: "UTC",
                  }).format(new Date(`${month}-15T12:00:00Z`));
                  return name.charAt(0).toUpperCase() + name.slice(1);
                })()}
              </h3>
              <ul className="multi-night-calendar-list">
                {monthNights.map((night) => (
                  <NightRow
                    key={night.date}
                    locale={locale}
                    night={night}
                    projects={projects}
                    axis={axis}
                    timeZone={timeZone}
                    today={today}
                    available={available.has(night.date)}
                    onOpen={() => setOpened(night.date)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {shown.length > 0 &&
        shown.length < Math.min(120, nights.length + MORE) && (
          <button
            className="btn-tertiary multi-night-more"
            type="button"
            onClick={() => setCount(Math.min(120, shown.length + MORE))}
          >
            {say(locale, "showMore", { count: MORE })}
          </button>
        )}
      <p className="multi-night-help multi-night-calendar-hint">
        {say(locale, "calendarHint")}
      </p>
      {openNight && (
        <WebDialog
          className="multi-night-dialog multi-night-night-dialog"
          closeLabel={say(locale, "close")}
          onClose={() => setOpened(null)}
          title={multiNightLongDate(locale, openNight.date)}
          footer={
            <button
              className="btn-tertiary"
              type="button"
              onClick={() => toggleAvailable(openNight.date)}
            >
              {available.has(openNight.date)
                ? say(locale, "undeclareAvailable")
                : say(locale, "declareAvailable")}
            </button>
          }
        >
          {nightPlans.map((plan) => (
            <p key={plan.id}>
              <button
                className="btn-link"
                type="button"
                onClick={() => host.openPlan(plan.id)}
              >
                {say(locale, "openPlan", { name: plan.name })}
              </button>
            </p>
          ))}
          {host.access === "open" &&
            projects
              .filter((project) => {
                const entry = openNight.projects.find(
                  (item) => item.projectId === project.id,
                );
                const already = nightPlans.some((plan) =>
                  (plan.items || []).some(
                    (item) => item.projectId === project.id,
                  ),
                );
                return entry?.windows?.length && !already;
              })
              .map((project) => {
                const entry = openNight.projects.find(
                  (item) => item.projectId === project.id,
                );
                const remaining =
                  views.find((view) => view.project.id === project.id)?.progress
                    .remainingMinutes ?? 60;
                return (
                  <p key={project.id}>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() =>
                        host.addPlanForNight(
                          multiNightNextNightPlan({
                            project,
                            target: targetOf(project),
                            date: openNight.date,
                            durationMinutes: Math.max(
                              30,
                              Math.min(remaining || 60, entry.usableMinutes),
                            ),
                          }),
                        )
                      }
                    >
                      {say(locale, "planThisNight", {
                        target: project.target?.name,
                      })}
                    </button>
                  </p>
                );
              })}
          <p className="multi-night-help">{say(locale, "availableKept")}</p>
        </WebDialog>
      )}
    </main>
  );
}

export { projectDateAfter };

/** "Nuits à venir", several dates: the shared calendar with the band. */
function MultiNightAvailabilityGrid({ locale, place, available, onToggle }) {
  const [offset, setOffset] = useState(0);
  const { calendar } = useConditionsCalendar({
    place,
    offset,
    pastAllowed: true,
  });
  if (!calendar) return null;
  const count = [...available].filter((date) => date >= calendar.today).length;
  return (
    <section
      className="multi-night-panel multi-night-grid"
      data-testid="multi-night-grid"
    >
      <ConditionsCalendar
        calendar={calendar}
        locale={locale}
        mode="multiple"
        latitude={place?.latitude}
        ticked={[...available]}
        onDate={onToggle}
        onShift={(delta) => setOffset((current) => current + delta)}
        onToday={() => setOffset(0)}
        showTodayIcon={offset !== 0}
        legend={false}
      />
      <p className="multi-night-grid-count">
        <strong>{say(locale, "gridCount", { count })}</strong>
      </p>
      <p className="multi-night-help">{say(locale, "gridHint")}</p>
    </section>
  );
}
