"use client";

import { message } from "portal/i18n.js";
import { InfoButton, InfoLine } from "../dialog/InfoButton.js";
import {
  aduText,
  filterText,
  framePoints,
  fwhmText,
  hasQuality,
  hourTicks,
  numberText,
  targetBands,
  timeAxis,
  valueRange,
} from "./night-detail-view.js";

/**
 * « Qualité » of the page of a night: the
 * night's medians — FWHM in pixels and in arcseconds when the scale is known
 * (« 2,6 px · 8,1″ »), eccentricity, sky background, frames measured,
 * and, when the producer gave them, the old portal's background noise and
 * star count — one line per step, and one dot
 * per frame over the whole night in three strips sharing the night's axis,
 * the targets above. Without any measure: one line + ⓘ that says why.
 * Inline SVG, no chart library.
 */

const STRIP_WIDTH = 940;
const STRIP_HEIGHT = 64;
export const QUALITY_MEASURES = [
  {
    key: "fwhmPixels",
    label: "nightPageFwhmPx",
    median: (night) => night.fwhmPixels,
    digits: 1,
    className: "is-fwhm",
  },
  {
    key: "eccentricity",
    label: "nightPageEccentricity",
    median: (night) => night.eccentricity,
    digits: 2,
    className: "is-eccentricity",
  },
  {
    key: "skyBackgroundAdu",
    label: "nightPageBackgroundAdu",
    median: (night) => night.skyBackgroundAdu,
    digits: 0,
    className: "is-background",
  },
];

/** The band of the targets above the strips (shared with « Guidage »). */
export function TargetBand({
  bands,
  axis,
  width,
  height = 22,
  className = "",
}) {
  return (
    <svg
      className={`night-chart-band ${className}`.trim()}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {bands.map((band) => (
        <g key={band.key}>
          <rect
            x={axis.x(band.from) + 1}
            y={1}
            width={Math.max(0, axis.x(band.to) - axis.x(band.from) - 2)}
            height={height - 2}
            rx={4}
          />
          <text
            x={(axis.x(band.from) + axis.x(band.to)) / 2}
            y={height / 2 + 4}
            textAnchor="middle"
          >
            {band.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The hours under a chart. */
export function HourAxis({ axis, width, height = 22 }) {
  return (
    <svg
      className="night-chart-axis"
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {hourTicks(axis).map((tick) => (
        <text key={tick.t} x={axis.x(tick.t)} y={14} textAnchor="middle">
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

function Strip({ locale, measure, rows, median, axis }) {
  const points = framePoints(rows, measure.key);
  const range = valueRange(points);
  const y = (value) =>
    range
      ? 6 +
        (1 - (value - range.low) / (range.high - range.low)) *
          (STRIP_HEIGHT - 12)
      : STRIP_HEIGHT / 2;
  return (
    <div className={`night-quality-strip ${measure.className}`}>
      <div className="night-quality-strip-label">
        <span>{message(locale, measure.label)}</span>
        <strong>{numberText(median, locale, measure.digits)}</strong>
        <span className="night-row-muted">
          {message(locale, "nightPageMedian")}
        </span>
      </div>
      <svg
        className="night-chart-strip"
        viewBox={`0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
        aria-hidden="true"
      >
        <rect
          className="night-chart-frame"
          x={0.5}
          y={0.5}
          width={STRIP_WIDTH - 1}
          height={STRIP_HEIGHT - 1}
          rx={4}
        />
        {median !== null && median !== undefined && range ? (
          <line
            className="night-chart-median"
            x1={0}
            x2={STRIP_WIDTH}
            y1={y(median)}
            y2={y(median)}
          />
        ) : null}
        {points.map((point) => (
          <circle
            key={point.t}
            className="night-chart-dot"
            cx={axis.x(point.t).toFixed(1)}
            cy={y(point.value).toFixed(1)}
            r={2.3}
          />
        ))}
      </svg>
    </div>
  );
}

export function NightQualitySection({
  locale = "en",
  summary,
  report = null,
  steps = [],
  names = {},
  bounds,
  passages = [],
  titleOf = (id) => id,
  zone = null,
}) {
  if (!hasQuality(summary))
    return (
      <section
        className="night-card night-quality"
        aria-labelledby="night-quality-title"
      >
        <h2 id="night-quality-title">
          {message(locale, "nightPageQualityTitle")}
        </h2>
        <InfoLine
          locale={locale}
          className="night-card-line"
          text={message(locale, "nightPageNoQuality")}
          label={message(locale, "nightPageQualityInfoLabel")}
          title={message(locale, "nightPageQualityTitle")}
          body={message(locale, "nightPageNoQualityInfo")}
        />
      </section>
    );
  const night = summary.night;
  const figures = [
    {
      key: "fwhm",
      label: "nightPageFwhm",
      value: `${numberText(night.fwhmPixels, locale, 1)} px`,
      extra:
        night.fwhmArcsec === null || night.fwhmArcsec === undefined
          ? null
          : `· ${numberText(night.fwhmArcsec, locale, 1)}″`,
    },
    {
      key: "eccentricity",
      label: "nightPageEccentricity",
      value: numberText(night.eccentricity, locale, 2),
    },
    {
      key: "background",
      label: "nightPageBackground",
      value: aduText(night.skyBackgroundAdu, locale),
    },
    ...(night.skyBackgroundNoiseAdu !== null &&
    night.skyBackgroundNoiseAdu !== undefined
      ? [
          {
            key: "noise",
            label: "nightPageBackgroundNoise",
            value: `${numberText(night.skyBackgroundNoiseAdu, locale, 1)} ADU`,
          },
        ]
      : []),
    ...(night.starCount !== null && night.starCount !== undefined
      ? [
          {
            key: "stars",
            label: "nightPageStarCount",
            value: numberText(night.starCount, locale, 0),
          },
        ]
      : []),
    {
      key: "frames",
      label: "nightPageMeasuredFrames",
      value: String(night.measuredFrames),
    },
  ];
  const byId = new Map(steps.map((step) => [step.id, step]));
  const hints = new Map(
    (report?.acquisitionSteps ?? []).map((step) => [step.key, step.targetHint]),
  );
  const stepName = (row) => {
    const step = row.stepId ? byId.get(row.stepId) : null;
    const target = step?.targetId
      ? (names[step.targetId] ?? step.targetId)
      : (hints.get(row.stepKey) ?? null);
    return {
      target: target ?? message(locale, "nightPageStepNoTarget"),
      filter: filterText(step ? step.filter : row.filter, locale),
    };
  };
  const axis = timeAxis(bounds?.start, bounds?.end, STRIP_WIDTH, 0, zone);
  const rows = report?.quality ?? [];
  const bands = targetBands(passages, axis, titleOf);
  return (
    <section
      className="night-card night-quality"
      aria-labelledby="night-quality-title"
    >
      <h2 id="night-quality-title">
        {message(locale, "nightPageQualityTitle")}
      </h2>
      <div className="info-line night-card-line">
        <p className="info-line-text">
          {message(locale, "nightPageQualityLine")}
        </p>
        <InfoButton
          locale={locale}
          label={message(locale, "nightPageQualityInfoLabel")}
          title={message(locale, "nightPageQualityTitle")}
          body={message(locale, "nightPageQualityInfo")}
        />
      </div>
      <dl className="night-figures">
        {figures.map((figure) => (
          <div key={figure.key} className="night-figure">
            <dt>{message(locale, figure.label)}</dt>
            <dd>
              {figure.value}
              {figure.extra ? (
                <span className="night-figure-extra"> {figure.extra}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {summary.byStep?.length ? (
        <table className="night-table night-quality-table">
          <thead>
            <tr>
              <th scope="col">{message(locale, "nightPageQualityStep")}</th>
              <th scope="col">{message(locale, "nightPageFwhm")}</th>
              <th scope="col">{message(locale, "nightPageEccentricity")}</th>
              <th scope="col">{message(locale, "nightPageBackground")}</th>
              <th scope="col">{message(locale, "nightPageColumnFrames")}</th>
            </tr>
          </thead>
          <tbody>
            {summary.byStep.map((row) => {
              const name = stepName(row);
              return (
                <tr key={row.stepKey}>
                  <th scope="row">
                    <strong>{name.target}</strong>
                    <span> · {name.filter}</span>
                  </th>
                  <td>{fwhmText(row.fwhmPixels, row.fwhmArcsec, locale)}</td>
                  <td>{numberText(row.eccentricity, locale, 2)}</td>
                  <td>{aduText(row.skyBackgroundAdu, locale)}</td>
                  <td>{row.measuredFrames}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
      {axis && rows.length ? (
        <figure
          className="night-quality-chart"
          role="img"
          aria-label={message(locale, "nightPageQualityChart")}
        >
          <div className="night-quality-strip is-band">
            <span />
            <TargetBand bands={bands} axis={axis} width={STRIP_WIDTH} />
          </div>
          {QUALITY_MEASURES.map((measure) => (
            <Strip
              key={measure.key}
              locale={locale}
              measure={measure}
              rows={rows}
              median={measure.median(night)}
              axis={axis}
            />
          ))}
          <div className="night-quality-strip is-axis">
            <span />
            <HourAxis axis={axis} width={STRIP_WIDTH} />
          </div>
          <ul className="night-chart-legend">
            <li className="is-fwhm">
              <i aria-hidden="true" />
              {message(locale, "nightPageFwhm")}
            </li>
            <li className="is-eccentricity">
              <i aria-hidden="true" />
              {message(locale, "nightPageEccentricity")}
            </li>
            <li className="is-background">
              <i aria-hidden="true" />
              {message(locale, "nightPageBackground")}
            </li>
            <li className="is-median">
              <i aria-hidden="true" />
              {message(locale, "nightPageMedianDashed")}
            </li>
          </ul>
        </figure>
      ) : null}
    </section>
  );
}
