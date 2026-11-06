"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { revealSelection } from "../calendar/reveal-selection.js";
import { JournalGroupCard } from "./JournalGroupCard.js";
import { JournalOutcomeChip } from "./JournalOutcomeChip.js";
import { JournalTargetRows } from "./JournalTargetRows.js";
import {
  calendarDays,
  counted,
  eveningLong,
  groupsOfLine,
  guidedPlanName,
  journalLineHref,
  lineKey,
  monthHeading,
  monthShape,
  placeLine,
  totalBlock,
} from "./journal-list-view.js";

function weekdayNames(locale) {
  return Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "narrow",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2024, 0, 1 + offset, 12))),
  );
}

const isoOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * The month (0 to 11) a year of the calendar opens on: the current month when
 * `year` is the current year, else the month of the latest date of `dates`
 * (`YYYY-MM-DD`) in that year, `null` for a year with none.
 */
export function monthToShow({ year, dates = [], today = new Date() }) {
  if (today.getFullYear() === Number(year)) return today.getMonth();
  const latest = dates
    .filter((date) => date.startsWith(`${year}-`))
    .sort()
    .at(-1);
  return latest ? Number(latest.slice(5, 7)) - 1 : null;
}

function Month({ locale, year, month, days, selected, onSelect }) {
  const { offset, days: length } = monthShape(year, month);
  // Today in a clear frame (`.is-today`), the number in bold.
  const today = isoOf(new Date());
  const names = weekdayNames(locale);
  return (
    <article className="calendar-month" data-month={month}>
      <h3>
        {monthHeading(`${year}-${String(month + 1).padStart(2, "0")}`, locale)}
      </h3>
      <div className="calendar-weekdays" aria-hidden="true">
        {names.map((name, index) => (
          <span key={`${name}-${index}`}>{name}</span>
        ))}
      </div>
      <div className="calendar-days">
        {Array.from({ length: offset }, (_, index) => (
          <span className="calendar-day is-empty" key={`empty-${index}`} />
        ))}
        {Array.from({ length: length }, (_, index) => {
          const day = index + 1;
          const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = days.get(date);
          const isToday = date === today;
          if (!entry)
            return (
              <span
                className={`calendar-day${isToday ? " is-today" : ""}`}
                key={day}
              >
                {day}
              </span>
            );
          return (
            <button
              type="button"
              key={day}
              className={`calendar-day has-session is-${entry.look.replace("_", "-")}${selected === date ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
              data-date={date}
              data-look={entry.look}
              aria-expanded={selected === date}
              aria-label={`${eveningLong(date, locale)} : ${counted(locale, "journalGroupSessions", entry.items.length)}`}
              onClick={() => onSelect(date)}
            >
              <span>{day}</span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

/**
 * What a chosen day holds: its sessions, as the list draws their targets; a
 * night of a multi-night plan, the card of its plan, unfolded, the night
 * ringed.
 */
function DayPanel({
  locale,
  date,
  entry,
  sessions = [],
  groups = [],
  pictures = null,
}) {
  const drawn = new Set();
  return (
    <section
      className="calendar-session-panel journal-day-panel"
      aria-live="polite"
    >
      <div className="calendar-session-heading">
        <div>
          <p className="eyebrow">{eveningLong(date, locale)}</p>
          <h3>{counted(locale, "journalGroupSessions", entry.items.length)}</h3>
        </div>
      </div>
      {entry.items.map((item) => {
        const named = groupsOfLine(groups, item);
        if (named.length) {
          return named.map((group) => {
            if (drawn.has(group.projectId)) return null;
            drawn.add(group.projectId);
            const keys = new Set(group.lineKeys ?? group.sessionIds ?? []);
            return (
              <JournalGroupCard
                key={`group-${group.projectId}`}
                group={group}
                items={sessions.filter((other) => keys.has(lineKey(other)))}
                locale={locale}
                pictures={pictures}
                highlight={lineKey(item)}
              />
            );
          });
        }
        return (
          <div
            className="journal-day-session"
            key={item.sessionId ?? item.planId}
          >
            <div className="journal-day-session-head">
              <span className="journal-day-session-text">
                <strong>
                  {item.guidedEvening
                    ? guidedPlanName(locale, item.planName ?? null)
                    : [item.title, placeLine(item, locale)]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                </strong>
                <small>
                  {[
                    totalBlock(item, locale).figure,
                    totalBlock(item, locale).line,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
              <JournalOutcomeChip
                state={item.state}
                locale={locale}
                guidedEvening={item.guidedEvening === true}
              />
            </div>
            {item.state === "to_debrief" ? null : (
              <JournalTargetRows
                item={item}
                pictures={pictures}
                locale={locale}
              />
            )}
            {item.readOnly ? null : (
              <div className="journal-session-footer">
                {item.state === "to_debrief" ? (
                  <a
                    className="btn-secondary is-debrief journal-debrief-action"
                    href={journalLineHref(locale, item)}
                  >
                    {message(locale, "journalDebriefSession")}
                  </a>
                ) : (
                  <a
                    className="btn-secondary journal-see-session"
                    href={journalLineHref(locale, item)}
                  >
                    {message(locale, "planSeeSession")}
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * The calendar of a year of the Journal (the old journal's `YearCalendar`, now
 * on the sessions): twelve months, a day with a session in gold, a night to
 * debrief circled in gold, one not carried out circled in red, a night of a
 * multi-night plan in the plan's blue; the day chosen opens its panel under its
 * row of months. The legend names the four looks.
 */
export function JournalCalendar({
  locale = "en",
  sessions = [],
  groups = [],
  pictures = null,
  year,
}) {
  const [selected, setSelected] = useState(null);
  const [columns, setColumns] = useState(4);
  // The months per row follow the page's width (the stylesheet's four
  // breakpoints), to open the panel of a day under the row of its month.
  useEffect(() => {
    const queries = [
      [window.matchMedia("(max-width: 520px)"), 1],
      [window.matchMedia("(max-width: 850px)"), 2],
      [window.matchMedia("(max-width: 1100px)"), 3],
    ];
    const update = () =>
      setColumns(queries.find(([query]) => query.matches)?.[1] ?? 4);
    update();
    for (const [query] of queries) query.addEventListener("change", update);
    return () => {
      for (const [query] of queries)
        query.removeEventListener("change", update);
    };
  }, []);
  const days = calendarDays(sessions, year);
  // The year opens on the month that matters -- the current one in the
  // current year, else the month of the latest session -- instead of January
  // and a scroll of 4 000 px to the last nights.
  useEffect(() => {
    const month = monthToShow({ year, dates: [...days.keys()] });
    if (month === null || month === 0 || window.scrollY > 40) return;
    document
      .querySelector(`.journal-calendar .calendar-month[data-month="${month}"]`)
      ?.scrollIntoView({ block: "start" });
    // Once per year shown; the sessions refresh must not move the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const entry = selected ? days.get(selected) : null;
  const selectedMonth = selected ? Number(selected.slice(5, 7)) - 1 : null;
  const toggle = (date) =>
    setSelected((current) => (current === date ? null : date));
  // A touch on a night scrolls the page by the smallest offset that
  // shows the night's line and its sessions.
  useEffect(() => {
    if (!selected) return;
    revealSelection(
      document.querySelector(
        `.journal-calendar button[data-date="${selected}"]`,
      ),
      document.querySelector(".journal-day-panel"),
    );
  }, [selected]);
  return (
    <section
      className="year-calendar journal-calendar"
      aria-label={message(locale, "yearCalendar")}
    >
      <ul className="journal-calendar-legend">
        {[
          ["session", "journalCalendarLegendSession"],
          ["to-debrief", "journalCalendarLegendToDebrief"],
          ["abandoned", "journalCalendarLegendNotExecuted"],
          ["multi-night", "journalCalendarLegendMultiNight"],
        ].map(([look, key]) => (
          <li key={look}>
            <i className={`journal-legend-dot is-${look}`} aria-hidden="true" />
            {message(locale, key)}
          </li>
        ))}
      </ul>
      <div className="calendar-months">
        {Array.from({ length: 12 }, (_, month) => {
          const endsRow = (month + 1) % columns === 0 || month === 11;
          const panelHere =
            entry &&
            endsRow &&
            Math.floor(selectedMonth / columns) === Math.floor(month / columns);
          return [
            <Month
              key={month}
              locale={locale}
              year={year}
              month={month}
              days={days}
              selected={selected}
              onSelect={toggle}
            />,
            panelHere ? (
              <DayPanel
                key={`panel-${selected}`}
                locale={locale}
                date={selected}
                entry={entry}
                sessions={sessions}
                groups={groups}
                pictures={pictures}
              />
            ) : null,
          ];
        })}
      </div>
    </section>
  );
}
