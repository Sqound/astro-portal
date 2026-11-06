"use client";

import { useMemo } from "react";
import { message } from "portal/i18n.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import { horizonCardinalLabel } from "../horizon-projection.js";
import { clock } from "../wind-section.js";
import { TargetPathGlyph } from "./TargetPathGlyph.js";
import {
  targetPathDrawing,
  targetPathSummaryRows,
  targetPathSummaryState,
  targetPathTickLabels,
  tickHalfLength,
  tickLabelSize,
} from "../target-path-summary.js";

// "Déplacement de la cible": the night of one target over the place's horizon
// mask, seen from above — the path visible solid, hidden by the mask dashed,
// the best window in green, the culmination, the times it clears the mask and
// goes back behind it — then the same facts as a list. It is the card under the
// curve of "Statistiques de la cible" (`TargetFactsBlocks.js`), drawn once by
// `TargetPathContent`; the dialog is the enlarged view the glyph of that card
// opens.

/** The icon of the button that opens the summary: the "astre sur l'horizon" glyph. */
export function TargetPathIcon() {
  return <TargetPathGlyph />;
}

function RowIcon({ kind }) {
  switch (kind) {
    case "clears":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="is-accent">
          <path d="M4 20 H20" />
          <path d="M12 16 V5" />
          <path d="M8 9 L12 5 L16 9" />
        </svg>
      );
    case "culmination":
      return <TargetPathGlyph className="is-success" />;
    case "back":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20 H20" />
          <path d="M12 4 V15" />
          <path d="M8 11 L12 15 L16 11" />
        </svg>
      );
    case "moon":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19.5 14.5 A8 8 0 1 1 9.5 4.5 A6.3 6.3 0 0 0 19.5 14.5 Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20 H20" />
          <path d="M6 16 H18" />
        </svg>
      );
  }
}

function noWindowReasonText(reason, locale, minAltitude) {
  switch (reason) {
    case "below-horizon":
      return message(locale, "targetPathNoWindowBelowHorizon");
    case "masked":
      return message(locale, "targetPathNoWindowMasked");
    case "below-minimum":
      return message(locale, "targetPathNoWindowBelowMinimum").replace(
        "{altitude}",
        String(Math.round(Number(minAltitude) || 0)),
      );
    case "moon":
      return message(locale, "targetPathNoWindowMoon");
    case "zenith":
    case "cables":
      return message(locale, "targetPathNoWindowMount");
    default:
      return "";
  }
}

function TargetPathPlot({ drawing, label, locale, time }) {
  const { centre, radius } = drawing;
  // The hour marks between two key hours, each with its label when it fits.
  const ticks = useMemo(
    () =>
      targetPathTickLabels(drawing, {
        time,
        end: (instant) =>
          message(locale, "targetPathEnd").replace("{time}", time(instant)),
        zenith: message(locale, "targetPathZenith"),
      }),
    [drawing, locale, time],
  );
  const ringLabelX = centre - 2.5;
  return (
    <svg
      className="planner-target-path-plot"
      viewBox="-14 -14 228 228"
      role="img"
      aria-label={label}
    >
      <circle className="is-sky" cx={centre} cy={centre} r={radius} />
      {drawing.mask && (
        <>
          <path className="is-mask" d={drawing.mask.area} />
          <path className="is-mask-line" d={drawing.mask.outline} />
        </>
      )}
      {drawing.rings.map((ring) => (
        <circle
          key={ring.altitude}
          className="is-grid"
          cx={centre}
          cy={centre}
          r={ring.radius}
        />
      ))}
      <circle className="is-grid" cx={centre} cy={centre} r={radius} />
      <path
        className="is-grid"
        d={`M${centre} ${centre - radius - 6} V${centre + radius + 6} M${centre - radius - 6} ${centre} H${centre + radius + 6}`}
      />
      {drawing.rings.map((ring) => (
        <text
          key={ring.altitude}
          className="is-ring-label"
          x={ringLabelX}
          y={centre - ring.radius + 3.5}
          textAnchor="end"
        >
          {ring.altitude}°
        </text>
      ))}
      <path
        className="is-zenith"
        d={`M${centre - 3.5} ${centre} H${centre + 3.5} M${centre} ${centre - 3.5} V${centre + 3.5}`}
      />
      <text
        className="is-ring-label"
        x={centre + 4}
        y={centre - 4}
        textAnchor="start"
      >
        {message(locale, "targetPathZenith")}
      </text>
      {drawing.strokes.map((stroke, index) => (
        <path
          key={`${stroke.kind}-${index}`}
          className={`is-path is-${stroke.kind}`}
          d={stroke.d}
        />
      ))}
      {drawing.moon &&
        drawing.moon.runs.map((d, index) => (
          <path key={`moon-${index}`} className="is-moon" d={d} />
        ))}
      {drawing.window && <path className="is-window" d={drawing.window} />}
      {drawing.arrow && <path className="is-arrow" d={drawing.arrow.d} />}
      {drawing.start && (
        <circle
          className="is-start"
          cx={drawing.start.x}
          cy={drawing.start.y}
          r="2"
        />
      )}
      {ticks.map((tick) => (
        <g key={`tick-${tick.time}`} data-testid="path-tick">
          <path
            className="is-tick"
            d={`M${tick.x + tick.dy * tickHalfLength} ${tick.y - tick.dx * tickHalfLength} L${tick.x - tick.dy * tickHalfLength} ${tick.y + tick.dx * tickHalfLength}`}
          />
          {tick.label && (
            <text
              className="is-tick-label"
              x={tick.label.x}
              y={tick.label.y}
              textAnchor="middle"
              fontSize={tickLabelSize}
            >
              {tick.label.text}
            </text>
          )}
        </g>
      ))}
      {drawing.moon && (
        <g className="is-moon-symbol" data-testid="path-moon">
          <circle
            cx={drawing.moon.marker.x}
            cy={drawing.moon.marker.y}
            r="3.4"
          />
          <circle
            className="is-moon-shade"
            cx={drawing.moon.marker.x + 1.5}
            cy={drawing.moon.marker.y - 0.8}
            r="2.9"
          />
        </g>
      )}
      {drawing.crossings.map((crossing) => (
        <g key={`${crossing.kind}-${crossing.time}`}>
          <circle
            className="is-crossing"
            cx={crossing.x}
            cy={crossing.y}
            r="2.7"
          />
          <text
            className="is-crossing-label"
            x={crossing.x + (crossing.anchor === "start" ? 5 : -5)}
            y={crossing.y - 4}
            textAnchor={crossing.anchor}
          >
            {time(crossing.time)}
          </text>
        </g>
      ))}
      {drawing.horizon && (
        <g data-testid="path-horizon">
          <circle
            className="is-crossing"
            cx={drawing.horizon.x}
            cy={drawing.horizon.y}
            r="2.7"
          />
          <text
            className="is-crossing-label"
            x={
              drawing.horizon.x + (drawing.horizon.anchor === "start" ? 5 : -5)
            }
            y={drawing.horizon.y - 4}
            textAnchor={drawing.horizon.anchor}
          >
            {time(drawing.horizon.time)}
          </text>
        </g>
      )}
      {drawing.culmination && (
        <g>
          <circle
            className="is-culmination-halo"
            cx={drawing.culmination.x}
            cy={drawing.culmination.y}
            r="6"
          />
          <circle
            className="is-culmination"
            cx={drawing.culmination.x}
            cy={drawing.culmination.y}
            r="3.6"
          />
          <text
            className="is-culmination-label"
            x={drawing.culmination.x}
            y={drawing.culmination.y + 13}
            textAnchor="middle"
          >
            {time(drawing.culmination.time)} · {drawing.culmination.altitude}°
          </text>
        </g>
      )}
      {drawing.end && (
        <g>
          <circle
            className="is-end"
            cx={drawing.end.x}
            cy={drawing.end.y}
            r="3.6"
          />
          <text
            className="is-end-label"
            x={drawing.end.x}
            y={drawing.end.y - 7}
            textAnchor="middle"
          >
            {message(locale, "targetPathEnd").replace(
              "{time}",
              time(drawing.end.time),
            )}
          </text>
        </g>
      )}
      {drawing.cardinals.map((cardinal) => (
        <text
          key={cardinal.label}
          className="is-cardinal"
          x={cardinal.x}
          y={cardinal.y + 3.5}
          textAnchor="middle"
        >
          {horizonCardinalLabel(cardinal.label, locale)}
        </text>
      ))}
    </svg>
  );
}

/** "120°–168°": the smallest and the largest separation, one figure when they agree. */
export function moonRange({ min, max }) {
  return min === max ? `${min}°` : `${min}°–${max}°`;
}

/**
 * The polar map, its legend and the lines the night gives, for `path` (the
 * result of `targetNightPath`) over `mask`. `culminationRow` is false where
 * the culmination is already written, once, above (the card of "Statistiques
 * de la cible").
 */
export function TargetPathContent({
  path,
  mask,
  moon = null,
  minAltitude,
  designation,
  locale,
  timeZone,
  culminationRow = true,
}) {
  const drawing = useMemo(
    () => targetPathDrawing(path, { mask, moon }),
    [path, mask, moon],
  );
  const state = targetPathSummaryState(path);
  const rows = targetPathSummaryRows(path, { moon }).filter(
    (row) => culminationRow || row.kind !== "culmination",
  );
  const time = (value) => clock(value, locale, timeZone);
  const times = (values) => values.map(time).join(", ");
  return (
    <>
      <TargetPathPlot
        drawing={drawing}
        label={message(locale, "targetPathDrawingLabel").replace(
          "{target}",
          designation,
        )}
        locale={locale}
        time={time}
      />
      <ul className="planner-target-path-legend">
        {state === "normal" ? (
          <li className="is-wide">
            <i className="is-window" aria-hidden="true" />
            <span>
              {message(locale, "targetPathBestWindow")}{" "}
              <span className="is-muted">
                · {time(path.bestWindow.start)} – {time(path.bestWindow.end)}
              </span>
            </span>
          </li>
        ) : (
          <li className="is-wide is-no-window">
            <span>
              <strong>{message(locale, "targetPathNoWindow")}</strong>{" "}
              <span className="is-muted">
                {noWindowReasonText(path.noWindowReason, locale, minAltitude)}
              </span>
            </span>
          </li>
        )}
        <li>
          <i className="is-visible" aria-hidden="true" />
          <span>{message(locale, "targetPathVisible")}</span>
        </li>
        {drawing.moon && (
          <li>
            <i className="is-moon" aria-hidden="true" />
            <span>{message(locale, "targetScoreMoon")}</span>
          </li>
        )}
        {path.maskEnabled && (
          <>
            <li>
              <i className="is-masked" aria-hidden="true" />
              <span>{message(locale, "targetPathMasked")}</span>
            </li>
            <li>
              <i className="is-mask" aria-hidden="true" />
              <span>{message(locale, "targetPathMask")}</span>
            </li>
          </>
        )}
      </ul>
      {rows.length > 0 && (
        <ul
          className="planner-target-path-rows"
          aria-label={message(locale, "targetPathSummary")}
        >
          {rows.map((row) => (
            <li key={row.kind} data-row={row.kind}>
              <RowIcon kind={row.kind} />
              {row.kind === "clears" && (
                <span>
                  {message(locale, "targetPathClearsMask")}{" "}
                  <b>{times(row.times)}</b>
                </span>
              )}
              {row.kind === "culmination" && (
                <span>
                  {message(locale, "targetPathCulminates")}{" "}
                  <b>{time(row.time)}</b>
                  {message(locale, "targetPathValueSeparator")}
                  <b>{row.altitude}°</b>
                </span>
              )}
              {row.kind === "back" && (
                <span>
                  {message(locale, "targetPathBackBehindMask")}{" "}
                  <b>{times(row.times)}</b>
                </span>
              )}
              {row.kind === "moon" && (
                <span>
                  {message(locale, "targetPathMoonSeparation")}{" "}
                  <b>{moonRange(row)}</b>
                </span>
              )}
              {row.kind === "no-mask" && (
                <span className="is-muted">
                  {message(locale, "targetPathNoMask")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The enlarged view the glyph of the card opens: `title` the target's, `night`
 * the night and place it is drawn for, then the same content as the card.
 */
export function TargetPathSummary({
  path,
  mask,
  moon = null,
  minAltitude,
  title,
  designation,
  night,
  locale,
  timeZone,
  onClose,
}) {
  return (
    <WebDialog
      className="planner-target-path-dialog"
      bodyClassName="planner-target-path-body"
      closeLabel={message(locale, "targetPathClose")}
      // Reading starts at the title, not on the first control.
      focusTitle
      title={message(locale, "targetPathOpen")}
      onClose={onClose}
    >
      <p className="planner-target-path-target">{title}</p>
      {night && <p className="planner-target-path-night">{night}</p>}
      <TargetPathContent
        path={path}
        mask={mask}
        moon={moon}
        minAltitude={minAltitude}
        designation={designation || title}
        locale={locale}
        timeZone={timeZone}
      />
    </WebDialog>
  );
}
