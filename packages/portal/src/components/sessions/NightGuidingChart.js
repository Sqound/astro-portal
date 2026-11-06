"use client";

import { message } from "portal/i18n.js";
import { InfoButton, InfoLine } from "../dialog/InfoButton.js";
import { HourAxis, TargetBand } from "./NightQualityCharts.js";
import {
  arcsecText,
  axisClock,
  guidingCountsLine,
  guidingMarks,
  guidingSources,
  hasGuiding,
  numberText,
  say,
  seriesPaths,
  targetBands,
  timeAxis,
} from "./night-detail-view.js";

/**
 * « Guidage » of the page of a night: RMS total, AD and Déc over the
 * whole night (the report v3's own RMS when it has one), its hours the
 * place's (`zone`; UTC without one), the old screen's counts in one line (guided time, dithers,
 * focus runs, meridian flips, expired settles), and the series by slices of
 * 2 minutes (`guidingSeries` of the service) over the night's axis, the
 * targets above, the dithers as triangles, the focus runs as rings and the
 * meridian flip as a dashed line: in red mode the shapes keep the kinds
 * apart. Without guiding: one line + ⓘ, never an invented chart.
 */

const WIDTH = 1000;
const HEIGHT = 190;
const LEFT = 34;
const PLOT = { top: 12, bottom: 160 };

export const GUIDING_SERIES = [
  {
    field: "rmsTotal",
    legend: "nightPageLegendTotal",
    className: "is-rms-total",
  },
  { field: "rmsRa", legend: "nightPageLegendRa", className: "is-rms-ra" },
  { field: "rmsDec", legend: "nightPageLegendDec", className: "is-rms-dec" },
];

/** The gridlines of the RMS axis: every 0.5″ up to the top of the series. */
export function rmsTicks(series) {
  const values = series.flatMap((slice) =>
    GUIDING_SERIES.map((entry) => slice?.[entry.field]).filter(
      (value) => typeof value === "number" && Number.isFinite(value),
    ),
  );
  const top = Math.max(
    1,
    Math.ceil((Math.max(0, ...values) * 1.1) / 0.5) * 0.5,
  );
  const ticks = [];
  for (let value = 0.5; value <= top + 1e-9; value += 0.5) ticks.push(value);
  return { top, ticks };
}

export function NightGuidingSection({
  locale = "en",
  summary,
  series = [],
  report = null,
  bounds,
  passages = [],
  titleOf = (id) => id,
  zone = null,
}) {
  if (!hasGuiding(summary, series))
    return (
      <section
        className="night-card night-guiding"
        aria-labelledby="night-guiding-title"
      >
        <h2 id="night-guiding-title">
          {message(locale, "nightPageGuidingTitle")}
        </h2>
        <InfoLine
          locale={locale}
          className="night-card-line"
          text={message(locale, "nightPageNoGuiding")}
          label={message(locale, "nightPageGuidingInfoLabel")}
          title={message(locale, "nightPageGuidingTitle")}
          body={message(locale, "nightPageNoGuidingInfo")}
        />
      </section>
    );
  const sources = guidingSources(report);
  // The hours of the place (UTC without a zone), like the rest of the page.
  const axis = timeAxis(
    bounds?.start,
    bounds?.end,
    WIDTH - LEFT - 6,
    LEFT,
    zone,
  );
  const { top, ticks } = rmsTicks(series);
  const y = (value) => PLOT.bottom - (value / top) * (PLOT.bottom - PLOT.top);
  const marks = guidingMarks(report, axis);
  const bands = targetBands(passages, axis, titleOf);
  return (
    <section
      className="night-card night-guiding"
      aria-labelledby="night-guiding-title"
    >
      <h2 id="night-guiding-title">
        {message(locale, "nightPageGuidingTitle")}
      </h2>
      <div className="info-line night-card-line">
        <p className="info-line-text">
          {sources
            ? say(locale, "nightPageGuidingLine", { sources })
            : message(locale, "nightPageGuidingLineNoSource")}
        </p>
        <InfoButton
          locale={locale}
          label={message(locale, "nightPageGuidingInfoLabel")}
          title={message(locale, "nightPageGuidingTitle")}
          body={message(locale, "nightPageGuidingInfo")}
        />
      </div>
      <dl className="night-figures is-three">
        {[
          ["nightPageRmsTotal", summary.rmsTotalArcsec],
          ["nightPageRmsRa", summary.rmsRaArcsec],
          ["nightPageRmsDec", summary.rmsDecArcsec],
        ].map(([label, value]) => (
          <div key={label} className="night-figure">
            <dt>{message(locale, label)}</dt>
            <dd>{arcsecText(value, locale)}</dd>
          </div>
        ))}
      </dl>
      <p className="night-guiding-counts">
        {guidingCountsLine(summary, locale)}
      </p>
      {axis && series.length ? (
        <figure
          className="night-guiding-chart"
          role="img"
          aria-label={message(locale, "nightPageGuidingChart")}
        >
          <TargetBand bands={bands} axis={axis} width={WIDTH} />
          <svg
            className="night-chart-plot"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            aria-hidden="true"
          >
            <rect
              className="night-chart-frame"
              x={LEFT}
              y={0.5}
              width={WIDTH - LEFT - 6}
              height={PLOT.bottom + 8}
              rx={4}
            />
            {ticks.map((value) => (
              <g key={value}>
                <line
                  className="night-chart-grid"
                  x1={LEFT}
                  x2={WIDTH - 6}
                  y1={y(value)}
                  y2={y(value)}
                />
                <text
                  className="night-chart-tick"
                  x={LEFT - 4}
                  y={y(value) + 3}
                  textAnchor="end"
                >
                  {`${numberText(value, locale, 1)}″`}
                </text>
              </g>
            ))}
            {marks.flips.map((t) => (
              <g key={`flip-${t}`} className="night-chart-flip">
                <line
                  x1={axis.x(t)}
                  x2={axis.x(t)}
                  y1={2}
                  y2={PLOT.bottom + 6}
                />
                <text x={axis.x(t) + 5} y={13}>
                  {say(locale, "nightPageFlipAt", {
                    time: axisClock(axis, t),
                  })}
                </text>
              </g>
            ))}
            {GUIDING_SERIES.map((entry) =>
              seriesPaths(series, entry.field, axis, y).map((points, index) => (
                <polyline
                  key={`${entry.field}-${index}`}
                  className={`night-chart-series ${entry.className}`}
                  points={points}
                />
              )),
            )}
            {marks.focus.map((t) => (
              <circle
                key={`focus-${t}`}
                className="night-chart-focus"
                cx={axis.x(t)}
                cy={PLOT.top + 4}
                r={4}
              />
            ))}
            {marks.dithers.map((t) => (
              <polygon
                key={`dither-${t}`}
                className="night-chart-dither"
                points={`${axis.x(t) - 3.5},${PLOT.bottom + 6} ${axis.x(t) + 3.5},${PLOT.bottom + 6} ${axis.x(t)},${PLOT.bottom}`}
              />
            ))}
          </svg>
          <HourAxis axis={axis} width={WIDTH} />
          <ul className="night-chart-legend">
            {GUIDING_SERIES.map((entry) => (
              <li key={entry.field} className={`is-line ${entry.className}`}>
                <i aria-hidden="true" />
                {message(locale, entry.legend)}
              </li>
            ))}
            <li className="is-dither">
              <i aria-hidden="true" />
              {message(locale, "nightPageLegendDither")}
            </li>
            <li className="is-focus">
              <i aria-hidden="true" />
              {message(locale, "nightPageLegendFocus")}
            </li>
            <li className="is-flip">
              <i aria-hidden="true" />
              {message(locale, "nightPageLegendFlip")}
            </li>
          </ul>
        </figure>
      ) : null}
    </section>
  );
}
