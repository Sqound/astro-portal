"use client";

// SESSION-GUIDING-STATS-01 — « Guidage » of the page of a session: the
// night's RMS (total, AD, Déc) and guided time, a line of facts, and the
// curve of the guide star's offset in AD and Déc around zero, one point per
// 10 s (`guidingTrace` of `GET /v1/sessions/{id}`), with the corrections
// PHD2 sent as bars under it (up east / north, down west / south, height the
// pulse's length), the settles after a dither as pale bands (never drawn as
// spikes: out of the RMS), the dithers, star losses, pauses, meridian flips
// and focus runs. ″ by default, guide pixels on demand (kept by the browser).
// The whole night by default; a drag on the curve zooms, a double click or
// « Toute la nuit » comes back; hovering reads a point. The figures stay the
// whole night's. Inline SVG drawn at the chart's real width, no chart
// library; the geometry is `session-guiding-view.js`'s.

import { useEffect, useId, useState } from "react";
import { message } from "portal/i18n.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { useChartWidth } from "./chart-width.js";
import { guidingSources, say } from "./night-detail-view.js";
import { durationText } from "../../written-forms.js";
import {
  chartZone,
  curveRuns,
  guidedText,
  guidingFactsLine,
  inUnit,
  labelWidth,
  markerTimes,
  nightMarkers,
  nightWindow,
  offsetScale,
  pauseLabels,
  pausesAndFlips,
  placeLabels,
  pointNear,
  pointTip,
  pulseTop,
  sayCounted,
  settleRuns,
  smoothRuns,
  smoothingApplies,
  traceOf,
  unitText,
  windowTicks,
  zonedClock,
} from "./session-guiding-view.js";

const UNIT_KEY = "planastro.guiding.unit";

function storedUnit() {
  try {
    return window.localStorage.getItem(UNIT_KEY) === "px" ? "px" : "arcsec";
  } catch {
    return "arcsec";
  }
}

function keepUnit(unit) {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // A private window keeps nothing: the unit lasts the page.
  }
}

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");

/** The geometry of the chart for a width: margins, rows, the plot's height. */
export function chartLayout(
  width,
  { compact = false, corrections = true, labelLines = 0 } = {},
) {
  const narrow = width < 600;
  const left = compact || narrow ? 34 : 40;
  const right = 6;
  // The marks row (dithers, losses, focus runs) and, above it, the lines of
  // the event labels (flips, pauses).
  const marks = 16 + labelLines * 12;
  const plot = compact ? 92 : narrow ? 150 : 200;
  const gap = 8;
  const row = corrections && !compact ? (narrow ? 18 : 22) : 0;
  const plotTop = marks + 2;
  const plotBottom = plotTop + plot;
  const corrTop = plotBottom + gap;
  const corrBottom = row ? corrTop + row * 2 : plotBottom;
  return {
    width,
    left,
    right,
    plotTop,
    plotBottom,
    row,
    corrTop,
    corrBottom,
    axisY: corrBottom + 14,
    height: corrBottom + 20,
  };
}

/**
 * The chart itself, for the section and, small and still, for a night of
 * « Les nuits de cette image » (`compact`: no corrections, no zoom).
 */
export function GuidingTraceChart({
  locale = "en",
  trace,
  markers = [],
  window,
  unit = "arcsec",
  zone = null,
  compact = false,
  interactive = !compact,
  onZoom = null,
  onReset = null,
  initialWidth = 1000,
}) {
  const [box, width] = useChartWidth(initialWidth);
  const id = safeId(useId());
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null);
  if (!trace || !window) return null;
  const layoutOptions = { compact, corrections: trace.pulsesKnown || !compact };
  const { left, right } = chartLayout(width, layoutOptions);
  const span = window.to - window.from;
  const x = (t) => left + ((t - window.from) / span) * (width - left - right);
  const { pauses, flips } = pausesAndFlips(markers);
  const shownPauses = pauses.filter(
    (pause) => pause.to > window.from && pause.from < window.to,
  );
  // The labels of the events, written once, here: a flip « Retournement
  // 01:23 » and the pauses wide enough to carry « pause 12 min » (the narrow
  // ones close together make « 5 pauses · 9 min »), on two lines at most;
  // a label that finds no room is hidden and read in its bubble.
  const labelPlan = (() => {
    if (compact) return { placed: [], hidden: [], lines: 0 };
    const clamp = (t) => Math.max(window.from, Math.min(window.to, t));
    const entries = [];
    const flipsShown = flips.filter((t) => t >= window.from && t <= window.to);
    for (const t of flipsShown) {
      const text = say(locale, "nightPageFlipAt", {
        time: zonedClock(t, zone),
      });
      const atEnd = x(t) > width - labelWidth(text) - 20;
      const w = labelWidth(text);
      entries.push({
        key: `flip-${t}`,
        kind: "flip",
        text,
        anchor: atEnd ? "end" : "start",
        at: atEnd ? x(t) - 4 : x(t) + 4,
        from: atEnd ? x(t) - 4 - w : x(t) + 4,
        to: atEnd ? x(t) - 4 : x(t) + 4 + w,
      });
    }
    const flipless = shownPauses.filter(
      (pause) => !flipsShown.some((t) => t >= pause.from && t <= pause.to),
    );
    for (const label of pauseLabels(flipless, {
      toX: (t) => x(clamp(t)),
      textOf: (minutes) =>
        say(locale, "sessionPosesPause", {
          duration: durationText(minutes, locale),
        }),
      groupText: (count, minutes) =>
        sayCounted(locale, "sessionGuidingPausesGroup", count, {
          duration: durationText(minutes, locale),
        }),
    }))
      entries.push({
        ...label,
        anchor: "middle",
        at: label.centre,
        detail: label.pauses
          .map(
            (pause) =>
              `${say(locale, "sessionPosesPause", {
                duration: durationText(
                  Math.max(1, Math.round((pause.to - pause.from) / 60_000)),
                  locale,
                ),
              })} · ${zonedClock(pause.from, zone)}–${zonedClock(pause.to, zone)}`,
          )
          .join("\n"),
      });
    return placeLabels(entries, { lines: 2 });
  })();
  const layout = chartLayout(width, {
    ...layoutOptions,
    labelLines: labelPlan.lines,
  });
  const { plotTop, plotBottom, row, corrTop, corrBottom } = layout;
  const tOf = (px) =>
    window.from + ((px - left) / (width - left - right)) * span;
  const clampX = (value) => Math.max(left, Math.min(width - right, value));
  const scale = offsetScale(trace, window, unit);
  const middle = (plotTop + plotBottom) / 2;
  const half = (plotBottom - plotTop) / 2 - 4;
  const y = (value) =>
    middle -
    (Math.max(-scale.top, Math.min(scale.top, value)) / scale.top) * half;
  const ticks = windowTicks(
    window,
    zone,
    width - left - right,
    compact ? 54 : 64,
  );
  const inside = (t) => t >= window.from && t <= window.to;
  const settles = settleRuns(trace).filter(
    (run) => run.to > window.from && run.from < window.to,
  );
  const thin = (times) => {
    let last = -Infinity;
    return times.filter(inside).filter((t) => {
      if (x(t) - last < 6) return false;
      last = x(t);
      return true;
    });
  };
  const dithers = thin(markerTimes(markers, "dither"));
  const losses = thin(markerTimes(markers, "star-lost"));
  const focus = thin(markerTimes(markers, "autofocus"));
  const pathOf = (run) =>
    run
      .map((point) => `${x(point.at).toFixed(1)},${y(point.value).toFixed(1)}`)
      .join(" ");
  const ra = curveRuns(trace, "ra", window, unit);
  const dec = curveRuns(trace, "dec", window, unit);
  // The whole night (over an hour on screen) is drawn smoothed, the raw curve
  // faint under it; below an hour only the raw one, in full colours.
  const smooth = !compact && smoothingApplies(window);
  const raSmooth = smooth ? smoothRuns(ra, trace.interval) : [];
  const decSmooth = smooth ? smoothRuns(dec, trace.interval) : [];
  const showPulses = row > 0 && trace.pulsesKnown;
  const top = showPulses ? pulseTop(trace, window) : 0;
  const slot = Math.max(
    1,
    ((trace.interval * 1000) / span) * (width - left - right) * 0.8,
  );
  const bars = [];
  if (showPulses)
    for (const point of trace.points) {
      if (!inside(point.at)) continue;
      for (const [axis, field, index] of [
        ["ra", "raPulseMs", 0],
        ["dec", "decPulseMs", 1],
      ]) {
        const value = point[field];
        if (!value) continue;
        const centre = corrTop + row * index + row / 2;
        const size = Math.max(
          1,
          (Math.min(1, Math.abs(value) / top) * row) / 2 - 1,
        );
        bars.push({
          key: `${field}-${point.at}`,
          axis,
          x: x(point.at),
          y: value > 0 ? centre - size : centre,
          height: size,
        });
      }
    }
  const tip = hover
    ? pointTip(hover.point, trace, { locale, zone, unit })
    : null;

  const pointerX = (event) => {
    const rect =
      event.currentTarget.ownerSVGElement?.getBoundingClientRect?.() ??
      event.currentTarget.getBoundingClientRect();
    return clampX(((event.clientX - rect.left) / rect.width) * width);
  };
  const handlers = interactive
    ? {
        onPointerDown: (event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const at = pointerX(event);
          setDrag({ from: at, to: at });
          setHover(null);
        },
        onPointerMove: (event) => {
          const at = pointerX(event);
          if (drag) {
            setDrag({ ...drag, to: at });
            return;
          }
          const point = pointNear(trace, tOf(at), window);
          setHover(
            point
              ? { point, x: x(point.at + (trace.interval * 1000) / 2) }
              : null,
          );
        },
        onPointerUp: () => {
          if (!drag) return;
          const from = Math.min(drag.from, drag.to);
          const to = Math.max(drag.from, drag.to);
          setDrag(null);
          // A click is no zoom; a drag of a few pixels at least.
          if (to - from >= 8 && onZoom)
            onZoom({
              // Whole minutes: the window reads « 00:00 → 00:30 ».
              from: Math.floor(tOf(from) / 60_000) * 60_000,
              to: Math.ceil(tOf(to) / 60_000) * 60_000,
            });
        },
        onPointerLeave: () => {
          if (!drag) setHover(null);
        },
        onDoubleClick: () => onReset?.(),
      }
    : {};
  const offsetLabel = (value) =>
    unit === "px"
      ? `${value > 0 ? "+" : "−"}${new Intl.NumberFormat(locale, {
          maximumFractionDigits: 2,
        }).format(Math.abs(value))}`
      : `${value > 0 ? "+" : "−"}${new Intl.NumberFormat(locale, {
          maximumFractionDigits: 2,
        }).format(Math.abs(value))}″`;

  return (
    <div
      ref={box}
      className={`session-guiding-plot${compact ? " is-compact" : ""}`}
      data-testid="session-guiding-chart"
      data-smoothed={smooth ? "true" : "false"}
    >
      <svg
        width={width}
        height={layout.height}
        viewBox={`0 0 ${width} ${layout.height}`}
        role="img"
        aria-label={message(locale, "sessionGuidingChartLabel")}
      >
        <defs>
          <pattern
            id={`pause-${id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="session-guiding-pause-fill" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              className="session-guiding-pause-line"
            />
          </pattern>
        </defs>
        <rect
          className="session-guiding-frame"
          x={left}
          y={plotTop}
          width={width - left - right}
          height={plotBottom - plotTop}
          rx={4}
        />
        {settles.map((run) => (
          <rect
            key={`settle-${run.from}`}
            className="session-guiding-settle"
            x={x(Math.max(run.from, window.from))}
            y={plotTop}
            width={Math.max(
              1,
              x(Math.min(run.to, window.to)) -
                x(Math.max(run.from, window.from)),
            )}
            height={plotBottom - plotTop}
          />
        ))}
        {ticks.map((tick) => (
          <line
            key={`hour-${tick.t}`}
            className={`session-guiding-hour${tick.whole ? " is-whole" : ""}`}
            x1={x(tick.t)}
            x2={x(tick.t)}
            y1={plotTop}
            y2={corrBottom}
          />
        ))}
        {scale.ticks.map((value) => (
          <g key={`tick-${value}`}>
            <line
              className="session-guiding-grid"
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
            />
            <text
              className="session-guiding-tick"
              x={left - 4}
              y={y(value) + 3}
              textAnchor="end"
            >
              {offsetLabel(value)}
            </text>
          </g>
        ))}
        <line
          className="session-guiding-zero"
          x1={left}
          x2={width - right}
          y1={middle}
          y2={middle}
        />
        <text
          className="session-guiding-tick"
          x={left - 4}
          y={middle + 3}
          textAnchor="end"
        >
          0
        </text>
        {shownPauses.map((pause) => (
          <rect
            key={`pause-${pause.from}`}
            className="session-guiding-pause"
            x={x(Math.max(pause.from, window.from))}
            y={plotTop}
            width={Math.max(
              1,
              x(Math.min(pause.to, window.to)) -
                x(Math.max(pause.from, window.from)),
            )}
            height={corrBottom - plotTop}
            fill={`url(#pause-${id})`}
          />
        ))}
        {ra.map((run, index) => (
          <polyline
            key={`ra-${index}`}
            className={`session-guiding-line is-ra${smooth ? " is-faint" : ""}`}
            points={pathOf(run)}
          />
        ))}
        {dec.map((run, index) => (
          <polyline
            key={`dec-${index}`}
            className={`session-guiding-line is-dec${smooth ? " is-faint" : ""}`}
            points={pathOf(run)}
          />
        ))}
        {raSmooth.map((run, index) => (
          <polyline
            key={`ra-smooth-${index}`}
            className="session-guiding-line is-ra is-smooth"
            points={pathOf(run)}
          />
        ))}
        {decSmooth.map((run, index) => (
          <polyline
            key={`dec-smooth-${index}`}
            className="session-guiding-line is-dec is-smooth"
            points={pathOf(run)}
          />
        ))}
        {flips.filter(inside).map((t) => (
          <g key={`flip-${t}`} className="session-guiding-flip">
            <line x1={x(t)} x2={x(t)} y1={plotTop} y2={corrBottom} />
          </g>
        ))}
        {labelPlan.hidden.map((label) => (
          <rect
            key={`hidden-${label.key}`}
            className="session-guiding-label-hit"
            x={label.from}
            y={0}
            width={label.to - label.from}
            height={plotTop - 14}
          >
            <title>{label.detail ?? label.text}</title>
          </rect>
        ))}
        {labelPlan.placed.map((label) => (
          <text
            key={label.key}
            className={`session-guiding-event is-${label.kind}`}
            x={label.at}
            y={10 + label.line * 12}
            textAnchor={label.anchor}
            data-label={label.kind}
          >
            {label.detail ? <title>{label.detail}</title> : null}
            {label.text}
          </text>
        ))}
        {dithers.map((t) => (
          <polygon
            key={`dither-${t}`}
            className="session-guiding-dither"
            points={`${x(t) - 3.5},${plotTop - 11} ${x(t) + 3.5},${plotTop - 11} ${x(t)},${plotTop - 4}`}
          />
        ))}
        {losses.map((t) => (
          <path
            key={`lost-${t}`}
            className="session-guiding-lost"
            d={`M${x(t) - 3.5} ${plotTop - 11} L${x(t) + 3.5} ${plotTop - 4} M${x(t) + 3.5} ${plotTop - 11} L${x(t) - 3.5} ${plotTop - 4}`}
          />
        ))}
        {focus.map((t) => (
          <circle
            key={`focus-${t}`}
            className="session-guiding-focus"
            cx={x(t)}
            cy={plotTop - 7.5}
            r={3.5}
          />
        ))}
        {row ? (
          <g className="session-guiding-corrections">
            <text
              className="session-guiding-tick"
              x={left - 4}
              y={corrTop + row / 2 + 3}
              textAnchor="end"
            >
              {message(locale, "nightPageLegendRa")}
            </text>
            <text
              className="session-guiding-tick"
              x={left - 4}
              y={corrTop + row * 1.5 + 3}
              textAnchor="end"
            >
              {message(locale, "nightPageLegendDec")}
            </text>
            {showPulses ? (
              <>
                <line
                  className="session-guiding-grid"
                  x1={left}
                  x2={width - right}
                  y1={corrTop + row / 2}
                  y2={corrTop + row / 2}
                />
                <line
                  className="session-guiding-grid"
                  x1={left}
                  x2={width - right}
                  y1={corrTop + row * 1.5}
                  y2={corrTop + row * 1.5}
                />
                {bars.map((bar) => (
                  <rect
                    key={bar.key}
                    className={`session-guiding-bar is-${bar.axis}`}
                    x={bar.x}
                    y={bar.y}
                    width={slot}
                    height={bar.height}
                  />
                ))}
              </>
            ) : (
              <text
                className="session-guiding-unknown"
                x={(left + width - right) / 2}
                y={corrTop + row + 4}
                textAnchor="middle"
              >
                {message(locale, "sessionGuidingCorrectionsUnknown")}
              </text>
            )}
          </g>
        ) : null}
        {ticks.map((tick, index) => (
          <text
            key={`label-${tick.t}`}
            className={`session-guiding-axis${tick.whole ? " is-whole" : ""}`}
            x={x(tick.t)}
            y={layout.axisY}
            textAnchor={
              index === 0 && x(tick.t) - left < 16 ? "start" : "middle"
            }
          >
            {tick.label}
          </text>
        ))}
        {drag ? (
          <rect
            className="session-guiding-selection"
            x={Math.min(drag.from, drag.to)}
            y={plotTop}
            width={Math.abs(drag.to - drag.from)}
            height={corrBottom - plotTop}
          />
        ) : null}
        {hover ? (
          <g className="session-guiding-hover">
            <line x1={hover.x} x2={hover.x} y1={plotTop} y2={corrBottom} />
            {hover.point.settle ? null : (
              <>
                <circle
                  className="is-ra"
                  cx={hover.x}
                  cy={y(inUnit(hover.point.ra, unit, trace.scale) ?? 0)}
                  r={3}
                />
                <circle
                  className="is-dec"
                  cx={hover.x}
                  cy={y(inUnit(hover.point.dec, unit, trace.scale) ?? 0)}
                  r={3}
                />
              </>
            )}
          </g>
        ) : null}
        {interactive ? (
          <rect
            className="session-guiding-hit"
            x={left}
            y={plotTop - 14}
            width={width - left - right}
            height={corrBottom - plotTop + 14}
            {...handlers}
          />
        ) : null}
      </svg>
      {tip ? (
        <div
          className="session-guiding-tip"
          role="status"
          style={
            hover.x > width - 240
              ? { right: `${width - hover.x + 10}px`, top: `${plotTop + 6}px` }
              : { left: `${hover.x + 10}px`, top: `${plotTop + 6}px` }
          }
        >
          <strong>{tip.head}</strong>
          {tip.lines.map((line) => (
            <span key={line.axis} className={`is-${line.axis}`}>
              <i aria-hidden="true" />
              {line.text}
            </span>
          ))}
          {tip.settle ? <em>{tip.settle}</em> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The legend under the curve: the lines, the bars, and the marks the night has. */
function GuidingLegend({ locale, trace, markers, smooth = false }) {
  const { pauses, flips } = pausesAndFlips(markers);
  const has = (type) => markers.some((marker) => marker.type === type);
  const items = [
    ["is-ra", "nightPageLegendRa"],
    ["is-dec", "nightPageLegendDec"],
    smooth ? ["is-smooth", "sessionGuidingLegendSmooth"] : null,
    trace.pulsesKnown ? ["is-bars", "sessionGuidingLegendCorrections"] : null,
    has("dither") ? ["is-dither", "sessionGuidingLegendDither"] : null,
    ["is-settle", "sessionGuidingLegendSettle"],
    has("star-lost") ? ["is-lost", "sessionGuidingLegendStarLost"] : null,
    pauses.length ? ["is-pause", "sessionGuidingLegendPause"] : null,
    flips.length ? ["is-flip", "sessionGuidingLegendFlip"] : null,
    has("autofocus") ? ["is-focus", "sessionGuidingLegendFocus"] : null,
  ].filter(Boolean);
  return (
    <ul className="session-guiding-legend">
      {items.map(([className, key]) => (
        <li key={key} className={className}>
          <i aria-hidden="true" />
          {message(locale, key)}
        </li>
      ))}
    </ul>
  );
}

/** The figures of the night: RMS total, AD, Déc in the unit, the guided time. */
export function GuidingFigures({
  locale,
  summary,
  trace,
  unit = "arcsec",
  guided = true,
}) {
  const scale = trace?.scale ?? summary?.guideScaleArcsecPerPx ?? null;
  const value = (arcsec) => unitText(inUnit(arcsec, unit, scale), unit, locale);
  return (
    <dl className="night-figures session-guiding-figures">
      <div className="night-figure">
        <dt>{message(locale, "nightPageRmsTotal")}</dt>
        <dd>{value(summary?.rmsTotalArcsec)}</dd>
      </div>
      <div className="night-figure is-ra">
        <dt>{message(locale, "nightPageRmsRa")}</dt>
        <dd>{value(summary?.rmsRaArcsec)}</dd>
      </div>
      <div className="night-figure is-dec">
        <dt>{message(locale, "nightPageRmsDec")}</dt>
        <dd>{value(summary?.rmsDecArcsec)}</dd>
      </div>
      {guided ? (
        <div className="night-figure">
          <dt>{message(locale, "sessionGuidingGuided")}</dt>
          <dd>
            {guidedText(summary?.guidedSeconds ?? trace?.guidedSeconds, locale)}
            <span className="night-figure-extra">
              {" "}
              {message(locale, "sessionGuidingGuidedNote")}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function GuidingHead({ locale, zone, unit, badge, toggle }) {
  return (
    <>
      <div className="session-guiding-head">
        <h2 id="session-guiding-title">
          {message(locale, "nightPageGuidingTitle")}
        </h2>
        {badge ? <span className="session-guiding-badge">{badge}</span> : null}
        <span className="session-guiding-head-end">
          {toggle}
          <InfoButton
            locale={locale}
            label={message(locale, "nightPageGuidingInfoLabel")}
            title={message(locale, "nightPageGuidingTitle")}
            body={message(locale, "sessionGuidingInfo")}
          />
        </span>
      </div>
      <p className="night-card-line">
        {[
          message(
            locale,
            chartZone(zone) ? "sessionChartHoursPlace" : "sessionChartHoursUtc",
          ),
          message(
            locale,
            unit === "px"
              ? "sessionGuidingOffsetPx"
              : "sessionGuidingOffsetArcsec",
          ),
        ].join(" · ")}
      </p>
    </>
  );
}

/**
 * The section. `guidingTrace` is the service's; `report` the analysis (its
 * events when the trace has no markers, its image scale); without a trace:
 * « Pas de journal de guidage pour cette nuit » when the night was analysed,
 * « Les journaux de cette nuit ne sont pas encore envoyés » for a night of
 * Astro Sync without an analysis, nothing for a night without Astro Sync.
 */
export function SessionGuidingSection({
  locale = "en",
  guidingTrace = null,
  summary = null,
  report = null,
  analysed = Boolean(report),
  fromAstroSync = false,
  bounds = null,
  zone = null,
  initialWidth = 1000,
}) {
  const [unit, setUnit] = useState("arcsec");
  const [zoom, setZoom] = useState(null);
  useEffect(() => setUnit(storedUnit()), []);
  const trace = traceOf(guidingTrace);
  if (!trace) {
    if (!analysed && !fromAstroSync) return null;
    return (
      <section
        id="session-guiding"
        className="night-card session-guiding"
        aria-labelledby="session-guiding-title"
        data-testid="session-guiding"
      >
        <GuidingHead
          locale={locale}
          zone={zone}
          unit="arcsec"
          badge={
            analysed ? message(locale, "sessionGuidingAnalysedBadge") : null
          }
        />
        <div
          className="session-guiding-empty"
          data-state={analysed ? "no-log" : "not-sent"}
        >
          <strong>
            {message(
              locale,
              analysed ? "sessionGuidingNoLog" : "sessionGuidingNotSent",
            )}
          </strong>
          <p>
            {message(
              locale,
              analysed
                ? "sessionGuidingNoLogBody"
                : "sessionGuidingNotSentBody",
            )}
          </p>
        </div>
      </section>
    );
  }
  const scale = trace.scale ?? summary?.guideScaleArcsecPerPx ?? null;
  const shownUnit = unit === "px" && scale ? "px" : "arcsec";
  const whole = nightWindow(bounds, trace);
  const window = zoom ?? whole;
  const markers = nightMarkers(trace, report);
  const sources = guidingSources(report) || "PHD2";
  const choose = (next) => {
    setUnit(next);
    keepUnit(next);
  };
  const toggle = scale ? (
    <span
      className="session-guiding-units"
      role="group"
      aria-label={message(locale, "sessionGuidingUnitLabel")}
    >
      {[
        ["arcsec", "″"],
        ["px", message(locale, "sessionGuidingUnitPx")],
      ].map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={shownUnit === key ? "is-active" : ""}
          aria-pressed={shownUnit === key}
          onClick={() => choose(key)}
        >
          {label}
        </button>
      ))}
    </span>
  ) : null;
  return (
    <section
      id="session-guiding"
      className="night-card session-guiding"
      aria-labelledby="session-guiding-title"
      data-testid="session-guiding"
    >
      <GuidingHead
        locale={locale}
        zone={zone}
        unit={shownUnit}
        badge={say(locale, "sessionGuidingMeasuredBy", { sources })}
        toggle={toggle}
      />
      <GuidingFigures
        locale={locale}
        summary={
          summary ?? {
            rmsTotalArcsec: trace.rms?.totalArcsec ?? null,
            rmsRaArcsec: trace.rms?.raArcsec ?? null,
            rmsDecArcsec: trace.rms?.decArcsec ?? null,
            guidedSeconds: trace.guidedSeconds,
          }
        }
        trace={trace}
        unit={shownUnit}
      />
      <p className="session-guiding-facts">
        {guidingFactsLine(summary, {
          locale,
          scale,
          imageScale: report?.pixelScaleArcsec ?? null,
        })}
      </p>
      <div className="session-guiding-tools">
        <span className="session-guiding-windows">
          <button
            type="button"
            className={`session-guiding-window${zoom ? "" : " is-active"}`}
            aria-pressed={!zoom}
            onClick={() => setZoom(null)}
          >
            {message(locale, "sessionGuidingWholeNight")}
          </button>
          {zoom ? (
            <span className="session-guiding-window is-active">
              {`${zonedClock(zoom.from, zone)} → ${zonedClock(zoom.to, zone)}`}
            </span>
          ) : null}
        </span>
        <span className="session-guiding-hint">
          {message(
            locale,
            zoom ? "sessionGuidingHintZoomed" : "sessionGuidingHintWhole",
          )}
        </span>
      </div>
      <GuidingTraceChart
        locale={locale}
        trace={trace}
        markers={markers}
        window={window}
        unit={shownUnit}
        zone={zone}
        initialWidth={initialWidth}
        onZoom={(next) => setZoom(next)}
        onReset={() => setZoom(null)}
      />
      <GuidingLegend
        locale={locale}
        trace={trace}
        markers={markers}
        smooth={smoothingApplies(window)}
      />
    </section>
  );
}
