"use client";

import { useEffect, useId, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { clockText, durationText } from "../../written-forms.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { say } from "./night-detail-view.js";
import {
  detectedSentence,
  isDetectedKind,
  REPORT_KIND_KEY,
} from "./session-page-view.js";
import { DetectedMention } from "./DetectedMention.js";
import { isIncidentKind } from "./session-rework.js";

// « Frise de la nuit » of the page of a session, in the read mode of the
// shared frise and with two rows: from top to bottom the hours of the
// place (« heures du lieu », or « UTC » written for a place without a zone)
// with a scale that gets finer with the zoom, « plan initial » (the plan as
// launched, thin frames without colour, never modified), then **the
// execution**: one segment per passage at its real hours, in the colour of
// its target (the same at each of its passages), its name inside when it fits
// whole, else in a flag above (numbers tied to a line of legend when flags
// would touch) — a pause hatched yellow at its hours on the segment —, the
// band of what the night really gave (cut the same way, in the same colours),
// « plus le temps ce soir » under it, and one line and one icon per event of
// the night: a click (or Enter) opens its detail under the frise
// (a popover). The zoom is Ctrl + wheel and the « − » / « + »
// buttons, « ×2,0 » brings the whole night back. In
// « Remanier la session » the first segment of each target held is a handle:
// dragged with the pointer onto another target it takes its place before or after
// it, with the arrow keys when it has the focus; a small number under it says its
// place in the order. Its colours are `.session-frise-*` in `portal.css`, so the
// red night mode filters it with the page. « Lire la frise » is the ⓘ of the
// header.

const WIDTH = 1040;
const LABEL_COLUMN = 76;
const TICK_Y = 12;
const INITIAL_Y = 26;
const INITIAL_HEIGHT = 13;
const PLANNED_Y = 46;
const PLANNED_HEIGHT = 34;
const ACTUAL_Y = 88;
const ACTUAL_HEIGHT = 16;
const MARKER_FIRST_Y = 128;
const MARKER_STEP = 24;
const MARKER_RADIUS = 10;
const ZOOM_MAX = 8;
/** The room of the flags above the execution row. */
const FLAG_ROOM = 22;
const FLAG_HEIGHT = 14;

/** The margin a slot keeps around its text, both sides together. */
const FRISE_TEXT_MARGIN = 6;

/** A rough width of a label at `size` px: wide for Japanese, narrow for Latin. */
function labelWidth(label, size) {
  let width = 0;
  for (const char of label)
    width += char.codePointAt(0) > 0x2e80 ? size : size * 0.58;
  return width;
}

/**
 * The steps of the scale at `pixelsPerMinute` (on screen) — the finest
 * of 15, 30 and 60 min whose labels stay 40 px apart, and the unlabelled
 * marks under them (5, 10, 15 min).
 */
export function friseScaleSteps(pixelsPerMinute) {
  if (15 * pixelsPerMinute >= 40) return { label: 15, tick: 5 };
  if (30 * pixelsPerMinute >= 40) return { label: 30, tick: 10 };
  return { label: 60, tick: 15 };
}

/** The minute of the day of `at` in `zone` (UTC when it has none). */
function localMinute(at, zone) {
  const [hours, minutes] = clockText(at, zone).split(":").map(Number);
  return hours * 60 + minutes;
}

/** The instants of the local boundaries of `step` minutes in [start, end]. */
export function friseMarks(start, end, zone, step) {
  const marks = [];
  const minute = 60_000;
  for (
    let at = Math.ceil((start + 1) / minute) * minute;
    at < end;
    at += minute
  )
    if (localMinute(at, zone) % step === 0) marks.push(at);
  return marks;
}

const DETECTED_GLYPHS = {
  // a stopwatch
  exposure: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13V9M9.5 3h5" />
    </>
  ),
  // an hourglass
  guidingTimeout: (
    <path d="M7 3h10M7 21h10M8 3v4l4 5-4 5v4M16 3v4l-4 5 4 5v4" />
  ),
  // a thermometer
  temperature: <path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" />,
  // a curve with spikes
  guidingSpikes: <path d="M3 15l4-2 3 5 4-13 3 8 4-2" />,
  // « info »: a kind this version does not know
  signal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.1" />
    </>
  ),
};

/** The glyph of a report's kind, drawn in a 24 × 24 box centred on (0, 0). */
export function ReportGlyph({ kind, size = 12 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "-12 -12 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
  if (kind === "pause")
    return (
      <svg {...common}>
        <path d="M-4 -6v12M4 -6v12" />
      </svg>
    );
  if (kind === "sky")
    return (
      <svg {...common}>
        <path d="M-7 5a4.5 4.5 0 0 1 .5-9 6 6 0 0 1 11.5 1.5 3.7 3.7 0 0 1-.5 7.5z" />
      </svg>
    );
  if (kind === "incident")
    return (
      <svg {...common}>
        <path d="M0 -8l8 14h-16zM0 -2v4M0 4.5v.1" />
      </svg>
    );
  // The four kinds Astro Sync detects and the fall-back of an unknown kind,
  // drawn in a 24 × 24 box, in the same stroke.
  const drawn = DETECTED_GLYPHS[kind];
  if (drawn)
    return (
      <svg {...common} viewBox="0 0 24 24">
        {drawn}
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M-5 -8h7l4 4v12h-11zM2 -8v4h4M-2 1h5M-2 5h5" />
    </svg>
  );
}

const LEGEND_EXTRA_KINDS = [
  "exposure",
  "guidingTimeout",
  "temperature",
  "guidingSpikes",
  "signal",
];

/** The legend of the frise, as a row of swatches under it. */
function Legend({
  locale,
  pause = true,
  present = [],
  initial = true,
  visual = false,
}) {
  // Only what is drawn — the rail of the plan as
  // launched, the execution in the colour of each target, the pauses.
  const items = [
    // A night with no plan as launched (a free execution) draws no such rail.
    ...(initial ? [["is-initial", "sessionPageLegendInitialLong"]] : []),
    [
      "is-colours",
      visual
        ? "sessionPageLegendObservationColour"
        : "sessionPageLegendCaptureColour",
    ],
    ...(pause ? [["is-pause", "sessionPageLegendPause"]] : []),
  ];
  const kinds = [
    ["sky", "sessionPageLegendSky"],
    ["note", "sessionPageLegendNote"],
    ["incident", "sessionPageLegendIncident"],
  ].filter(([kind]) => present.includes(kind));
  const extra = [
    // One entry per kind present in the night.
    ...LEGEND_EXTRA_KINDS.filter((kind) => present.includes(kind)).map(
      (kind) => [kind, REPORT_KIND_KEY[kind]],
    ),
  ];
  kinds.push(...extra);
  return (
    <ul className="session-frise-legend">
      {items.map(([className, key]) => (
        <li key={key}>
          <i className={`session-frise-swatch ${className}`} aria-hidden />
          {message(locale, key)}
        </li>
      ))}
      {kinds.map(([kind, key]) => (
        <li key={key}>
          <ReportGlyph kind={kind} />
          {message(locale, key)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The marker rows: a report keeps the first row where it clears the markers
 * already placed (a round pastille is 24 px wide on screen).
 */
function markerRows(markers, scale) {
  const rows = [];
  let deepest = 0;
  for (const marker of [...markers].sort((a, b) => a.x - b.x)) {
    let row = 0;
    while (
      (rows[row] ?? []).some((other) => Math.abs(other - marker.x) * scale < 24)
    )
      row += 1;
    rows[row] ??= [];
    rows[row].push(marker.x);
    marker.row = row;
    deepest = Math.max(deepest, row);
  }
  return deepest;
}

/** The part of [start, end] each of `spans` covers. */
function overlap(start, end, spans) {
  return spans
    .map((span) => ({
      start: Math.max(start, span.start),
      end: Math.min(end, span.end),
    }))
    .filter((span) => span.end > span.start);
}

const KIND_KEY = REPORT_KIND_KEY;

/** The detail of an event of the frise. */
export function EventPopover({
  locale,
  report,
  label,
  zone,
  onClose,
  onEdit = null,
}) {
  const titleId = useId();
  const kind = message(
    locale,
    KIND_KEY[report.kind] ?? "sessionPageLegendNote",
  );
  const head = `${kind.charAt(0).toLocaleUpperCase(locale)}${kind.slice(1)}`;
  const lines = [
    report.until !== null && report.until !== undefined
      ? `${clockText(report.at, zone)} → ${clockText(report.until, zone)} · ${durationText((report.until - report.at) / 60_000, locale)}`
      : clockText(report.at, zone),
    // The sentence of a report Astro Sync detects.
    isDetectedKind(report.kind) ? detectedSentence(report, locale, zone) : null,
    label
      ? say(locale, "sessionPageFriseEventDuring", { target: label })
      : null,
  ].filter(Boolean);
  return (
    <div
      className="session-frise-popover"
      role="dialog"
      aria-labelledby={titleId}
      data-testid="session-frise-event"
    >
      <p className="session-frise-popover-title" id={titleId}>
        {message(locale, "sessionPageFriseEventTitle")}
      </p>
      <p className="session-frise-popover-kind">
        <ReportGlyph kind={report.kind} size={14} />
        {head}
      </p>
      {lines.map((line) => (
        <p key={line} className="session-frise-popover-line">
          {line}
        </p>
      ))}
      {report.text ? (
        <p className="session-frise-popover-text">{report.text}</p>
      ) : null}
      {report.detected ? (
        <p className="session-frise-popover-line">
          <DetectedMention locale={locale} />
        </p>
      ) : null}
      {isDetectedKind(report.kind) && !isIncidentKind(report.kind) ? (
        // What is not edited says so: it is removed, not edited.
        <p
          className="session-frise-popover-note"
          data-testid="session-frise-event-not-editable"
        >
          {message(locale, "sessionPageDetectedNotEditable")}
        </p>
      ) : null}
      {isIncidentKind(report.kind) && onEdit ? (
        // The incident's sheet — « Modifier » beside
        // « Fermer ».
        <div className="btn-row">
          <button
            type="button"
            className="btn-secondary"
            data-testid="session-frise-event-edit"
            onClick={() => {
              onClose();
              onEdit(report);
            }}
          >
            {message(locale, "sessionPageFriseEventEdit")}
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            {message(locale, "infoClose")}
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn-link" onClick={onClose}>
            {message(locale, "infoClose")}
          </button>
        </div>
      )}
    </div>
  );
}

export function SessionFrise({
  locale = "en",
  frise,
  title = null,
  children = null,
  reorder = null,
  timeZone = null,
  onEditEvent = null,
  visual = false,
}) {
  const patternId = useId().replaceAll(":", "");
  const [drag, setDragState] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [opened, setOpened] = useState(null);
  const [viewport, setViewport] = useState(WIDTH);
  // The drag lives in a ref as well: two pointer events can come before the
  // page draws again, and the handlers must read the latest of them.
  const dragRef = useRef(null);
  const setDrag = (next) => {
    dragRef.current = next;
    setDragState(next);
  };
  const svgRef = useRef(null);
  const scrollRef = useRef(null);
  const focusKey = useRef(null);
  const orderKey = reorder ? reorder.order.join("\u0000") : "";
  // The keyboard's move keeps the focus on the box that moved: the boxes are
  // reordered in the document, which can drop it.
  useEffect(() => {
    if (!focusKey.current || !svgRef.current) return;
    const key = focusKey.current;
    focusKey.current = null;
    [...svgRef.current.querySelectorAll("[data-frise-box]")]
      .find((node) => node.getAttribute("data-frise-box") === key)
      ?.focus();
  }, [orderKey]);
  // The width of the column the frise is drawn in: the scale's step is
  // chosen on screen pixels.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() =>
      setViewport(node.clientWidth || WIDTH),
    );
    observer.observe(node);
    setViewport(node.clientWidth || WIDTH);
    return () => observer.disconnect();
  }, []);
  // Ctrl + wheel zooms; the wheel alone scrolls the page.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) =>
        Math.min(
          ZOOM_MAX,
          Math.max(1, current * Math.exp(-event.deltaY / 200)),
        ),
      );
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);
  if (!frise) return null;
  const zone = timeZone && timeZone !== "UTC" ? timeZone : null;
  const right = WIDTH - 8;
  const span = frise.end - frise.start;
  const xOf = (at) =>
    LABEL_COLUMN + ((right - LABEL_COLUMN) * (at - frise.start)) / span;
  // One unit of the drawing on screen, at this zoom (the drawing is at least
  // 38rem wide, `.session-frise-svg`).
  const scale = (Math.max(viewport, 608) * zoom) / WIDTH;
  const steps = friseScaleSteps(
    ((right - LABEL_COLUMN) / (span / 60_000)) * scale,
  );
  const marks = friseMarks(frise.start, frise.end, zone, steps.label).filter(
    (mark) => xOf(mark) <= WIDTH - 16,
  );
  const minor = friseMarks(frise.start, frise.end, zone, steps.tick).filter(
    (mark) => !marks.includes(mark),
  );
  const pauses = frise.pauses ?? [];
  const markers = frise.reports
    .filter((report) => report.kind !== "pause")
    .map((report) => ({ report, x: xOf(report.at) }));
  const deepest = markerRows(markers, scale);
  const labels = Object.fromEntries(
    frise.planned.map((box) => [box.key, box.label]),
  );
  const held = reorder?.order ?? [];
  const initial = frise.planned.filter((box) => box.kind !== "added");
  /** The x of the pointer in the frise's own units (the SVG scales to its column). */
  const pointerX = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return ((event.clientX - rect.left) * WIDTH) / rect.width;
  };
  const boxUnder = (x, key) =>
    frise.runs.find(
      (run) => run.key !== key && x >= xOf(run.start) && x <= xOf(run.end),
    ) ?? null;
  const beginDrag = (box) => (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ key: box.key, from: pointerX(event), dx: 0, over: null });
  };
  const moveDrag = (event) => {
    const current = dragRef.current;
    if (!current) return;
    const x = pointerX(event);
    const over = boxUnder(x, current.key);
    setDrag({
      ...current,
      dx: x - current.from,
      over: over
        ? { key: over.key, after: x > (xOf(over.start) + xOf(over.end)) / 2 }
        : null,
    });
  };
  const endDrag = (event) => {
    const current = dragRef.current;
    if (!current) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (current.over && Math.abs(current.dx) > 4) {
      focusKey.current = current.key;
      reorder.onDrop(current.key, current.over.key, current.over.after);
    }
    setDrag(null);
  };
  const keyMove = (box) => (event) => {
    const step =
      event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : 0;
    if (!step) return;
    event.preventDefault();
    focusKey.current = box.key;
    reorder.onStep(box.key, step);
  };
  const openOnKey = (report) => (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setOpened(report);
  };
  // The segments of the execution, one per passage, and the
  // marks of the ones too narrow for their name — a flag, or (flags that
  // would touch) a number tied to a line of legend, for the whole frise.
  const colourOf = (key) => (frise.colours?.[key] ?? 0) % 8;
  const passageCount = new Map();
  const segments = [...frise.runs]
    .sort((a, b) => a.start - b.start)
    .map((run, index) => {
      const passage = passageCount.get(run.key) ?? 0;
      passageCount.set(run.key, passage + 1);
      return { ...run, id: `${run.key}-${index}`, passage };
    });
  const firstOf = new Map();
  for (const segment of segments)
    if (!firstOf.has(segment.key)) firstOf.set(segment.key, segment.id);
  const flagOf = new Set(
    segments
      .filter(
        (segment) =>
          (labelWidth(labels[segment.key] ?? segment.key, 13) +
            FRISE_TEXT_MARGIN) /
            scale >
          Math.max(2, xOf(segment.end) - xOf(segment.start) - 1),
      )
      .map((segment) => segment.id),
  );
  let flags = segments
    .filter((segment) => flagOf.has(segment.id))
    .map((segment) => {
      const anchor = (xOf(segment.start) + xOf(segment.end)) / 2;
      const width =
        (labelWidth(labels[segment.key] ?? segment.key, 11) + 8) / scale;
      return {
        id: segment.id,
        key: segment.key,
        anchor,
        centre: anchor,
        width,
        y: 0,
      };
    });
  const touching = flags.some(
    (flag, index) =>
      index > 0 &&
      flags[index - 1].key !== flag.key &&
      flag.centre - flag.width / 2 <
        flags[index - 1].centre + flags[index - 1].width / 2 + 2 / scale,
  );
  const numbers = new Map();
  if (touching) {
    for (const flag of flags)
      if (!numbers.has(flag.key)) numbers.set(flag.key, numbers.size + 1);
    const size = FLAG_HEIGHT / scale;
    const lastRight = [-Infinity, -Infinity];
    flags = flags.map((flag) => {
      const left = flag.anchor - size / 2;
      const level = left >= lastRight[0] ? 0 : left >= lastRight[1] ? 1 : 0;
      lastRight[level] = flag.anchor + size / 2;
      return {
        ...flag,
        width: size,
        y: INITIAL_Y + INITIAL_HEIGHT + 2 + level * 8,
      };
    });
  } else
    flags = flags.map((flag) => ({
      ...flag,
      y: INITIAL_Y + INITIAL_HEIGHT + 2,
    }));
  const lift = flags.length ? FLAG_ROOM : 0;
  const plannedY = PLANNED_Y + lift;
  const actualY = ACTUAL_Y + lift;
  const markerY = MARKER_FIRST_Y + lift;
  const height = markerY + MARKER_STEP * deepest + MARKER_RADIUS + 6;
  const pauseHatch = `url(#${patternId}-pause)`;
  const description = [
    message(locale, "sessionPageFriseTitle"),
    ...frise.planned
      .filter((box) => box.kind !== "removed")
      .map(
        (box) =>
          `${box.label} ${clockText(box.start, zone)} → ${clockText(box.end, zone)}`,
      ),
  ].join(" · ");
  const zoomLabel = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(zoom);
  return (
    <section
      className="night-card session-frise"
      aria-labelledby="session-frise-title"
    >
      <div className="night-section-head">
        <div className="session-frise-titles">
          <h2 id="session-frise-title">
            {title ?? message(locale, "sessionPageFriseTitle")}
          </h2>
          <p className="session-frise-hours-caption">
            {zone ? message(locale, "sessionPageFriseLocalHours") : "UTC"}
          </p>
        </div>
        <div className="session-frise-tools">
          {zoom > 1.0001 ? (
            <button
              type="button"
              className="btn-link"
              title={message(locale, "sessionPageFriseZoomReset")}
              aria-label={message(locale, "sessionPageFriseZoomReset")}
              data-testid="session-frise-zoom-reset"
              onClick={() => setZoom(1)}
            >
              {`×${zoomLabel}`}
            </button>
          ) : null}
          <button
            type="button"
            className="session-frise-zoom"
            aria-label={message(locale, "sessionPageFriseZoomOut")}
            title={message(locale, "sessionPageFriseZoomOut")}
            disabled={zoom <= 1}
            onClick={() => setZoom((current) => Math.max(1, current / 2))}
          >
            −
          </button>
          <button
            type="button"
            className="session-frise-zoom"
            aria-label={message(locale, "sessionPageFriseZoomIn")}
            title={message(locale, "sessionPageFriseZoomIn")}
            disabled={zoom >= ZOOM_MAX}
            data-testid="session-frise-zoom-in"
            onClick={() =>
              setZoom((current) => Math.min(ZOOM_MAX, current * 2))
            }
          >
            +
          </button>
          <InfoButton
            locale={locale}
            label={message(locale, "sessionPageFriseRead")}
            title={message(locale, "sessionPageFriseRead")}
            body={message(locale, "sessionPageFriseLegendBody")}
            testId="session-frise-read"
          >
            <Legend
              locale={locale}
              initial={initial.length > 0}
              visual={visual}
              present={frise.reports.map((report) => report.kind)}
            />
          </InfoButton>
        </div>
      </div>
      <div className="session-frise-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          className="session-frise-svg"
          style={{ width: `${zoom * 100}%` }}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role={reorder ? "group" : "img"}
          aria-label={description}
          data-testid="session-frise"
          data-zoom={zoom}
          data-scale-step={steps.label}
        >
          <defs>
            <pattern
              id={`${patternId}-hatch`}
              className="session-frise-hatch-cancelled"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" />
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2" />
            </pattern>
            <pattern
              id={`${patternId}-pause`}
              className="session-frise-hatch-pause"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" />
              <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.2" />
            </pattern>
          </defs>
          <g className="session-frise-hours">
            {minor.map((mark) => (
              <line
                key={`minor-${mark}`}
                className="session-frise-minor"
                x1={xOf(mark)}
                y1={TICK_Y + 4}
                x2={xOf(mark)}
                y2={TICK_Y + 7}
              />
            ))}
            {marks.map((mark) => {
              const label = clockText(mark, zone);
              return (
                <g key={mark}>
                  <text
                    x={xOf(mark)}
                    y={TICK_Y}
                    textAnchor="middle"
                    className={label.endsWith(":00") ? "is-hour" : "is-minute"}
                  >
                    {label}
                  </text>
                  <line
                    className="session-frise-grid"
                    x1={xOf(mark)}
                    y1={TICK_Y + 3}
                    x2={xOf(mark)}
                    y2={actualY + ACTUAL_HEIGHT + 4}
                  />
                </g>
              );
            })}
          </g>
          {initial.length ? (
            <text className="session-frise-row" x="0" y={INITIAL_Y + 10}>
              {message(locale, "sessionPageFriseInitial")}
            </text>
          ) : null}
          {initial.map((box) => {
            const x0 = xOf(box.start);
            const width = Math.max(2, xOf(box.end) - x0 - 1);
            return (
              <g
                key={`${box.key}-initial`}
                className="session-frise-initial"
                data-initial={box.key}
              >
                <rect
                  x={x0 + 0.5}
                  y={INITIAL_Y}
                  width={width}
                  height={INITIAL_HEIGHT}
                  rx="2"
                />
                {labelWidth(box.label, 9) + FRISE_TEXT_MARGIN <=
                width * scale ? (
                  <text x={x0 + 4} y={INITIAL_Y + 10}>
                    {box.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {segments.map((segment) => {
            // The execution — one segment per passage, at its
            // real hours, in the colour of its target; its name inside when
            // it fits whole, else in a flag above.
            const x0 = xOf(segment.start);
            const x1 = xOf(segment.end);
            const width = Math.max(2, x1 - x0 - 1);
            const label = labels[segment.key] ?? segment.key;
            const fits = !flagOf.has(segment.id);
            const handle = firstOf.get(segment.key) === segment.id;
            const place = held.indexOf(segment.key);
            const movable = Boolean(reorder) && handle && place >= 0;
            const dragging = movable && drag?.key === segment.key;
            const isOver = handle && drag?.over?.key === segment.key;
            const paused = overlap(segment.start, segment.end, pauses);
            const box = {
              key: segment.key,
              start: segment.start,
              end: segment.end,
            };
            const interaction = movable
              ? {
                  tabIndex: 0,
                  role: "button",
                  "data-frise-box": segment.key,
                  "aria-label": say(locale, "sessionPageReworkFriseBox", {
                    target: label,
                    place: place + 1,
                    count: held.length,
                  }),
                  onPointerDown: beginDrag(box),
                  onPointerMove: moveDrag,
                  onPointerUp: endDrag,
                  onPointerCancel: () => setDrag(null),
                  onKeyDown: keyMove(box),
                }
              : {};
            return (
              <g
                key={segment.id}
                className={`session-frise-box session-frise-segment is-c${colourOf(segment.key)}${movable ? " is-draggable" : ""}${dragging ? " is-dragging" : ""}${isOver ? ` is-drop-${drag.over.after ? "after" : "before"}` : ""}`}
                data-segment={segment.key}
                data-passage={segment.passage}
                transform={dragging ? `translate(${drag.dx} 0)` : undefined}
                {...interaction}
              >
                <rect
                  x={x0 + 0.5}
                  y={plannedY}
                  width={width}
                  height={PLANNED_HEIGHT}
                  rx="4"
                />
                {paused.map((part) => (
                  <rect
                    key={`${part.start}-pause`}
                    className="session-frise-box-pause"
                    data-pause={segment.key}
                    x={xOf(part.start)}
                    y={plannedY + 1}
                    width={Math.max(1, xOf(part.end) - xOf(part.start))}
                    height={PLANNED_HEIGHT - 2}
                    style={{ fill: pauseHatch }}
                  />
                ))}
                {fits ? (
                  <text
                    x={x0 + 4}
                    y={plannedY + PLANNED_HEIGHT / 2 + 4.5}
                    data-name={segment.key}
                  >
                    {label}
                  </text>
                ) : null}
                {movable ? (
                  <g
                    className="session-frise-place"
                    transform={`translate(${(x0 + x1) / 2} ${plannedY + PLANNED_HEIGHT + 7})`}
                  >
                    <circle r="6.5" />
                    <text y="3.6" textAnchor="middle">
                      {place + 1}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {flags.map((flag) => (
            <g
              key={`${flag.id}-flag`}
              className={`session-frise-flag is-c${colourOf(flag.key)}${numbers.size ? " is-number" : ""}`}
              data-flag={flag.key}
            >
              <line
                x1={flag.anchor}
                y1={flag.y + FLAG_HEIGHT}
                x2={flag.anchor}
                y2={plannedY}
              />
              <rect
                x={flag.centre - flag.width / 2}
                y={flag.y}
                width={flag.width}
                height={FLAG_HEIGHT}
                rx={numbers.size ? FLAG_HEIGHT / 2 : 3}
              />
              <text
                x={flag.centre}
                y={flag.y + FLAG_HEIGHT - 4}
                textAnchor="middle"
              >
                {numbers.size ? numbers.get(flag.key) : labels[flag.key]}
              </text>
            </g>
          ))}
          {frise.runs.map((run, index) => (
            <rect
              key={`${run.key}-${run.start}-${index}`}
              className={`session-frise-run is-c${colourOf(run.key)}`}
              x={xOf(run.start)}
              y={actualY}
              width={Math.max(1, xOf(run.end) - xOf(run.start))}
              height={ACTUAL_HEIGHT}
            />
          ))}
          {pauses.map((pause) => {
            const report = frise.reports.find(
              (entry) => entry.id === pause.id,
            ) ?? {
              id: pause.id,
              kind: "pause",
              at: pause.start,
              until: pause.end,
            };
            return (
              <rect
                key={`${pause.id}-pause`}
                className="session-frise-pause"
                x={xOf(pause.start)}
                y={actualY}
                width={Math.max(1, xOf(pause.end) - xOf(pause.start))}
                height={ACTUAL_HEIGHT}
                fill={pauseHatch}
                role="button"
                tabIndex={0}
                aria-label={message(locale, "sessionPageLegendPause")}
                data-report={pause.id}
                onClick={() => setOpened(report)}
                onKeyDown={openOnKey(report)}
              />
            );
          })}
          {markers.map(({ report, x, row }) => {
            const cy = markerY + MARKER_STEP * row;
            return (
              <g
                key={`${report.id}-marker`}
                className={`session-frise-marker is-${report.kind}`}
                data-report={report.id}
                role="button"
                tabIndex={0}
                aria-label={message(
                  locale,
                  KIND_KEY[report.kind] ?? "sessionPageLegendNote",
                )}
                onClick={() => setOpened(report)}
                onKeyDown={openOnKey(report)}
              >
                <line
                  className="session-frise-stem"
                  x1={x}
                  y1={plannedY}
                  x2={x}
                  y2={cy - MARKER_RADIUS}
                />
                <circle cx={x} cy={cy} r={MARKER_RADIUS} />
                <g
                  transform={`translate(${x - 6} ${cy - 6})`}
                  className="glyph"
                >
                  <ReportGlyph kind={report.kind} />
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      {opened ? (
        <EventPopover
          locale={locale}
          report={opened}
          label={opened.targetKey ? labels[opened.targetKey] : null}
          zone={zone}
          onClose={() => setOpened(null)}
          onEdit={onEditEvent}
        />
      ) : null}
      {frise.noTime?.length ? (
        <p
          className="session-frise-no-time"
          data-testid="session-frise-no-time"
        >
          {frise.noTime.map((label) => (
            <span key={label}>
              {"✕ "}
              <strong>{label}</strong>
              {` · ${message(locale, "sessionPageFriseNoTime")}`}
            </span>
          ))}
        </p>
      ) : null}
      {numbers.size ? (
        <ul
          className="session-frise-numbers"
          data-testid="session-frise-numbers"
        >
          {[...numbers.entries()].map(([key, number]) => {
            const own = frise.runs.filter((run) => run.key === key);
            const counted = own.reduce((total, run) => {
              const paused = overlap(run.start, run.end, pauses).reduce(
                (sum, part) => sum + part.end - part.start,
                0,
              );
              return total + run.end - run.start - paused;
            }, 0);
            return (
              <li key={key}>
                <i className={`session-frise-number is-c${colourOf(key)}`}>
                  {number}
                </i>
                {own.length > 1
                  ? say(locale, "sessionPageFriseNumberLegend", {
                      name: labels[key] ?? key,
                      count: own.length,
                      duration: durationText(counted / 60_000, locale),
                    })
                  : `${labels[key] ?? key} · ${durationText(counted / 60_000, locale)}`}
              </li>
            );
          })}
        </ul>
      ) : null}
      <Legend
        locale={locale}
        initial={initial.length > 0}
        visual={visual}
        pause={pauses.length > 0}
        present={frise.reports.map((report) => report.kind)}
      />
      {children}
    </section>
  );
}
