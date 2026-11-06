"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { message } from "portal/i18n.js";
import { plannerFlowMessage as flow } from "../../planner/flow-messages.js";
import {
  horizonCardinalDirection,
  horizonMaskPointCount,
  horizonMaskStep,
  normaliseHorizonMask,
} from "portal/planner/horizon-mask.js";
import {
  grabbedHorizonHandle,
  horizonEditorAltitudeAt,
  horizonEditorCrownSegments,
  horizonEditorDirectionAt,
  horizonEditorDragStep,
  horizonEditorGestureStart,
  horizonEditorInReach,
  horizonEditorPosition,
  horizonEditorSurveyedLabel,
  steppedHorizonMask,
  withHorizonPointAltitude,
  withHorizonPointAltitudes,
} from "portal/planner/horizon-editor.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The horizon profile of one place: one point every 10° (thirty-six
// handles). The handles are too close to each own a hit area: the plot takes
// the pointer and gives it to the nearest handle within reach, else to the
// direction under it (`portal/planner/horizon-editor.js`). The selected point
// is named under the plot (direction, height) with « − » / « + » steppers of
// one degree; on the keyboard, ← / → move to the neighbouring point and
// ↑ / ↓ raise or lower it by one degree.

// The legend of the sectors (« Relevé » / « À relever »), drawn by the
// place's form beside « Réinitialiser l’horizon »: the crown of the circular
// plot and the band of the linear one read with it.
export function PlannerHorizonSectorsLegend({ locale }) {
  return (
    <ul
      className="planner-horizon-sectors-legend"
      aria-label={flow(locale, "horizonSectorsLegend")}
    >
      <li>
        <span className="planner-horizon-sectors-swatch is-surveyed" />
        {flow(locale, "horizonSurveyed")}
      </li>
      <li>
        <span className="planner-horizon-sectors-swatch is-to-survey" />
        {flow(locale, "horizonToSurvey")}
      </li>
    </ul>
  );
}

// Whether « Réglages précis » is open: the page's session, never stored, so the
// tile is folded at every load and a choice holds from one screen to the next.
let fineSettingsOpen = false;

export function PlannerHorizonEditor({
  locale,
  mask,
  onChange,
  readOnly = false,
  // The compact mode, for a place's own page: the circular plot alone
  // (the mask, the grid and the cardinals), read only, with no
  // orientation slider, no folded settings tile and no handle.
  compact = false,
  // The place's form only: the crown of the surveyed sectors on the circular
  // plot, the band under the linear one, and the survey date of the chosen
  // direction. The read-only views of a place do not draw them.
  showSurveyedSectors = false,
  // The place's time zone, for the survey date.
  timeZone = null,
}) {
  const draft = normaliseHorizonMask(mask);
  const [projection, setProjection] = useState("circular");
  const [rotation, setRotation] = useState(0);
  const [activeHandleIndex, setActiveHandleIndex] = useState(null);
  const [direction, setDirection] = useState(0);
  const plotRef = useRef(null),
    draggingIndexRef = useRef(null),
    lastLocalRef = useRef(null),
    // The zenith rule of the circular plot: the gesture's state, and the
    // mask when the pointer went down, given back when the stroke goes
    // through the zenith.
    gestureRef = useRef(null),
    gestureStartRef = useRef(null);
  // Screen pixels per user unit of the linear plot, which is stretched to
  // its box (`preserveAspectRatio="none"`), so that its handles stay round.
  const [linearScale, setLinearScale] = useState({ x: 2, y: 2 });
  useLayoutEffect(() => {
    const svg = plotRef.current;
    if (projection !== "linear" || !svg) return undefined;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      if (box.width && box.height)
        setLinearScale({ x: box.width / 360, y: box.height / 90 });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [projection]);
  const change = (next, index) => {
    if (readOnly || compact) return;
    setDirection(index);
    onChange(next);
  };
  const setPointAltitude = (index, altitude) =>
    change(withHorizonPointAltitude(draft, index, altitude), index);
  const stepPoint = (index, delta) =>
    change(steppedHorizonMask(draft, index, delta), index);
  const localPoint = (event) => {
    const svg = plotRef.current,
      matrix = svg?.getScreenCTM();
    if (!matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  };
  const plotScale = () => {
    const box = plotRef.current?.getBoundingClientRect();
    if (!box?.width || !box?.height) return { scaleX: 1, scaleY: 1 };
    if (projection === "circular") {
      const scale = Math.min(box.width, box.height) / 200;
      return { scaleX: scale, scaleY: scale };
    }
    return { scaleX: box.width / 360, scaleY: box.height / 90 };
  };
  const movePoint = (event, index) => {
    const local = localPoint(event);
    if (!local) return;
    setPointAltitude(index, horizonEditorAltitudeAt(local, projection));
  };
  // One gesture draws the whole horizon. When the pointer leaves the
  // held point sideways, the point it is heading to (and those it passed
  // over) is attracted to it; a little wobble keeps the held point.
  const dragPoint = (event, held) => {
    const local = localPoint(event);
    if (!local) return;
    const step = horizonEditorDragStep(
      draft.points,
      held,
      lastLocalRef.current,
      local,
      { projection, rotation, ...plotScale(), gesture: gestureRef.current },
    );
    lastLocalRef.current = local;
    gestureRef.current = step.gesture;
    // A stroke through the zenith is cancelled, silently: the mask of the
    // gesture's start once, then nothing until the pointer is lifted.
    if (step.cancelled) {
      if (gestureStartRef.current) change(gestureStartRef.current, held);
      return;
    }
    if (!step.updates.length) return;
    draggingIndexRef.current = step.held;
    if (step.held !== held) setActiveHandleIndex(step.held);
    change(withHorizonPointAltitudes(draft, step.updates), step.held);
  };
  const focusHandle = (index) =>
    plotRef.current
      ?.querySelector(`[data-horizon-index="${index}"]`)
      ?.focus?.();
  const profilePath = [...draft.points, { ...draft.points[0], azimuth: 360 }]
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.azimuth} ${(90 - point.altitude).toFixed(2)}`,
    )
    .join(" ");
  const maskedArea = `${profilePath} L360 90 L0 90 Z`;
  const circularPoint = (azimuth, altitude) =>
    horizonEditorPosition({ azimuth, altitude }, "circular", rotation);
  const circularCardinalPoint = (azimuth) => {
    const angle = ((azimuth + rotation - 90) * Math.PI) / 180;
    return {
      x: 100 + Math.cos(angle) * 95,
      y: 100 + Math.sin(angle) * 95,
    };
  };
  const circularProfilePoints = [
    ...draft.points,
    { ...draft.points[0], azimuth: 360 },
  ].map((point) => circularPoint(point.azimuth, point.altitude));
  // The altitude-0 ring, one corner per mask direction and back to north.
  const circularOuterPoints = Array.from(
    { length: horizonMaskPointCount + 1 },
    (_, index) => circularPoint(index * horizonMaskStep, 0),
  );
  const circularProfilePath = circularProfilePoints
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const circularMaskedArea = `${circularProfilePath} L${circularOuterPoints
    .at(-1)
    .x.toFixed(
      2,
    )} ${circularOuterPoints.at(-1).y.toFixed(2)} ${circularOuterPoints
    .slice(0, -1)
    .reverse()
    .map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ")} Z`;
  const activeHandleReadout = (() => {
    if (activeHandleIndex === null) return null;
    const point = draft.points[activeHandleIndex];
    if (!point) return null;
    const position =
      projection === "circular"
        ? circularPoint(point.azimuth, point.altitude)
        : { x: point.azimuth, y: 90 - point.altitude };
    if (projection === "circular") {
      const distance = Math.hypot(position.x - 100, position.y - 100) || 1;
      return {
        altitude: point.altitude,
        azimuth: point.azimuth,
        cardinal: horizonCardinalDirection(point.azimuth, locale),
        x: clamp(position.x + ((position.x - 100) / distance) * 16, 10, 190),
        y: clamp(position.y + ((position.y - 100) / distance) * 16, 10, 190),
      };
    }
    return {
      altitude: point.altitude,
      azimuth: point.azimuth,
      cardinal: horizonCardinalDirection(point.azimuth, locale),
      x: clamp(position.x, 6, 354),
      y: clamp(position.y - 8, 7, 83),
    };
  })();

  return (
    <div className={`planner-place-horizon${compact ? " is-compact" : ""}`}>
      {!compact && projection === "circular" && (
        <div className="planner-horizon-controls">
          <label className="planner-horizon-time-slider">
            <span>{message(locale, "plannerHorizonOrientation")}</span>
            <input
              type="range"
              min="-180"
              max="180"
              step="5"
              value={rotation}
              onChange={(e) => setRotation(+e.target.value)}
            />
            <output>{rotation}°</output>
          </label>
        </div>
      )}
      {/* The projection choice and the direction / height box are folded,
          under the orientation slider and above the map. The tile is the
          place form's « Coordonnées » (a `details`, same style); it starts
          folded at every page load and a touch on a handle does not open it. */}
      {!compact && (
        <details
          className="planner-place-coordinates planner-horizon-fine-settings"
          open={fineSettingsOpen}
          onToggle={(event) => {
            fineSettingsOpen = event.currentTarget.open;
          }}
        >
          <summary>{message(locale, "plannerHorizonFineSettings")}</summary>
          <div className="planner-horizon-controls">
            <div
              className="planner-horizon-projection-switch"
              role="group"
              aria-label={message(locale, "plannerHorizonProjection")}
            >
              {["linear", "circular"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={projection === value ? "is-active" : ""}
                  aria-pressed={projection === value}
                  onClick={() => setProjection(value)}
                >
                  {message(
                    locale,
                    value === "linear"
                      ? "plannerHorizonProjectionLinear"
                      : "plannerHorizonProjectionCircular",
                  )}
                </button>
              ))}
            </div>
          </div>
          {!readOnly && (
            <div className="planner-place-coordinate-inputs planner-horizon-point-inputs">
              <label>
                <span>{flow(locale, "direction")}</span>
                <select
                  value={direction}
                  onChange={(e) => setDirection(+e.target.value)}
                >
                  {draft.points.map((point, i) => (
                    <option key={point.azimuth} value={i}>
                      {point.azimuth}° ·{" "}
                      {horizonCardinalDirection(point.azimuth, locale)}
                    </option>
                  ))}
                </select>
                {showSurveyedSectors && (
                  <small className="planner-horizon-surveyed-on">
                    {horizonEditorSurveyedLabel(
                      draft.points[direction],
                      locale,
                      timeZone,
                    )}
                  </small>
                )}
              </label>
              <div className="planner-horizon-point-height">
                <label htmlFor="planner-horizon-point-altitude">
                  {flow(locale, "obstacle")}
                </label>
                <div className="planner-horizon-stepper">
                  <button
                    type="button"
                    className="planner-horizon-step"
                    aria-label={flow(locale, "horizonLower")}
                    disabled={(draft.points[direction]?.altitude ?? 0) <= 0}
                    onClick={() => stepPoint(direction, -1)}
                  >
                    −
                  </button>
                  <input
                    id="planner-horizon-point-altitude"
                    type="number"
                    min="0"
                    max="90"
                    value={draft.points[direction]?.altitude ?? 0}
                    onChange={(e) => {
                      if (e.target.value !== "")
                        setPointAltitude(direction, +e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className="planner-horizon-step"
                    aria-label={flow(locale, "horizonRaise")}
                    disabled={(draft.points[direction]?.altitude ?? 0) >= 90}
                    onClick={() => stepPoint(direction, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}
        </details>
      )}
      <div className={`planner-horizon-plot-shell is-${projection}`}>
        {projection === "linear" && (
          <div className="planner-horizon-altitude-axis" aria-hidden="true">
            <strong>{message(locale, "plannerHorizonAltitudeAxis")}</strong>
            <div>
              {[90, 75, 60, 45, 30, 15, 0].map((altitude) => (
                <span key={altitude}>{altitude}°</span>
              ))}
            </div>
          </div>
        )}
        <div className="planner-horizon-plot-wrap">
          <svg
            ref={plotRef}
            className={`planner-horizon-plot${readOnly || compact ? "" : " is-editable"}`}
            viewBox={projection === "circular" ? "0 0 200 200" : "0 0 360 90"}
            preserveAspectRatio={
              projection === "circular" ? "xMidYMid meet" : "none"
            }
            aria-label={message(locale, "plannerHorizonMaskPlot")}
            onPointerDown={(event) => {
              if (readOnly || compact) return;
              const local = localPoint(event);
              if (!local || !horizonEditorInReach(local, projection)) return;
              event.preventDefault();
              // A handle within reach is taken as it is (a tap selects it, a
              // drag then moves it); anywhere else, the direction under the
              // pointer is taken and its point put where the pointer is.
              const grabbed = grabbedHorizonHandle(draft.points, local, {
                projection,
                rotation,
                ...plotScale(),
              });
              const index =
                grabbed ??
                horizonEditorDirectionAt(local, projection, rotation);
              draggingIndexRef.current = index;
              lastLocalRef.current = local;
              gestureRef.current = horizonEditorGestureStart(
                local,
                projection,
                rotation,
              );
              gestureStartRef.current = mask;
              setActiveHandleIndex(index);
              setDirection(index);
              event.currentTarget.setPointerCapture?.(event.pointerId);
              if (grabbed === null) movePoint(event, index);
            }}
            onPointerMove={(event) => {
              const index = draggingIndexRef.current;
              if (index === null) return;
              event.preventDefault();
              dragPoint(event, index);
            }}
            onPointerUp={() => {
              draggingIndexRef.current = null;
              lastLocalRef.current = null;
              gestureRef.current = null;
              gestureStartRef.current = null;
              setActiveHandleIndex(null);
            }}
            onPointerCancel={() => {
              draggingIndexRef.current = null;
              lastLocalRef.current = null;
              gestureRef.current = null;
              gestureStartRef.current = null;
              setActiveHandleIndex(null);
            }}
          >
            {projection === "linear" ? (
              <>
                {[0, 15, 30, 45, 60, 75, 90].map((altitude) => (
                  <line
                    className="planner-horizon-gridline"
                    key={altitude}
                    x1="0"
                    x2="360"
                    y1={90 - altitude}
                    y2={90 - altitude}
                  />
                ))}
                {[0, 90, 180, 270, 360].map((azimuth) => (
                  <line
                    className="planner-horizon-gridline is-vertical"
                    key={azimuth}
                    x1={azimuth}
                    x2={azimuth}
                    y1="0"
                    y2="90"
                  />
                ))}
              </>
            ) : (
              <>
                {[0, 15, 30, 45, 60, 75, 90].map((altitude) => (
                  <circle
                    className="planner-horizon-gridline"
                    key={altitude}
                    cx="100"
                    cy="100"
                    r={((90 - altitude) / 90) * 86}
                  />
                ))}
                {[0, 15, 30, 45, 60, 75, 90].map((altitude) => {
                  const radius = ((90 - altitude) / 90) * 86;
                  const angle = (225 * Math.PI) / 180;
                  return (
                    <text
                      className="planner-horizon-radial-label"
                      key={`altitude-${altitude}`}
                      x={100 + Math.cos(angle) * radius}
                      y={100 + Math.sin(angle) * radius}
                    >
                      {altitude}°
                    </text>
                  );
                })}
                {[0, 90, 180, 270].map((azimuth) => {
                  const outer = circularPoint(azimuth, 0);
                  return (
                    <line
                      className="planner-horizon-gridline is-vertical"
                      key={azimuth}
                      x1="100"
                      x2={outer.x}
                      y1="100"
                      y2={outer.y}
                    />
                  );
                })}
                {[
                  { azimuth: 0, label: "N" },
                  { azimuth: 90, label: "E" },
                  { azimuth: 180, label: "S" },
                  { azimuth: 270, label: "O" },
                ].map(({ azimuth, label }) => {
                  const position = circularCardinalPoint(azimuth);
                  return (
                    <text
                      className="planner-horizon-circular-cardinal"
                      key={label}
                      x={position.x}
                      y={position.y}
                    >
                      {horizonCardinalDirection(azimuth, locale)}
                    </text>
                  );
                })}
                {showSurveyedSectors && (
                  <g className="planner-horizon-crown" aria-hidden="true">
                    {horizonEditorCrownSegments(draft.points, rotation).map(
                      (segment) =>
                        segment.paths.map((d, dash) => (
                          <path
                            key={`${segment.index}-${dash}`}
                            className={
                              segment.surveyed ? "is-surveyed" : "is-to-survey"
                            }
                            d={d}
                          />
                        )),
                    )}
                  </g>
                )}
              </>
            )}
            <path
              className="planner-horizon-masked-area"
              d={projection === "circular" ? circularMaskedArea : maskedArea}
            />
            <path
              className="planner-horizon-profile"
              d={projection === "circular" ? circularProfilePath : profilePath}
            />
            {!readOnly &&
              !compact &&
              draft.points.map((point, index) => {
                const position = horizonEditorPosition(
                  point,
                  projection,
                  rotation,
                );
                const selected = index === direction;
                return (
                  <g
                    className={`planner-horizon-handle${selected ? " is-selected" : ""}`}
                    key={point.azimuth}
                    data-horizon-index={index}
                    role="slider"
                    tabIndex={selected ? 0 : -1}
                    aria-label={`${point.azimuth}° · ${horizonCardinalDirection(point.azimuth, locale)}`}
                    aria-valuemin="0"
                    aria-valuemax="90"
                    aria-valuenow={point.altitude}
                    onFocus={() => {
                      setActiveHandleIndex(index);
                      setDirection(index);
                    }}
                    onBlur={() => setActiveHandleIndex(null)}
                    onKeyDown={(event) => {
                      const neighbour =
                        event.key === "ArrowRight"
                          ? 1
                          : event.key === "ArrowLeft"
                            ? -1
                            : 0;
                      if (neighbour) {
                        event.preventDefault();
                        const next =
                          (index + neighbour + draft.points.length) %
                          draft.points.length;
                        setDirection(next);
                        focusHandle(next);
                      }
                      if (
                        event.key === "ArrowUp" ||
                        event.key === "ArrowDown"
                      ) {
                        event.preventDefault();
                        stepPoint(index, event.key === "ArrowUp" ? 1 : -1);
                      }
                    }}
                  >
                    {projection === "circular" ? (
                      <circle
                        cx={position.x}
                        cy={position.y}
                        r={selected ? "3.6" : "2.6"}
                      />
                    ) : (
                      // The linear plot is stretched to its box: a round
                      // handle is an ellipse in its own units.
                      <ellipse
                        cx={position.x}
                        cy={position.y}
                        rx={(selected ? 5 : 3.6) / linearScale.x}
                        ry={(selected ? 5 : 3.6) / linearScale.y}
                      />
                    )}
                  </g>
                );
              })}
          </svg>
          {activeHandleReadout && (
            <output
              className="planner-horizon-handle-readout"
              style={{
                // Kept inside the plot: the pill is wider than the
                // point it names (about 4.2rem either side of it).
                left: `clamp(4.2rem, ${(activeHandleReadout.x / (projection === "circular" ? 200 : 360)) * 100}%, calc(100% - 4.2rem))`,
                top: `${(activeHandleReadout.y / (projection === "circular" ? 200 : 90)) * 100}%`,
              }}
            >
              {activeHandleReadout.altitude}° · {activeHandleReadout.azimuth}°{" "}
              {activeHandleReadout.cardinal}
            </output>
          )}
        </div>
        {projection === "linear" && showSurveyedSectors && (
          // The crown of the linear plot: one cell per 10° sector, centred
          // under its azimuth, north half a cell at both ends.
          <svg
            className="planner-horizon-sectors-band"
            viewBox="0 0 360 10"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {draft.points.flatMap((point, index) => {
              const surveyed = typeof point.surveyedAt === "string";
              const centre = Number(point.azimuth) || 0;
              const spans =
                centre === 0
                  ? [
                      [0, 5],
                      [355, 360],
                    ]
                  : [[centre - 5, centre + 5]];
              return spans.map(([from, to], part) => (
                <rect
                  key={`${index}-${part}`}
                  className={surveyed ? "is-surveyed" : "is-to-survey"}
                  x={from + (from === 0 ? 0 : 0.6)}
                  y="1.5"
                  width={to - from - (from === 0 || to === 360 ? 0.6 : 1.2)}
                  height="7"
                />
              ));
            })}
          </svg>
        )}
        {projection === "linear" && (
          <div className="planner-horizon-azimuth-axis" aria-hidden="true">
            <strong>{message(locale, "plannerHorizonAzimuthAxis")}</strong>
            <div>
              <span>N</span>
              <span>E</span>
              <span>S</span>
              <span>O</span>
              <span>N</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
