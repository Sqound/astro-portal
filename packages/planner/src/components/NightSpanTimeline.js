"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BrandLoader } from "portal/components/BrandLoader.js";
import { message } from "portal/i18n.js";
import {
  customNightSpan,
  movedNightSpan,
  nightSpanForecastSummary,
  nightSpanMoonIntervals,
  nightSpanRainLimits,
  steppedNightSpan,
} from "../night-span.js";
import {
  fillMessage,
  nightSpanChartDescription,
  nightSpanForecastParts,
} from "../night-span-copy.js";
import { durationText } from "portal/written-forms.js";

// "Durée de la nuit": the section of the planner's stage 1. The two-way choice
// "Nuit astronomique | Définir", the timeline of the night (twilight bands,
// cloud cover, rain, the Moon above the horizon, the span), two handles in
// "Définir" (the pointer, or the arrow keys by ten minutes), the span's length
// and what the forecast says about it. The timeline runs from thirty minutes
// before sunset to thirty minutes after sunrise; the cloud curve is straight
// lines between hourly values. The span is a property of the active plan:
// changing it never moves or removes an interval (one outside it is flagged
// "Hors de la durée choisie").

const gutter = 20;
const sky = {
  day: "#2e3a3d",
  civil: "#253033",
  nautical: "#1c2528",
  astronomical: "#151d20",
  night: "#0c1113",
};

const at = (value) => {
  if (typeof value === "number") return value;
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
};

function crescentPath(x, y, radius) {
  return `M${x} ${y - radius} A${radius} ${radius} 0 0 1 ${x} ${y + radius} A${radius * 0.45} ${radius} 0 0 0 ${x} ${y - radius} Z`;
}

function TimelineDrawing({
  night,
  hourly,
  span,
  custom,
  forecast,
  width,
  top,
  plotHeight,
  clock,
  utcOffsetMinutes,
  description,
  plainHours = false,
}) {
  const start = at(night.scaleStart);
  const end = at(night.scaleEnd);
  const right = width - gutter;
  const x = (instant) =>
    gutter + ((instant - start) / Math.max(1, end - start)) * (right - gutter);
  const bottom = top + plotHeight;
  const grid = custom && forecast;
  const top100 = grid ? top + 22 : top;
  const cloudY = (cloud) =>
    bottom - (Math.min(100, Math.max(0, cloud)) / 100) * (bottom - top100);
  const twilight = (darkness, key) => at(night.twilights?.[darkness]?.[key]);
  const bands = [
    [at(night.sunset), at(night.sunrise), sky.civil],
    [twilight("civil", "start"), twilight("civil", "end"), sky.nautical],
    [
      twilight("nautical", "start"),
      twilight("nautical", "end"),
      sky.astronomical,
    ],
    [
      twilight("astronomical", "start"),
      twilight("astronomical", "end"),
      sky.night,
    ],
  ].filter(([from, to]) => from !== null && to !== null && to > from);
  const spanStart = at(span.start);
  const spanEnd = at(span.end);
  const clouds = forecast
    ? hourly
        .filter((row) => typeof row.cloud === "number")
        .map((row) => [x(row.time), cloudY(row.cloud)])
    : [];
  const cloudLine = clouds.map(([px, py]) => `${px},${py}`).join(" ");
  const rain = forecast
    ? hourly.filter(
        (row) =>
          typeof row.precipitationAmount === "number" &&
          row.precipitationAmount >= nightSpanRainLimits.wetMillimetres,
      )
    : [];
  const moon = nightSpanMoonIntervals(
    night.moonSeries,
    night.scaleStart,
    night.scaleEnd,
  );
  const hour = 3600000;
  const offset = utcOffsetMinutes * 60000;
  const ticks = [];
  for (
    let tick = Math.ceil((start + offset) / hour) * hour - offset;
    tick <= end;
    tick += hour
  ) {
    const localHour = ((Math.floor((tick + offset) / hour) % 24) + 24) % 24;
    ticks.push({ tick, localHour, major: localHour % 3 === 0 });
  }
  const clipId = `night-span-plot-${custom ? "custom" : "whole"}`;
  return (
    <svg
      className="planner-night-span-drawing"
      width={width}
      height={bottom + 24}
      viewBox={`0 0 ${width} ${bottom + 24}`}
      role="img"
      aria-label={description}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={gutter} y={top} width={right - gutter} height={plotHeight} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          x={gutter}
          y={top}
          width={right - gutter}
          height={plotHeight}
          fill={sky.day}
        />
        {bands.map(([from, to, color]) => (
          <rect
            key={`${from}-${color}`}
            x={x(from)}
            y={top}
            width={Math.max(0, x(to) - x(from))}
            height={plotHeight}
            fill={color}
          />
        ))}
        {spanStart !== null && spanEnd !== null && (
          <rect
            x={x(spanStart)}
            y={top}
            width={Math.max(0, x(spanEnd) - x(spanStart))}
            height={plotHeight}
            fill="#342918"
          />
        )}
        {grid &&
          [top + 22, top + 62].map((y) => (
            <line
              key={y}
              x1={gutter}
              y1={y}
              x2={right}
              y2={y}
              stroke="#9ca5a3"
              strokeOpacity="0.22"
              strokeDasharray="2 4"
            />
          ))}
        {clouds.length > 1 && (
          <>
            <polygon
              points={`${cloudLine} ${clouds.at(-1)[0]},${bottom} ${clouds[0][0]},${bottom}`}
              fill="#c9d1cf"
              fillOpacity="0.1"
            />
            <polyline
              points={cloudLine}
              fill="none"
              stroke="#c9d1cf"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {rain.map((row) => {
          const height = Math.max(
            3,
            Math.min(1, row.precipitationAmount / 4) * plotHeight * 0.45,
          );
          return (
            <rect
              key={row.time}
              x={x(row.time) - 3}
              y={bottom - height}
              width="6"
              height={height}
              rx="1"
              fill="#83C5D0"
            />
          );
        })}
        {moon.map((period) => (
          <g key={period.start}>
            <line
              x1={x(at(period.start)) + 1.5}
              y1={top + 9}
              x2={x(at(period.end)) - 1}
              y2={top + 9}
              stroke="#ffe0ae"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d={crescentPath(x(at(period.end)) - 1, top + 9, 5)}
              fill="#ffe0ae"
            />
          </g>
        ))}
        {spanStart !== null && spanEnd !== null && (
          <>
            <rect
              x={gutter}
              y={top}
              width={Math.max(0, x(spanStart) - gutter)}
              height={plotHeight}
              fill="#0a0d0b"
              fillOpacity="0.6"
            />
            <rect
              x={x(spanEnd)}
              y={top}
              width={Math.max(0, right - x(spanEnd))}
              height={plotHeight}
              fill="#0a0d0b"
              fillOpacity="0.6"
            />
          </>
        )}
      </g>
      {spanStart !== null && spanEnd !== null && (
        <rect
          x={x(spanStart)}
          y={top}
          width={Math.max(0, x(spanEnd) - x(spanStart))}
          height={plotHeight}
          fill="none"
          stroke="#e0a85e"
          strokeWidth="1.5"
        />
      )}
      {plainHours &&
        spanStart !== null &&
        spanEnd !== null &&
        // At rest the range's two hours are plain gold text above
        // its lines, no pill and no handle.
        [spanStart, spanEnd].map((value, index) => (
          <text
            key={index}
            x={Math.min(Math.max(x(value), gutter + 14), right + gutter - 14)}
            y={top - 8}
            fontSize="12"
            fontWeight="700"
            textAnchor="middle"
            fill="#ffe0ae"
          >
            {clock(new Date(value).toISOString())}
          </text>
        ))}
      {moon.map((period) => {
        const from = at(period.start);
        const to = at(period.end);
        if (to < end)
          return (
            <text
              key={`label-${period.start}`}
              x={x(to) + 8}
              y={top + 12.5}
              fontSize="10.5"
              fontWeight="600"
              fill="#ffe0ae"
            >
              {clock(period.end)}
            </text>
          );
        if (from > start)
          return (
            <text
              key={`label-${period.start}`}
              x={x(from) - 6}
              y={top + 12.5}
              fontSize="10.5"
              fontWeight="600"
              textAnchor="end"
              fill="#ffe0ae"
            >
              {clock(period.start)}
            </text>
          );
        return null;
      })}
      {grid && (
        <>
          <text
            x={right - 2}
            y={top + 19}
            fontSize="10"
            textAnchor="end"
            fill="#9ca5a3"
          >
            100 %
          </text>
          <text
            x={right - 2}
            y={top + 59}
            fontSize="10"
            textAnchor="end"
            fill="#9ca5a3"
          >
            50 %
          </text>
        </>
      )}
      <line
        x1={gutter}
        y1={bottom}
        x2={right}
        y2={bottom}
        stroke="#56615c"
        strokeWidth="1"
      />
      {ticks.map(({ tick, localHour, major }) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            y1={bottom}
            x2={x(tick)}
            y2={bottom + (major ? 6 : 3)}
            stroke="#56615c"
          />
          {major && (
            <text
              x={x(tick)}
              y={bottom + 19}
              fontSize="11"
              textAnchor="middle"
              fill="#9ca5a3"
            >
              {`${String(localHour).padStart(2, "0")}:00`}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function NightSpanTimeline({
  locale,
  night,
  hourly = [],
  // What the forecast is doing when `hourly` is empty -- `loading` (asked
  // for, not answered yet), `unavailable` (asked for, no answer),
  // `beyond-range` (the date is too far for a forecast, the default of the
  // callers that do not say). "À l'approche de la date" is only ever said
  // for the last one.
  forecastStatus = "beyond-range",
  date,
  darknessLabel,
  editable = false,
  utcOffsetMinutes = 0,
  clock,
  // The 24-hour clock of the drawing's labels (the handles, the Moon), short
  // enough for a handle in every language.
  shortClock = clock,
  onChange,
  // The slot dialog of "Cette nuit" holds the draft
  // itself — `value` the custom span or `null` for the whole night,
  // `onDraft` each change —; the tick, the pencil, "Annuler" and the
  // section's title are the dialog's.
  value = null,
  onDraft = null,
}) {
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const [width, setWidth] = useState(340);
  // The span is edited on a draft, from the pencil to the
  // tick. Nothing is written before the tick; "Annuler" drops the draft.
  const [ownDraft, setOwnDraft] = useState(null);
  const [ownEditing, setEditing] = useState(false);
  const controlled = typeof onDraft === "function";
  const draft = controlled ? value : ownDraft;
  const setDraft = controlled ? (next) => next && onDraft(next) : setOwnDraft;
  const editing = controlled ? Boolean(value) : ownEditing;
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const measure = () =>
      setWidth(Math.max(200, element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const stored = !controlled && night.span === "custom";
  // "Définir" from the whole night enters the edition at once.
  const custom = stored || editing;
  const bounds = night.bounds;
  const span = draft || { start: night.start, end: night.end };
  const summary =
    nightSpanForecastSummary(hourly, night.moonSeries, span) || {};
  const forecastAvailable = hourly.length > 0;
  // A forecast said to be ready that holds no hour for this night is a
  // forecast that is not there.
  const missing = forecastStatus === "ready" ? "unavailable" : forecastStatus;
  const noForecastKey =
    missing === "loading"
      ? "plannerForecastLoading"
      : missing === "unavailable"
        ? "plannerForecastUnavailable"
        : "plannerNightSpanNoForecast";
  // The loading line says it all: no second sentence under it.
  const noForecastHelpKey =
    missing === "loading"
      ? null
      : missing === "unavailable"
        ? "plannerForecastUnavailableHelp"
        : "plannerNightSpanNoForecastHelp";
  // One height with or without a forecast: the notice of a
  // missing forecast is a line under the drawing, never over it.
  const height = custom ? 154 : 96;
  const top = custom ? 28 : 4;
  const plotHeight = height - top - 24;
  const start = at(night.scaleStart);
  const end = at(night.scaleEnd);
  const right = width - gutter;
  const x = (instant) =>
    gutter + ((instant - start) / Math.max(1, end - start)) * (right - gutter);
  const instantAt = (clientX) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return null;
    return Math.round(
      start +
        ((clientX - box.left - gutter) / Math.max(1, right - gutter)) *
          (end - start),
    );
  };
  const range = `${clock(span.start)} → ${clock(span.end)}`;
  const duration = durationText(summary.minutes || 0, locale);
  const forecastParts = forecastAvailable
    ? nightSpanForecastParts(locale, summary, clock)
    : null;
  const canMove = editable && editing && Boolean(bounds);
  // The edition ends: the plan is written only when there is something to
  // write (the tick, or a way back to the whole night).
  const finish = (nightSpan) => {
    if (controlled) {
      onDraft(null);
      return;
    }
    setDraft(null);
    setEditing(false);
    if (nightSpan) onChange?.(nightSpan);
  };
  const startEditing = (from) => {
    if (!from) return;
    if (controlled) {
      onDraft({ mode: "custom", start: from.start, end: from.end });
      return;
    }
    setDraft({ start: from.start, end: from.end });
    setEditing(true);
  };
  const handle = (edge) => {
    const instant = at(span[edge]);
    const label = shortClock(span[edge]);
    return (
      <button
        key={edge}
        type="button"
        className={`planner-night-span-handle is-${edge}`}
        style={{
          left: `${x(instant) - 22}px`,
          height: `${top + plotHeight + 8}px`,
        }}
        aria-label={fillMessage(
          message(
            locale,
            edge === "start"
              ? "plannerNightSpanStartHandle"
              : "plannerNightSpanEndHandle",
          ),
          { time: label },
        )}
        aria-describedby="planner-night-span-hint"
        disabled={!canMove}
        onKeyDown={(event) => {
          const steps =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? -1
                : 0;
          if (!steps || !canMove) return;
          event.preventDefault();
          setDraft(steppedNightSpan({ span, edge, steps, bounds }) ?? draft);
        }}
        onPointerDown={(event) => {
          if (!canMove) return;
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          dragRef.current = { edge, pointerId: event.pointerId, span };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          const to = instantAt(event.clientX);
          if (to === null) return;
          const next = movedNightSpan({
            span: drag.span,
            edge: drag.edge,
            to,
            bounds,
          });
          if (next) {
            drag.moved = true;
            drag.span = next;
            setDraft(next);
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <span className="planner-night-span-handle-time" aria-hidden="true">
          {label}
        </span>
        <span className="planner-night-span-handle-line" aria-hidden="true" />
        <span className="planner-night-span-handle-grip" aria-hidden="true" />
      </button>
    );
  };
  return (
    <section
      className="planner-night-span"
      aria-labelledby="planner-night-span-title"
    >
      <h3 id="planner-night-span-title" hidden={controlled}>
        {message(locale, "plannerNightSpanTitle")}
      </h3>
      <div
        className="planner-night-span-modes"
        role="radiogroup"
        aria-labelledby="planner-night-span-title"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!custom}
          className={!custom ? "is-selected" : ""}
          disabled={!editable}
          onClick={() =>
            custom && finish(stored ? { mode: "astronomical" } : null)
          }
        >
          {darknessLabel}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className={custom ? "is-selected" : ""}
          disabled={!editable || (!custom && !bounds)}
          onClick={() => !custom && startEditing(customNightSpan(night))}
        >
          {message(locale, "plannerNightSpanCustom")}
        </button>
      </div>
      <div
        className="planner-night-span-timeline"
        ref={containerRef}
        style={{ height: `${height}px` }}
      >
        <TimelineDrawing
          night={night}
          hourly={hourly}
          span={span}
          custom={custom}
          plainHours={custom && !editing}
          forecast={forecastAvailable}
          width={width}
          top={top}
          plotHeight={plotHeight}
          clock={shortClock}
          utcOffsetMinutes={utcOffsetMinutes}
          description={nightSpanChartDescription({
            locale,
            sky: night,
            summary,
            custom,
            date,
            clock,
          })}
        />
        {editing && handle("start")}
        {editing && handle("end")}
      </div>
      {/* « Prévisions météo indisponibles pour cette date »: a data
          warning, one visible line under the drawing; over the drawing it hid the hours, the Moon and
          the handles. Its line keeps its room,
          unseen and unread, once the forecast is there: the forecast
          arriving does not change the height of stage 1. */}
      <p
        className={`planner-night-span-no-forecast${forecastAvailable ? " is-reserved" : ""}`}
        role={
          forecastAvailable
            ? undefined
            : missing === "loading"
              ? "status"
              : "note"
        }
        aria-hidden={forecastAvailable ? "true" : undefined}
        aria-busy={
          !forecastAvailable && missing === "loading" ? "true" : undefined
        }
      >
        {missing === "loading" ? (
          <BrandLoader size={16} />
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 9.1 4.5 4.5 0 0 0 7 18z" />
            <path d="M4 4l16 16" />
          </svg>
        )}
        <span>{message(locale, noForecastKey)}</span>
      </p>
      <ul className="planner-night-span-legend">
        {forecastAvailable && (
          <>
            <li>
              <svg
                width="18"
                height="10"
                viewBox="0 0 18 10"
                aria-hidden="true"
              >
                <path
                  d="M1 7.5 C5 7.5 7 3 11 3 S15 4.5 17 3.5"
                  fill="none"
                  stroke="#c9d1cf"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {message(locale, "plannerNightSpanLegendClouds")}
            </li>
            <li>
              <svg
                width="14"
                height="12"
                viewBox="0 0 14 12"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="6"
                  width="3"
                  height="6"
                  rx="0.5"
                  fill="#83C5D0"
                />
                <rect
                  x="5.5"
                  y="1"
                  width="3"
                  height="11"
                  rx="0.5"
                  fill="#83C5D0"
                />
                <rect
                  x="10"
                  y="4"
                  width="3"
                  height="8"
                  rx="0.5"
                  fill="#83C5D0"
                />
              </svg>
              {message(locale, "plannerNightSpanLegendRain")}
            </li>
          </>
        )}
        <li>
          <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
            <line
              x1="2"
              y1="6"
              x2="15"
              y2="6"
              stroke="#ffe0ae"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <path
              d="M16 1.5 A4.5 4.5 0 0 1 16 10.5 A2 4.5 0 0 0 16 1.5 Z"
              fill="#ffe0ae"
            />
          </svg>
          {message(locale, "plannerNightSpanLegendMoon")}
        </li>
      </ul>
      <div className="planner-night-span-summary">
        <div className="planner-night-span-summary-row">
          <p className="planner-night-span-range">
            {custom ? (
              <>
                {range} ·{" "}
                <span>
                  {fillMessage(message(locale, "plannerNightSpanOfNight"), {
                    duration,
                  })}
                </span>
              </>
            ) : (
              <>
                {message(locale, "plannerNightSpanWholeNight")} ·{" "}
                <span className="planner-night-span-nowrap">
                  {range} · <span>{duration}</span>
                </span>
              </>
            )}
          </p>
          {/* Editing is a
            pencil: at rest a pencil, outside the four levels; in edition a
            tick with the secondary look in its place. */}
          {controlled ? null : editing ? (
            <button
              type="button"
              className="btn-secondary planner-night-span-validate"
              aria-label={message(locale, "plannerNightSpanValidate")}
              title={message(locale, "plannerNightSpanValidate")}
              onClick={() => finish(draft)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </button>
          ) : stored && editable ? (
            <button
              type="button"
              className="planner-night-span-edit"
              aria-label={message(locale, "plannerNightSpanEdit")}
              title={message(locale, "plannerNightSpanEdit")}
              onClick={() =>
                startEditing({ start: night.start, end: night.end })
              }
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
            </button>
          ) : null}
        </div>
        <p className="planner-night-span-forecast">
          {forecastParts === null
            ? noForecastHelpKey
              ? message(locale, noForecastHelpKey)
              : ""
            : fillMessage(message(locale, "plannerNightSpanForecastLine"), {
                parts: forecastParts,
              })}
        </p>
      </div>
      {custom && (
        <>
          {editing && (
            <p id="planner-night-span-hint" className="planner-night-span-hint">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 8l-4 4 4 4" />
                <path d="M16 8l4 4-4 4" />
                <path d="M4 12h16" />
              </svg>
              <span>{message(locale, "plannerNightSpanHint")}</span>
            </p>
          )}
          <div className="planner-night-span-actions">
            <button
              type="button"
              className="btn-link planner-night-span-reset"
              disabled={!editable}
              onClick={() => finish(stored ? { mode: "astronomical" } : null)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
              {message(locale, "plannerNightSpanReset")}
            </button>
            {editing && !controlled && (
              <button
                type="button"
                className="btn-link planner-night-span-cancel"
                onClick={() => finish(null)}
              >
                {message(locale, "plannerCancel")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
