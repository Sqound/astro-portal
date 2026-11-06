"use client";

import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { InfoSources } from "portal/components/dialog/InfoButton.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { useEffect, useId, useState } from "react";
import { HourDetailDialog } from "./HourlyForecast.js";
import {
  curvePointOn,
  polylinePointOn,
  tileCurveIndexAt,
  tileCurvePath,
  tileCurvePoint,
  tonightSlotShare,
  verdictFiligreePath,
  verdictFiligreePoint,
} from "../tonight-words.js";

// The parts of "Cette nuit"'s night shared with the planner's "Prévision
// astronomique": the card "Note de la nuit" with its states, its
// filigree and its sheet, and the night — its threshold, its
// window and length, its timeline and the tiles. Moved out
// of `TonightPage.js` as they were; each page feeds them the words of
// `tonightWords` for its own night. The hourly strip is `HourlyForecast.js`,
// the two sky cards `SkyQualityCards` (`SkyBrightnessParts.js`).

const tileIcons = {
  clouds: (
    <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z" />
  ),
  wind: (
    <>
      <path d="M3 8h10a3 3 0 1 0-3-3" />
      <path d="M3 12h14a3 3 0 1 1-3 3" />
      <path d="M3 16h6" />
    </>
  ),
  precipitation: (
    <>
      <path d="M7 14h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 7.1 3.5 3.5 0 0 0 7 14z" />
      <path d="M8.5 17.5l-1 2.5" />
      <path d="M12.5 17.5l-1 2.5" />
      <path d="M16.5 17.5l-1 2.5" />
    </>
  ),
  dew: <path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z" />,
  visibility: (
    <>
      <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
};

// A tile's quantity over the night as a watermark behind its text,
// drawn like the score card's filigree (`VerdictFiligree`), in the colour the
// hourly strip gives that quantity (`.tonight-tile[data-tile]` in the style
// sheet), the Moon in blue, every curve in the one red tint in red mode.
// What lies outside the chosen
// slot (`excluded`, the slot as shares of the width) hatched in grey at 45°
// with a dashed line at each bound — the plan frise's hatch; the slot itself
// is never hatched.
export function ExcludedSpan({ excluded, width, height }) {
  const id = useId().replace(/:/g, "");
  if (!excluded) return null;
  const from = Math.max(0, Math.min(1, excluded.from)) * width;
  const to = Math.max(0, Math.min(1, excluded.to)) * width;
  return (
    <g className="tonight-excluded" data-testid="tonight-excluded">
      <defs>
        <pattern
          id={`hatch-${id}`}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      {from > 0 ? (
        <rect
          x="0"
          y="0"
          width={from}
          height={height}
          fill={`url(#hatch-${id})`}
        />
      ) : null}
      {to < width ? (
        <rect
          x={to}
          y="0"
          width={width - to}
          height={height}
          fill={`url(#hatch-${id})`}
        />
      ) : null}
      {[from, to]
        .filter((x) => x > 0 && x < width)
        .map((x) => (
          <line
            key={x}
            className="tonight-excluded-bound"
            x1={x}
            x2={x}
            y1="0"
            y2={height}
          />
        ))}
    </g>
  );
}

function TileCurve({ tile, values, excluded = null }) {
  const path = tileCurvePath(values);
  if (!path) return null;
  return (
    <svg
      className="tonight-tile-curve"
      viewBox="0 0 160 80"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-testid={`tonight-tile-curve-${tile}`}
    >
      <path className="tonight-tile-curve-area" d={path.area} />
      <path className="tonight-tile-curve-line" d={path.line} />
      <ExcludedSpan excluded={excluded} width={160} height={80} />
    </svg>
  );
}

// A small dot on the tile's curve where the night is now, only while `nowMs`
// lies inside the hours the curve covers, at the curve's value for that instant
// (the very cubic of the curve). 4 px disc in red mode (the style sheet), so
// the position reads without the colour. A layer of the curve's own box, the
// dot placed in percent of it, so the stretched `viewBox` does not squash it.
function TileNowDot({ tile, values, times, nowMs }) {
  const index = tileCurveIndexAt(times, nowMs);
  const point = index === null ? null : tileCurvePoint(values, index);
  if (!point) return null;
  return (
    <div className="tonight-tile-now-layer" aria-hidden="true">
      <span
        className="tonight-tile-now"
        data-testid={`tonight-tile-now-${tile}`}
        style={{
          left: `${Math.round((point[0] / 160) * 10000) / 100}%`,
          top: `${Math.round((point[1] / 80) * 10000) / 100}%`,
        }}
      />
    </div>
  );
}

// The same dot on the score's curves whose abscissa is the hour, in a
// layer of the chart's own box (`className`), the dot placed in percent of
// the chart's drawn box (`width` × `height`), so a stretched or scaled
// `viewBox` does not squash it. `point` is `[x, y]` in that box or `null`
// (the present is outside the night: no dot).
function ScoreNowDot({ className, testId, point, width, height }) {
  if (!point) return null;
  return (
    <div className={className} aria-hidden="true">
      <span
        className="tonight-tile-now"
        data-testid={testId}
        style={{
          left: `${Math.round((point[0] / width) * 10000) / 100}%`,
          top: `${Math.round((point[1] / height) * 10000) / 100}%`,
        }}
      />
    </div>
  );
}

// The instant of the dots, refreshed on the minute by one timeout to the next
// minute (no interval, no animation). A number given by the page is used as
// is (tests, captures); otherwise `null` until the first effect, so the
// server's markup and the first client render agree.
function useMinuteNow(fixed) {
  const [current, setCurrent] = useState(null);
  useEffect(() => {
    if (typeof fixed === "number") return undefined;
    let timer;
    const tick = () => {
      setCurrent(Date.now());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [fixed]);
  return typeof fixed === "number" ? fixed : current;
}

// The timeline of the night: twilight, the dark night at its threshold,
// dawn, the Moon above the horizon and the even hours.
function NightTimeline({ overview, words }) {
  const timeline = overview.timeline;
  const start = Date.parse(timeline.start);
  const span = Date.parse(timeline.end) - start;
  // The drawing is as wide as its card, one unit to the pixel: the bar
  // stretches, its texts keep the size they have at 390 px instead of growing
  // with the card.
  const [box, setBox] = useState(null);
  const [drawnWidth, setDrawnWidth] = useState(324);
  useEffect(() => {
    if (!box) return undefined;
    const measure = () => {
      const measured = Math.round(box.getBoundingClientRect().width);
      if (measured > 0) setDrawnWidth(Math.max(240, measured));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  const width = drawnWidth - 12;
  const x = (value) =>
    6 + Math.min(1, Math.max(0, (Date.parse(value) - start) / span)) * width;
  const darkStart = x(timeline.darkStart);
  const darkEnd = x(timeline.darkEnd);
  return (
    <div className="tonight-timeline-box" ref={setBox}>
      <svg
        className="tonight-timeline"
        viewBox={`0 0 ${drawnWidth} 72`}
        width={drawnWidth}
        height="72"
        role="img"
        aria-label={words.night.description}
      >
        <defs>
          <linearGradient id="tonight-evening" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5b6f78" />
            <stop offset="1" stopColor="#1c2528" />
          </linearGradient>
          <linearGradient id="tonight-dawn" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1c2528" />
            <stop offset="1" stopColor="#5b6f78" />
          </linearGradient>
          <clipPath id="tonight-bar">
            <rect x="6" y="20" width={width} height="28" rx="6" />
          </clipPath>
        </defs>
        {words.night.moonLabel ? (
          <text x="6" y="11" className="tonight-timeline-moon-label">
            {words.night.moonLabel}
          </text>
        ) : null}
        <g clipPath="url(#tonight-bar)">
          <rect
            x="6"
            y="20"
            width={Math.max(0, darkStart - 6)}
            height="28"
            fill="url(#tonight-evening)"
          />
          <rect
            x={darkStart}
            y="20"
            width={Math.max(0, darkEnd - darkStart)}
            height="28"
            className="tonight-timeline-night"
          />
          <rect
            x={darkEnd}
            y="20"
            width={Math.max(0, 6 + width - darkEnd)}
            height="28"
            fill="url(#tonight-dawn)"
          />
          {timeline.moonUp.map((interval) => (
            <rect
              key={interval.start}
              x={x(interval.start)}
              y="20"
              width={Math.max(0, x(interval.end) - x(interval.start))}
              height="28"
              className="tonight-timeline-moon"
            />
          ))}
          {overview.slot ? (
            <g transform="translate(6 20)">
              <ExcludedSpan
                excluded={{
                  from: (x(overview.slot.start) - 6) / width,
                  to: (x(overview.slot.end) - 6) / width,
                }}
                width={width}
                height={28}
              />
            </g>
          ) : null}
        </g>
        <line
          x1={darkStart}
          y1="20"
          x2={darkStart}
          y2="48"
          className="tonight-timeline-edge"
        />
        <line
          x1={darkEnd}
          y1="20"
          x2={darkEnd}
          y2="48"
          className="tonight-timeline-edge"
        />
        {timeline.moonUp.map((interval) => (
          <line
            key={`line-${interval.start}`}
            x1={x(interval.start) + 1}
            y1="16"
            x2={x(interval.end)}
            y2="16"
            className="tonight-timeline-moon-line"
          />
        ))}
        {darkEnd - darkStart > 90 ? (
          <text
            x={(darkStart + darkEnd) / 2}
            y="38"
            textAnchor="middle"
            className="tonight-timeline-night-label"
          >
            {words.night.darkness ?? words.night.label}
          </text>
        ) : null}
        {words.night.ticks.map((tick, index) => {
          const at = 6 + tick.at * width;
          const anchor =
            at < 20 ? "start" : at > 6 + width - 14 ? "end" : "middle";
          return (
            <g key={`${tick.label}-${index}`} className="tonight-timeline-tick">
              <line x1={at} y1="52" x2={at} y2="56" />
              <text x={at} y="68" textAnchor={anchor}>
                {tick.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// The level's shape — a square with 12 px corners: Excellente filled
// with a double tick, Favorable a tick, Variable a tilde, Défavorable
// a cross — never the colour alone.
const verdictGlyphs = {
  excellent: (
    <>
      <path d="M2.5 13l4 4L13 9.5" />
      <path d="M9 15.5l1.5 1.5L21.5 6.5" />
    </>
  ),
  favourable: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  variable: <path d="M3.5 12c2.5-4.5 5-4.5 8.5 0s6 4.5 8.5 0" />,
  poor: <path d="M6 6l12 12M18 6L6 18" />,
};

export function VerdictShape({ level, small = false }) {
  return (
    <span
      className={`tonight-verdict-shape${small ? " is-small" : ""}`}
      data-level={level}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24">{verdictGlyphs[level]}</svg>
    </span>
  );
}

// The hours' scores as a filigree behind the
// card (`verdictFiligreePath`), never focusable.
function VerdictFiligree({
  scores,
  times = null,
  nowMs = null,
  excluded = null,
}) {
  const path = verdictFiligreePath(scores);
  if (!path) return null;
  const index =
    times && times.length === scores.length
      ? tileCurveIndexAt(times, nowMs)
      : null;
  return (
    <>
      <svg
        className="tonight-verdict-filigree"
        viewBox="0 0 358 96"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        data-testid="tonight-verdict-filigree"
      >
        <path className="tonight-verdict-filigree-area" d={path.area} />
        <path className="tonight-verdict-filigree-line" d={path.line} />
        <ExcludedSpan excluded={excluded} width={358} height={96} />
      </svg>
      <ScoreNowDot
        className="tonight-verdict-now-layer"
        testId="tonight-verdict-now"
        point={index === null ? null : verdictFiligreePoint(scores, index)}
        width={358}
        height={96}
      />
    </>
  );
}

// "Heure par heure": the hours' scores, the bounds of the levels dotted,
// each hour's point in its level's tint.
function ScoreHourlyCurve({ hourly, nowMs = null }) {
  const left = 28;
  const right = 342;
  const top = 10;
  const bottom = 128;
  const rows = hourly.rows;
  const x = (index) =>
    rows.length === 1
      ? (left + right) / 2
      : left + ((right - left) * index) / (rows.length - 1);
  const y = (score) => top + ((bottom - top) * (100 - score)) / 100;
  const times = rows.map((row) => row.ms);
  const at = times.includes(null) ? null : tileCurveIndexAt(times, nowMs);
  const now =
    at === null
      ? null
      : curvePointOn(
          rows.map((row, index) => [x(index), y(row.score)]),
          at,
        );
  const path = rows
    .map((row, index) => {
      if (index === 0) return `M${x(0)} ${y(row.score)}`;
      const middle = (x(index - 1) + x(index)) / 2;
      return `C${middle} ${y(rows[index - 1].score)} ${middle} ${y(row.score)} ${x(index)} ${y(row.score)}`;
    })
    .join(" ");
  return (
    <div className="tonight-score-now-frame">
      <svg
        className="tonight-score-curve"
        viewBox="0 0 350 150"
        role="img"
        aria-label={hourly.label}
        data-testid="tonight-score-hourly-curve"
      >
        {[82, 64, 42].map((bound) => (
          <g key={bound}>
            <line
              className="tonight-score-bound"
              x1={left}
              x2={right}
              y1={y(bound)}
              y2={y(bound)}
            />
            <text x={left - 4} y={y(bound) + 3.5} textAnchor="end">
              {bound}
            </text>
          </g>
        ))}
        <path
          className="tonight-score-curve-area"
          d={`${path} L${x(rows.length - 1)} ${bottom} L${x(0)} ${bottom} Z`}
        />
        <path className="tonight-score-curve-line" d={path} />
        {rows.map((row, index) => (
          <circle
            key={row.time}
            className="tonight-score-point"
            data-level={row.level}
            cx={x(index)}
            cy={y(row.score)}
            r="3.2"
          />
        ))}
        {rows.map((row, index) =>
          index === 0 || index === rows.length - 1 || index % 3 === 0 ? (
            <text
              key={`label-${row.time}`}
              x={x(index)}
              y="144"
              textAnchor={
                index === rows.length - 1 && rows.length > 1 ? "end" : "middle"
              }
            >
              {row.time}
            </text>
          ) : null,
        )}
      </svg>
      <ScoreNowDot
        className="tonight-score-now-layer"
        testId="tonight-score-hourly-now"
        point={now}
        width={350}
        height={150}
      />
    </div>
  );
}

// The titles of a chart's axes — the quantity the abscissa measures
// with its unit under the ticks, "Poids (0–100)" up the ordinate.
function ScoreAxisTitles({ axis, baseline }) {
  return (
    <>
      <text
        className="tonight-score-axis-title"
        data-axis="x"
        x="168"
        y={baseline}
        textAnchor="middle"
      >
        {axis.x}
      </text>
      <text
        className="tonight-score-axis-title"
        data-axis="y"
        transform="rotate(-90)"
        x="-65"
        y="10"
        textAnchor="middle"
      >
        {axis.y}
      </text>
    </>
  );
}

// The weight (0–100) of a factor against its value: the chart of a section.
// The curve is solid, "valeur linéaire" dashed, the hours of the night are
// hollow points on the curve; the Moon draws one grey curve per phase and the
// night's own on top.
function ScoreFactorChart({ factor }) {
  const { chart } = factor;
  const from = chart.ticks[0];
  const to = chart.ticks[chart.ticks.length - 1];
  const x = (value) => 40 + (256 * (value - from)) / (to - from);
  const y = (weight) => 116 - (102 * weight) / 100;
  const line = (points) =>
    points.map((point) => `${x(point.x)},${y(point.weight)}`).join(" ");
  const dots = chart.dots.filter(
    (dot, index) =>
      chart.dots.findIndex(
        (other) => other.x === dot.x && other.weight === dot.weight,
      ) === index,
  );
  return (
    <svg
      className="tonight-score-chart"
      viewBox="0 0 308 150"
      role="img"
      aria-label={factor.chartTitle}
      data-chart="value"
      data-factor={factor.key}
    >
      {[0, 50, 100].map((weight) => (
        <g key={weight}>
          <line
            className="tonight-score-axis"
            x1="40"
            x2="296"
            y1={y(weight)}
            y2={y(weight)}
          />
          <text x="34" y={y(weight) + 4} textAnchor="end">
            {weight}
          </text>
        </g>
      ))}
      {chart.ticks.map((tick) => (
        <text key={tick} x={x(tick)} y="132" textAnchor="middle">
          {factor.key === "moon" ? `${tick}°` : tick}
        </text>
      ))}
      {chart.references.map((reference) => (
        <g key={reference.label}>
          <polyline
            className="tonight-score-reference"
            points={line(reference.points)}
          />
          <text
            x="294"
            y={y(reference.points[reference.points.length - 1].weight) - 4}
            textAnchor="end"
            data-reference={reference.label}
          >
            {reference.label}
          </text>
        </g>
      ))}
      {chart.linear ? (
        <polyline
          className="tonight-score-linear"
          data-linear="true"
          points={line(chart.linear)}
        />
      ) : null}
      {chart.curve ? (
        <polyline className="tonight-score-line" points={line(chart.curve)} />
      ) : null}
      {dots.map((dot) => (
        <circle
          key={`${dot.x}-${dot.weight}`}
          className="tonight-score-dot"
          cx={x(dot.x)}
          cy={y(dot.weight)}
          r="3.6"
        />
      ))}
      <ScoreAxisTitles axis={factor.axis} baseline={147} />
    </svg>
  );
}

// The weight hour by hour (100 = no nuisance); under each point the value
// written, under every third the hour. The point's ring takes the hour's
// level, and stays a ring in red mode.
function ScoreFactorCourse({ factor, nowMs = null }) {
  const points = factor.course.points;
  const x = (index) =>
    points.length === 1 ? 164 : 48 + (232 * index) / (points.length - 1);
  const y = (weight) => 112 - (98 * (weight ?? 100)) / 100;
  // The dot rides the drawn line; none without every hour's instant (an
  // hour without a weight is drawn at 100, as the line is).
  const times = points.map((point) => point.ms);
  const at = times.includes(null) ? null : tileCurveIndexAt(times, nowMs);
  const now =
    at === null
      ? null
      : polylinePointOn(
          points.map((point, index) => [x(index), y(point.weight)]),
          at,
        );
  return (
    <div className="tonight-score-now-frame">
      <svg
        className="tonight-score-chart"
        viewBox="0 0 308 162"
        role="img"
        aria-label={factor.course.title}
        data-chart="course"
        data-factor={factor.key}
      >
        {[0, 50, 100].map((weight) => (
          <g key={weight}>
            <line
              className="tonight-score-axis"
              x1="40"
              x2="296"
              y1={y(weight)}
              y2={y(weight)}
            />
            <text x="34" y={y(weight) + 4} textAnchor="end">
              {weight}
            </text>
          </g>
        ))}
        <polyline
          className="tonight-score-line"
          points={points
            .map((point, index) => `${x(index)},${y(point.weight)}`)
            .join(" ")}
        />
        {points.map((point, index) => (
          <g key={point.time}>
            <circle
              className="tonight-score-course-dot"
              data-level={point.level}
              cx={x(index)}
              cy={y(point.weight)}
              r="3.8"
            />
            <text
              className="tonight-score-course-value"
              x={x(index)}
              y="130"
              textAnchor="middle"
            >
              {point.label}
            </text>
            {index === 0 || index === points.length - 1 || index % 3 === 0 ? (
              <text
                x={x(index)}
                y="145"
                textAnchor={
                  index === points.length - 1 && points.length > 1
                    ? "end"
                    : "middle"
                }
              >
                {point.time}
              </text>
            ) : null}
          </g>
        ))}
        <ScoreAxisTitles axis={factor.course.axis} baseline={159} />
      </svg>
      <ScoreNowDot
        className="tonight-score-now-layer"
        testId={`tonight-score-course-now-${factor.key}`}
        point={now}
        width={308}
        height={162}
      />
    </div>
  );
}

// One section of "Comment la note est calculée": the factor's share of the
// loss, its rule, the weight against the value, the weight through the night.
function ScoreFactorCard({ factor, nowMs = null }) {
  return (
    <li className="tonight-score-factor" data-factor={factor.key}>
      <div className="tonight-score-factor-head">
        <h4 className="tonight-score-factor-name">{factor.name}</h4>
        {factor.part ? (
          <span className="tonight-score-factor-part">{factor.part}</span>
        ) : null}
      </div>
      <span className="tonight-score-share" aria-hidden="true">
        <span style={{ width: `${factor.share}%` }} />
      </span>
      <p className="tonight-muted">{factor.rule}</p>
      <p className="tonight-score-chart-title">{factor.chartTitle}</p>
      <ScoreFactorChart factor={factor} />
      <p className="tonight-score-legend" aria-hidden="true">
        {factor.legend.weight ? (
          <span>
            <svg width="26" height="8">
              <line
                className="tonight-score-line"
                x1="0"
                x2="26"
                y1="4"
                y2="4"
              />
            </svg>
            {factor.legend.weight}
          </span>
        ) : null}
        {factor.legend.linear ? (
          <span>
            <svg width="26" height="8">
              <line
                className="tonight-score-linear"
                x1="0"
                x2="26"
                y1="4"
                y2="4"
              />
            </svg>
            {factor.legend.linear}
          </span>
        ) : null}
        <span>
          <svg width="12" height="12">
            <circle className="tonight-score-dot" cx="6" cy="6" r="3.6" />
          </svg>
          {factor.legend.hours}
        </span>
      </p>
      <p className="tonight-score-chart-title">{factor.course.title}</p>
      <ScoreFactorCourse factor={factor} nowMs={nowMs} />
      {factor.course.mean ? (
        <p className="tonight-muted tonight-score-course-mean">
          {factor.course.mean}
        </p>
      ) : null}
    </li>
  );
}

// The sheet behind ⓘ.
export function ScoreSheet({
  sheet,
  locale,
  onClose,
  nowMs = null,
  before = null,
}) {
  return (
    <WebDialog
      className="tonight-verdict-dialog"
      closeLabel={sheet.close}
      closeOnBackdrop
      focusTitle
      title={<ScoreSheetTitle sheet={sheet} />}
      ariaLabel={sheet.title}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn-tertiary tonight-score-close"
          onClick={onClose}
        >
          {sheet.close}
        </button>
      }
    >
      <ScoreSheetBody
        sheet={sheet}
        locale={locale}
        nowMs={nowMs}
        before={before}
      />
    </WebDialog>
  );
}

/** The sheet's title: the level's shape, the word and the score. */
export function ScoreSheetTitle({ sheet }) {
  return (
    <span className="tonight-score-title" data-testid="tonight-score-title">
      {sheet.level ? <VerdictShape level={sheet.level} /> : null}
      <span>{sheet.word}</span>
      <span className="tonight-verdict-score">
        {sheet.score}
        <span>/100</span>
      </span>
    </span>
  );
}

/**
 * The body of [NOTE] (reused under the calendar of
 * "Conditions à {lieu}", not copied); `before` goes right after the
 * sentence (the link "Voir les conditions à {lieu}"), `measured` adds the
 * line that says a past night's note is worked out from measured values.
 */
export function ScoreSheetBody({
  sheet,
  locale,
  nowMs = null,
  before = null,
  measured = null,
}) {
  // The hour whose detail is open (a touch on a row of the table).
  const [detail, setDetail] = useState(null);
  return (
    <div
      className="tonight-score-sheet"
      data-testid="tonight-score-sheet"
      data-level={sheet.level || undefined}
    >
      <p className="tonight-score-sentence">{sheet.sentence}</p>
      {sheet.uncertain ? (
        <p
          className="tonight-score-uncertain"
          data-testid="tonight-score-uncertain"
        >
          {sheet.uncertain.why}
        </p>
      ) : null}
      {before}
      {measured ? (
        <p
          className="tonight-score-measured"
          data-testid="tonight-score-measured"
        >
          {measured}
        </p>
      ) : null}
      {sheet.thirds ? (
        <section
          className="tonight-score-thirds"
          data-testid="tonight-score-thirds"
          aria-labelledby="tonight-score-thirds-title"
        >
          <h3 id="tonight-score-thirds-title">{sheet.thirds.title}</h3>
          <ul>
            {sheet.thirds.parts.map((third) => (
              <li
                key={third.part}
                className="tonight-score-third"
                data-level={third.level}
              >
                <span className="tonight-score-third-name">{third.name}</span>
                <span className="tonight-score-third-hours">{third.hours}</span>
                <span className="tonight-score-third-score">{third.score}</span>
                <span className="tonight-score-third-reason">
                  {third.reason}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {sheet.hourly ? (
        <section
          aria-label={sheet.hourly.title}
          data-section="hourly"
          className="tonight-score-section"
        >
          <h3>{sheet.hourly.title}</h3>
          {sheet.hourly.updated ? (
            <p
              className="tonight-muted tonight-score-updated"
              data-testid="tonight-score-updated"
            >
              {sheet.hourly.updated}
            </p>
          ) : null}
          <ScoreHourlyCurve hourly={sheet.hourly} nowMs={nowMs} />
          <div
            className="tonight-score-table-scroll"
            role="region"
            aria-label={sheet.hourly.title}
            tabIndex={0}
            data-testid="tonight-score-table-scroll"
          >
            <table className="tonight-score-table">
              <thead>
                <tr>
                  <th scope="col">{sheet.hourly.columns.hour}</th>
                  <th scope="col">{sheet.hourly.columns.score}</th>
                  {sheet.hourly.columns.factors.map((column) => (
                    <th key={column.key} scope="col" data-factor={column.key}>
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.hourly.rows.map((row) => (
                  <tr
                    key={row.time}
                    className="tonight-score-row"
                    // A touch (or Enter) on the row opens that hour's detail.
                    // No button: the sheet has none but "Fermer".
                    tabIndex={0}
                    aria-haspopup="dialog"
                    onClick={() => setDetail(row)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setDetail(row);
                    }}
                  >
                    <th scope="row">{row.time}</th>
                    <td className="tonight-score-cell" data-level={row.level}>
                      {row.score}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.key} data-factor={cell.key}>
                        {cell.text}
                        {cell.lost !== null ? (
                          <span className="tonight-score-lost">
                            {`\u2212${cell.lost}`}
                          </span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tonight-muted tonight-score-mean">
            {sheet.hourly.mean}
          </p>
        </section>
      ) : null}
      {detail ? (
        <HourDetailDialog
          row={detail.hour}
          title={detail.time}
          locale={locale}
          onClose={() => setDetail(null)}
        />
      ) : null}
      <section
        aria-label={sheet.how.title}
        data-section="how"
        className="tonight-score-section"
      >
        <h3>{sheet.how.title}</h3>
        <p>{sheet.how.intro}</p>
        {sheet.how.loss ? (
          <div className="tonight-score-loss" data-testid="tonight-score-loss">
            <p className="tonight-score-loss-title">{sheet.how.loss.title}</p>
            {sheet.how.loss.rows.map((row) => (
              <div
                key={row.key}
                className="tonight-score-loss-row"
                data-factor={row.key}
              >
                <span className="tonight-score-loss-name">{row.name}</span>
                <span className="tonight-score-share" aria-hidden="true">
                  <span style={{ width: `${row.share}%` }} />
                </span>
                <span className="tonight-score-loss-text">{row.text}</span>
              </div>
            ))}
          </div>
        ) : null}
        <p className="tonight-muted">{sheet.how.noAverage}</p>
        {sheet.how.worked ? (
          <p
            className="tonight-score-worked"
            data-testid="tonight-score-worked"
          >
            <b>{sheet.how.worked.at}</b>
            {sheet.how.worked.body} <b>{sheet.how.worked.result}</b>
          </p>
        ) : null}
        <ul className="tonight-score-factors">
          {sheet.how.factors.map((factor) => (
            <ScoreFactorCard key={factor.key} factor={factor} nowMs={nowMs} />
          ))}
        </ul>
        <p className="tonight-muted">{sheet.how.notCounted}</p>
      </section>
      <section
        aria-label={sheet.levels.title}
        data-section="levels"
        className="tonight-score-section"
      >
        <h3>{sheet.levels.title}</h3>
        <ul className="tonight-verdict-levels">
          {sheet.levels.list.map((entry) => (
            <li key={entry.level} data-level={entry.level}>
              <VerdictShape level={entry.level} small />
              <span className="tonight-verdict-level-word">{entry.word}</span>
              <span className="tonight-muted tonight-numbers">
                {entry.range}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <InfoSources locale={locale} lines={sheet.sources} />
    </div>
  );
}

// When the forecast did not come — no connection, or the
// service does not answer — each box that depends on it stays and says so in
// one line, "Service indisponible", with an ⓘ: the reason, the last good
// time and "Réessayer" (a link).
// The card "Note de la nuit" has the page's retry; the tiles and the hourly
// strip are drawn by parts that are not given it, so the card hands it over
// here while it is on the page.
let forecastRetry = null;

function useForecastRetry(onRetry) {
  useEffect(() => {
    forecastRetry = onRetry || null;
    return () => {
      if (forecastRetry === onRetry) forecastRetry = null;
    };
  }, [onRetry]);
}

// The badge is a link of the family (`btn-link`: it goes to see why, and offers the retry). It keeps the
// page's warning tone and its small size through the level's own variables
// (`--btn-text`, `--btn-pad-*`, `--btn-font-size`), never a colour of its own.
const weatherBadgeStyle = {
  "--btn-text": "var(--warning)",
  "--btn-text-hover": "var(--warning)",
  "--btn-min-height": "0",
  "--btn-pad-x": "0",
  "--btn-pad-y": "0.35rem",
  "--btn-font-size": "0.75rem",
  justifyContent: "flex-start",
  gap: "0.3rem",
  lineHeight: 1.3,
  textAlign: "start",
};

// [compact]: without the cloud glyph, for the half-width tiles, where the line
// would otherwise break in two.
export function WeatherUnavailableBadge({
  down,
  onRetry = null,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  if (!down) return null;
  const retry = onRetry || forecastRetry;
  return (
    <>
      <button
        type="button"
        className="btn-link tonight-weather-badge"
        data-testid="weather-unavailable-badge"
        aria-haspopup="dialog"
        style={weatherBadgeStyle}
        onClick={() => setOpen(true)}
      >
        {compact ? null : (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z" />
            <path d="M4 4l16 16" />
          </svg>
        )}
        <span>{down.badge}</span>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <WebDialog
          className="tonight-weather-dialog"
          closeLabel={down.close}
          closeOnBackdrop
          focusTitle
          title={down.badge}
          ariaLabel={down.badge}
          onClose={() => setOpen(false)}
          footer={
            <button
              type="button"
              className="btn-tertiary"
              onClick={() => setOpen(false)}
            >
              {down.close}
            </button>
          }
        >
          <div data-testid="weather-unavailable-sheet">
            <p>{down.reason}</p>
            {down.lastGood ? <p>{down.lastGood}</p> : null}
            {retry ? (
              <p style={{ textAlign: "end" }}>
                <button
                  type="button"
                  className="btn-link"
                  data-testid="weather-unavailable-retry"
                  onClick={() => {
                    setOpen(false);
                    retry();
                  }}
                >
                  {down.retry}
                </button>
              </p>
            ) : null}
          </div>
        </WebDialog>
      ) : null}
    </>
  );
}

// The hourly strip's box when there are no hours to draw: its title and the
// badge, in the strip's place.
function HourlyUnavailable({ down }) {
  return (
    <section
      aria-label={down.hourlyTitle}
      className="tonight-card tonight-hourly"
      data-testid="tonight-hourly-unavailable"
      style={{ margin: 0, padding: "8px 12px 10px" }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "15px",
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {down.hourlyTitle}
      </h3>
      <WeatherUnavailableBadge down={down} />
    </section>
  );
}

/**
 * The access card of [NOTE]: the
 * calendar icon, "Conditions à {lieu}" (two lines at most), the one subtitle
 * every profile reads — "Seize jours de prévisions, les nuits passées", even
 * where the past nights show the Moon only — and a chevron; the whole card is
 * the link toward [COND] on the night's date.
 */
export function ConditionsAccessCard({ conditions }) {
  return (
    <a
      className="tonight-score-conditions"
      data-testid="tonight-score-conditions"
      href={conditions.href}
    >
      <svg
        className="tonight-score-conditions-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
      </svg>
      <span className="tonight-score-conditions-text">
        <strong>{conditions.title}</strong>
        <small>{conditions.subtitle}</small>
      </span>
      <svg
        className="tonight-score-conditions-chevron"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </a>
  );
}

// One card "Note de la nuit", the same height in its three states — the
// score in the level's tint over the hours' filigree; the star while it is
// computed; the reason when it cannot be.
export function VerdictSection({
  words,
  locale,
  onRetry,
  chooseHref,
  onUseIdeal = null,
  onWholeNight = null,
  now = null,
  conditions = null,
}) {
  const [open, setOpen] = useState(false);
  const nowMs = useMinuteNow(now);
  useForecastRetry(onRetry);
  const verdict = words.verdict;
  if (!verdict) return null;
  if (verdict.state === "waiting")
    return (
      <section
        aria-label={verdict.title}
        aria-busy="true"
        className="tonight-card tonight-verdict is-state"
        data-testid="tonight-verdict"
        data-state="waiting"
      >
        <span className="tonight-verdict-lead">
          <BrandLoader size={36} />
        </span>
        <div className="tonight-verdict-text" aria-live="polite">
          <p className="tonight-verdict-word">{verdict.waiting.title}</p>
          {verdict.waiting.line ? (
            <p className="tonight-verdict-reason">{verdict.waiting.line}</p>
          ) : null}
        </div>
      </section>
    );
  if (verdict.state === "unavailable")
    return (
      <section
        aria-label={verdict.title}
        aria-busy="false"
        className="tonight-card tonight-verdict is-state"
        data-testid="tonight-verdict"
        data-state="unavailable"
      >
        <span className="tonight-verdict-lead" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 11.1 3.5 3.5 0 0 0 7 18z" />
            <path d="M4 4l16 16" />
          </svg>
        </span>
        <div className="tonight-verdict-text">
          <p className="tonight-verdict-word">{verdict.unavailable.title}</p>
          <p
            className="tonight-verdict-reason"
            data-testid="tonight-verdict-reason"
          >
            {verdict.unavailable.reason}
          </p>
          {words.weatherDown && verdict.unavailable.retry ? (
            <WeatherUnavailableBadge
              down={words.weatherDown}
              onRetry={onRetry}
            />
          ) : null}
        </div>
        {verdict.unavailable.retry ? (
          <button type="button" className="btn-link" onClick={onRetry}>
            {verdict.unavailable.retry}
          </button>
        ) : verdict.unavailable.choose && chooseHref ? (
          <a className="btn-link" href={chooseHref}>
            {verdict.unavailable.choose}
          </a>
        ) : null}
      </section>
    );
  // The whole card is one button that opens the sheet (a
  // button laid over the card, under the link and the ⓘ); the link of the
  // slot is its own, deeper target; the ⓘ stays as the cue,
  // in the top right corner.
  const slot = verdict.slot;
  const slotAction = slot
    ? slot.kind === "chosen"
      ? onWholeNight
      : onUseIdeal
        ? () => onUseIdeal({ start: slot.start, end: slot.end })
        : null
    : null;
  return (
    <section
      aria-label={verdict.title}
      className="tonight-card tonight-verdict"
      data-testid="tonight-verdict"
      data-state="ready"
      data-level={verdict.level}
    >
      <button
        type="button"
        className="tonight-verdict-hit"
        data-testid="tonight-verdict-card"
        aria-label={`${verdict.title}, ${verdict.score}/100, ${verdict.word}${verdict.uncertain ? ` (${verdict.uncertainWord})` : ""}. ${verdict.sentence || ""}`}
        aria-description={verdict.hint}
        onClick={() => setOpen(true)}
      />
      <VerdictFiligree
        scores={verdict.scores}
        times={verdict.times}
        nowMs={nowMs}
        excluded={verdict.excluded}
      />
      <p className="tonight-verdict-figure" aria-hidden="true">
        <span
          className="tonight-verdict-figure-score"
          data-testid="tonight-verdict-score"
        >
          {verdict.score}
        </span>
        <span className="tonight-verdict-figure-out">/100</span>
      </p>
      <div className="tonight-verdict-body">
        <div className="tonight-verdict-text" aria-hidden="true">
          <p className="tonight-verdict-word">{verdict.word}</p>
          {verdict.uncertain && (
            <p
              className="tonight-verdict-uncertain"
              data-testid="tonight-verdict-uncertain"
              title={verdict.uncertainInfo}
            >
              {verdict.uncertainWord}
            </p>
          )}
          <p className="tonight-verdict-sentence">{verdict.sentence}</p>
        </div>
        {slot && slotAction ? (
          <p
            className="tonight-verdict-slot"
            data-testid={`tonight-verdict-${slot.kind}`}
          >
            <span className="tonight-verdict-slot-label">
              {slot.label} <span>{slot.range}</span>
            </span>
            {slot.kind === "ideal" ? (
              // The link becomes a 20 px icon of
              // the text's colour in a 44 px zone, named by the same words.
              <button
                type="button"
                className="tonight-verdict-slot-icon"
                data-testid={`tonight-verdict-${slot.kind}-link`}
                aria-label={slot.link}
                title={slot.link}
                onClick={slotAction}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.5 5v14M20.5 5v14M7.5 12h9M7.5 12l3-3M7.5 12l3 3M16.5 12l-3-3M16.5 12l-3 3" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn-link tonight-verdict-slot-link"
                data-testid={`tonight-verdict-${slot.kind}-link`}
                onClick={slotAction}
              >
                {slot.link}
              </button>
            )}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="tonight-verdict-info"
        aria-label={verdict.info}
        title={verdict.info}
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open ? (
        <ScoreSheet
          sheet={verdict.dialog}
          locale={locale}
          nowMs={nowMs}
          onClose={() => setOpen(false)}
          before={
            // The link "Voir les
            // conditions à {lieu}" became an access card — calendar icon,
            // "Conditions à {lieu}", one subtitle for everyone, chevron — toward
            // [COND] on the night's date. The whole card is the link.
            conditions ? <ConditionsAccessCard conditions={conditions} /> : null
          }
        />
      ) : null}
    </section>
  );
}

// "La nuit": the threshold's label (with, on "Cette nuit", the `tune` icon at
// its right), the window and the length, the timeline, then the six tiles
// Nuages, Précipitations, Vent, Rosée, Visibilité, Lune; [children] (the hourly
// strip) close the section. The planner's "Prévision astronomique" draws the
// night as one line, without its timeline and without the `tune` icon: "Durée
// de la nuit" sits just above it with its own threshold and chart (one darkness
// entry per screen).
export function NightZone({
  words,
  overview,
  darknessSetting = null,
  timeline = true,
  children = null,
  now = null,
  onChooseSlot = null,
  onWholeNight = null,
}) {
  const nowMs = useMinuteNow(now);
  return (
    <section aria-label={words.nightZone} className="tonight-night">
      <div className="tonight-card tonight-night-card">
        <div className="tonight-night-label-row">
          <p className="tonight-muted tonight-night-label">
            {words.night.label}
          </p>
          <span className="tonight-night-buttons">
            {darknessSetting}
            {/* The slot of the night, at the right of the
                threshold's button, the same size and grey. */}
            {onChooseSlot ? (
              <button
                type="button"
                className="tonight-night-threshold tonight-night-slot"
                data-testid="tonight-night-slot-button"
                aria-label={words.night.choose}
                title={words.night.choose}
                onClick={onChooseSlot}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 12h18" />
                  <rect x="6" y="8" width="3" height="8" rx="1.5" />
                  <rect x="15" y="8" width="3" height="8" rx="1.5" />
                </svg>
              </button>
            ) : null}
          </span>
        </div>
        <div className="tonight-night-head">
          <p className="tonight-night-window">{words.night.window}</p>
          <p className="tonight-night-duration">{words.night.duration}</p>
        </div>
        {timeline ? <NightTimeline overview={overview} words={words} /> : null}
        {words.night.slot ? (
          <div className="tonight-night-slot-note">
            <p
              className="tonight-muted"
              data-testid="tonight-night-slot-follows"
            >
              {words.night.slot.follows}
            </p>
            {onWholeNight ? (
              <button
                type="button"
                className="btn-link"
                data-testid="tonight-night-whole-night"
                onClick={onWholeNight}
              >
                {words.night.slot.wholeNight}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="tonight-tiles">
        {words.tiles.map((tile) => (
          <div
            key={tile.key}
            className="tonight-card tonight-tile"
            data-tile={tile.key}
          >
            <TileCurve
              tile={tile.key}
              values={tile.curve}
              excluded={
                overview?.slot
                  ? tonightSlotShare(tile.curveTimes, overview.slot)
                  : null
              }
            />
            <TileNowDot
              tile={tile.key}
              values={tile.curve}
              times={tile.curveTimes}
              nowMs={nowMs}
            />
            <p className="tonight-tile-label">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {tileIcons[tile.key]}
              </svg>
              <span>{tile.label}</span>
            </p>
            <p className="tonight-tile-value">{tile.value}</p>
            {tile.down && words.weatherDown ? (
              <div className="tonight-tile-detail">
                <WeatherUnavailableBadge down={words.weatherDown} compact />
              </div>
            ) : (
              <p className="tonight-tile-detail">{tile.detail}</p>
            )}
          </div>
        ))}
      </div>
      {children ||
        (words.weatherDown ? (
          <HourlyUnavailable down={words.weatherDown} />
        ) : null)}
    </section>
  );
}
