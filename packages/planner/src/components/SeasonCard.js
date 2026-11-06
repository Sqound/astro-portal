"use client";

import { useEffect, useState } from "react";
import { message } from "portal/i18n.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import {
  seasonChartNights,
  seasonDayMonth,
  seasonDayMonthShort,
  seasonDuration,
  seasonPlural,
  seasonWord,
  seasonYearCaption,
  seasonYearInner,
  seasonYearMonths,
  seasonYearSentence,
} from "../season-card-model.js";
import {
  seasonDefaultMinimumMinutes,
  seasonMinimumMinutes,
  seasonVenusMinimumMinutes,
  targetSeasonYear,
} from "../season-window.js";

// The "Saison" card: how long a target stays usable, worked out in the browser
// by `seasonWindow` — the sentence ("Encore 6 semaines…"), why it ends, the
// chart of the usable hours per night over eight weeks with its legend, and
// what it was computed from. One component for every page that shows a season:
// the page of a multi-night plan (with its "Nuits à venir" link as `trailing`)
// and the dialog of a target (without any). Free: it reads no capability.
//
// A small "étendre" icon above the chart,
// at its right, turns the chart into the year: one bar per week over twelve
// months, with the periods the target is usable said in a sentence
// (`targetSeasonYear`). The year is worked out only once it is asked for,
// never when the sheet opens.

// Mercury and Venus are judged on ten minutes and half an hour, so their
// charts are drawn up to two hours (grid at 0, 1 h and 2 h) instead of four.
// `minimumMinutes` is the planet's own threshold.
const scaleOf = (inner, minimumMinutes = seasonVenusMinimumMinutes) =>
  inner
    ? { threshold: minimumMinutes, grid: [0, 60, 120] }
    : { threshold: seasonDefaultMinimumMinutes, grid: [0, 120, 240] };

/** The chart of the season: usable hours per night over eight weeks. */
function SeasonChart({ locale, season, inner = false, minimumMinutes }) {
  const { threshold: THRESHOLD, grid } = scaleOf(inner, minimumMinutes);
  const nights = season.nights.slice(0, seasonChartNights);
  if (!nights.length) return null;
  const width = 320;
  const height = 120;
  const top = 12;
  const bottom = 22;
  const left = 22;
  const plot = height - top - bottom;
  const highest = Math.max(
    grid.at(-1),
    ...nights.map((night) => night.usableMinutes),
  );
  const scale = (minutes) => (minutes / highest) * plot;
  const step = (width - left) / nights.length;
  const end = season.workableUntil;
  const moons = [];
  for (let index = 1; index < nights.length - 1; index += 1) {
    const [before, here, after] = [
      nights[index - 1].moonIllumination,
      nights[index].moonIllumination,
      nights[index + 1].moonIllumination,
    ];
    if (here <= before && here < after && here < 15) moons.push([index, "new"]);
    if (here >= before && here > after && here > 85)
      moons.push([index, "full"]);
  }
  const ticks = [0, 14, 28, 42].filter((index) => index < nights.length);
  return (
    <svg
      className="multi-night-season-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={seasonWord(locale, "multiNightChartLabel", {
        from: seasonDayMonth(locale, nights[0].date),
        to: seasonDayMonth(locale, nights.at(-1).date),
      })}
    >
      {grid.map((minutes) => (
        <g key={minutes}>
          <line
            className="multi-night-chart-grid"
            x1={left}
            x2={width}
            y1={top + plot - scale(minutes)}
            y2={top + plot - scale(minutes)}
          />
          <text x="0" y={top + plot - scale(minutes) + 3}>
            {minutes ? `${minutes / 60} h` : "0"}
          </text>
        </g>
      ))}
      {nights.map((night, index) => (
        <rect
          key={night.date}
          className={
            end && night.date > end
              ? "multi-night-chart-bar is-below"
              : "multi-night-chart-bar"
          }
          x={left + index * step + step * 0.15}
          width={step * 0.7}
          y={top + plot - scale(night.usableMinutes)}
          height={scale(night.usableMinutes)}
        />
      ))}
      <line
        className="multi-night-chart-threshold"
        x1={left}
        x2={width}
        y1={top + plot - scale(THRESHOLD)}
        y2={top + plot - scale(THRESHOLD)}
      />
      <text
        className="multi-night-chart-threshold-label"
        x={width}
        y={top + plot - scale(THRESHOLD) - 3}
        textAnchor="end"
      >
        {seasonWord(locale, "multiNightChartThreshold", {
          duration: seasonDuration(locale, THRESHOLD),
        })}
      </text>
      {moons.map(([index, kind]) => (
        <circle
          key={`${kind}-${index}`}
          className={`multi-night-chart-moon is-${kind}`}
          cx={left + index * step + step / 2}
          cy={6}
          r={3.5}
        />
      ))}
      {ticks.map((index) => (
        <text
          key={index}
          x={left + index * step}
          y={height - 6}
          className="multi-night-chart-tick"
        >
          {seasonDayMonthShort(locale, nights[index].date)}
        </text>
      ))}
    </svg>
  );
}

/** The icon of the "étendre" button: arrows out; arrows in once expanded. */
function ExpandIcon({ expanded }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          expanded
            ? "M22 3.41 16.71 8.7 20 12h-8V4l3.29 3.29L20.59 2 22 3.41zM3.41 22l5.29-5.29L12 20v-8H4l3.29 3.29L2 20.59 3.41 22z"
            : "M21 11V3h-8l3.29 3.29-10 10L3 13v8h8l-3.29-3.29 10-10L21 11z"
        }
      />
    </svg>
  );
}

/** The year, worked out once the card is expanded (a first state while it is). */
function useSeasonYear(yearArgs, expanded) {
  const key = yearArgs ? JSON.stringify(yearArgs) : "";
  const [state, setState] = useState({ key: "", year: null });
  useEffect(() => {
    if (!expanded || !key || state.key === key) return undefined;
    const timer = setTimeout(() => {
      let year = null;
      try {
        year = targetSeasonYear(yearArgs);
      } catch {
        year = null;
      }
      setState({ key, year });
    }, 0);
    return () => clearTimeout(timer);
    // `key` stands for the arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, key, state.key]);
  return state.key === key
    ? { ready: true, year: state.year }
    : { ready: false, year: null };
}

/** The chart of the year: usable hours per week over twelve months. */
export function SeasonYearChart({
  locale,
  year,
  inner = false,
  minimumMinutes,
}) {
  const { threshold: THRESHOLD, grid } = scaleOf(inner, minimumMinutes);
  const width = 320;
  const height = 126;
  const top = 14;
  const bottom = 22;
  const left = 22;
  const plotWidth = width - left;
  const plot = height - top - bottom;
  const highest = Math.max(
    grid.at(-1),
    ...year.weeks.map((week) => week.usableMinutes),
  );
  const scale = (minutes) => (minutes / highest) * plot;
  const at = (day) => left + (day / year.days) * plotWidth;
  const months = seasonYearMonths(locale, year);
  const todayX = at(year.today + 0.5);
  return (
    <svg
      className="multi-night-season-chart multi-night-season-year-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={seasonYearCaption(locale, year)}
      data-testid="season-year-chart"
    >
      {grid.map((minutes) => (
        <g key={minutes}>
          <line
            className="multi-night-chart-grid"
            x1={left}
            x2={width}
            y1={top + plot - scale(minutes)}
            y2={top + plot - scale(minutes)}
          />
          <text x="0" y={top + plot - scale(minutes) + 3}>
            {minutes ? `${minutes / 60} h` : "0"}
          </text>
        </g>
      ))}
      {year.weeks.map((week, index) => (
        <rect
          key={week.start}
          className={
            week.workable
              ? "multi-night-chart-bar"
              : "multi-night-chart-bar is-below"
          }
          x={at(index * 7) + (week.nights / year.days) * plotWidth * 0.1}
          width={(week.nights / year.days) * plotWidth * 0.8}
          y={top + plot - scale(week.usableMinutes)}
          height={scale(week.usableMinutes)}
        />
      ))}
      <line
        className="multi-night-chart-threshold"
        x1={left}
        x2={width}
        y1={top + plot - scale(THRESHOLD)}
        y2={top + plot - scale(THRESHOLD)}
      />
      <text
        className="multi-night-chart-threshold-label"
        x={width}
        y={top + plot - scale(THRESHOLD) - 3}
        textAnchor="end"
      >
        {seasonWord(locale, "multiNightChartThreshold", {
          duration: seasonDuration(locale, THRESHOLD),
        })}
      </text>
      <line
        className="multi-night-chart-today"
        x1={todayX}
        x2={todayX}
        y1={top - 4}
        y2={top + plot}
      />
      <text
        className="multi-night-chart-today-label"
        x={todayX + 3}
        y={top - 6}
      >
        {message(locale, "multiNightSeasonYearToday")}
      </text>
      {months.map((month, index) => (
        <g key={month.date}>
          {index ? (
            <line
              className="multi-night-chart-grid"
              x1={at(month.offset)}
              x2={at(month.offset)}
              y1={top + plot}
              y2={top + plot + 3}
            />
          ) : null}
          <text
            className="multi-night-chart-tick"
            x={at(month.offset + month.days / 2)}
            y={height - 6}
            textAnchor="middle"
          >
            {month.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * "Saison" — the heading (with an optional link at its end), then the card.
 *
 * Props: `locale`; `season`, `seasonWindow`'s result or `null` when it is
 * unknown (the card then says so); `rules`, what the season was computed from,
 * already written (`seasonRulesLine`); `endCause`, `mask` or `low` for the
 * night after the season's last (`seasonEndCause`; the reason is written only
 * when the season ends and one is given); `trailing`, the link at the end of the heading ("Nuits à venir" on
 * the page of a multi-night plan; absent in the dialog of a target);
 * `headingId`, the heading's `id`; `yearArgs`, what `targetSeasonYear` is
 * given (`{ target, place, constraints, filters, darkness, from }`) — with it
 * the card has its "étendre" button (without it, as before, only the
 * season).
 */
export function SeasonCard({
  locale,
  season,
  rules,
  endCause = null,
  trailing = null,
  headingId = "multi-night-season",
  yearArgs = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = Boolean(season && yearArgs);
  const inner = yearArgs ? seasonYearInner(yearArgs.target) : false;
  const minimumMinutes = yearArgs
    ? seasonMinimumMinutes(yearArgs.target)
    : seasonDefaultMinimumMinutes;
  const THRESHOLD = scaleOf(inner, minimumMinutes).threshold;
  const showYear = canExpand && expanded;
  const { ready, year } = useSeasonYear(yearArgs, showYear);
  const toggleLabel = message(
    locale,
    showYear ? "multiNightSeasonYearCollapse" : "multiNightSeasonYearExpand",
  );
  const toggle = canExpand ? (
    <button
      type="button"
      className="multi-night-season-toggle"
      aria-expanded={showYear}
      aria-label={toggleLabel}
      title={toggleLabel}
      data-testid="season-year-toggle"
      onClick={() => setExpanded(!showYear)}
    >
      <ExpandIcon expanded={showYear} />
    </button>
  ) : null;
  const headline = season ? (
    <>
      <p className="multi-night-season-title">
        {season.state === "ends"
          ? seasonPlural(
              locale,
              message(locale, "multiNightSeasonWeeksLeft"),
              season.weeksLeft,
            )
          : season.state === "continues"
            ? seasonWord(locale, "multiNightSeasonContinues", {
                date: seasonDayMonth(locale, season.nights.at(-1).date),
              })
            : seasonWord(locale, "multiNightSeasonNone")}
      </p>
      {season.state === "ends" && season.workableUntil && endCause && (
        <p className="multi-night-help">
          {seasonWord(
            locale,
            endCause === "mask"
              ? "multiNightSeasonEndMask"
              : "multiNightSeasonEndLow",
            {
              date: seasonDayMonth(locale, season.workableUntil),
              threshold: seasonDuration(locale, THRESHOLD),
            },
          )}
        </p>
      )}
    </>
  ) : null;
  return (
    <section className="multi-night-section" aria-labelledby={headingId}>
      <div className="multi-night-section-heading">
        <h3 id={headingId}>{message(locale, "multiNightSeason")}</h3>
        {trailing}
      </div>
      <div className="multi-night-panel">
        {season ? (
          showYear ? (
            <>
              <div className="multi-night-season-head">
                <p className="multi-night-help">
                  {seasonYearCaption(locale, {
                    start: `${yearArgs.from.slice(0, 7)}-01`,
                  })}
                </p>
                {toggle}
              </div>
              {!ready ? (
                <p
                  className="planner-target-facts-loading"
                  role="status"
                  data-testid="season-year-loading"
                >
                  <BrandLoader size={24} />
                </p>
              ) : year ? (
                <>
                  <SeasonYearChart
                    locale={locale}
                    year={year}
                    inner={inner}
                    minimumMinutes={minimumMinutes}
                  />
                  <p className="multi-night-chart-legend">
                    <span className="is-below">
                      {seasonWord(locale, "multiNightLegendBelow")}
                    </span>
                  </p>
                  <p
                    className="multi-night-season-title"
                    data-testid="season-year-sentence"
                  >
                    {seasonYearSentence(locale, year, {
                      inner,
                      minimumMinutes,
                    })}
                  </p>
                </>
              ) : (
                <p className="multi-night-help">
                  {seasonWord(locale, "multiNightSeasonUnknown")}
                </p>
              )}
              <p className="multi-night-help">
                {seasonWord(locale, "multiNightSeasonYearRules")}
              </p>
            </>
          ) : (
            <>
              {toggle ? (
                <div className="multi-night-season-head">
                  <div className="multi-night-season-headline">{headline}</div>
                  {toggle}
                </div>
              ) : (
                headline
              )}
              <SeasonChart
                locale={locale}
                season={season}
                inner={inner}
                minimumMinutes={minimumMinutes}
              />
              <p className="multi-night-chart-legend">
                <span className="is-new">
                  {seasonWord(locale, "multiNightLegendNewMoon")}
                </span>
                <span className="is-full">
                  {seasonWord(locale, "multiNightLegendFullMoon")}
                </span>
                <span className="is-below">
                  {seasonWord(locale, "multiNightLegendBelow")}
                </span>
              </p>
            </>
          )
        ) : (
          <p className="multi-night-help">
            {seasonWord(locale, "multiNightSeasonUnknown")}
          </p>
        )}
        <p className="multi-night-help">
          {seasonWord(locale, "multiNightComputedHere", { rules })}
        </p>
      </div>
    </section>
  );
}
