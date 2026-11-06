"use client";

import { message } from "portal/i18n.js";
import { clock as placeClock } from "../wind-section.js";
import { TargetPathGlyph } from "./TargetPathGlyph.js";

// The horizon map's path mode on the web: the mode switch "Positions | Trajet", the chips
// "Cible du trajet", the path of the chosen target over the map
// (`horizonPathLayer`, `horizon-path-mode.js`), its legend and the card
// "Trajet de <cible>". `HorizonProjectionCanvas` (`PlannerPage.js`) draws
// the strokes inside its SVG and the markers in an HTML layer over it: the
// linear plot's SVG is stretched (`preserveAspectRatio="none"`), and a
// label drawn in it would be stretched too.

/** A message whose `{placeholders}` are filled with bold values. */
function withValues(template, values) {
  return template
    .split(/(\{[a-z]+\})/)
    .filter(Boolean)
    .map((part, index) => {
      const key = /^\{([a-z]+)\}$/.exec(part)?.[1];
      return key && key in values ? <b key={index}>{values[key]}</b> : part;
    });
}

/** The strokes of the path, inside the map's SVG. */
export function HorizonPathStrokes({ layer }) {
  if (!layer) return null;
  return (
    <g className="planner-horizon-path" aria-hidden="true">
      {layer.strokes.map((stroke, index) => (
        <path
          key={`stroke-${index}`}
          className={`planner-horizon-path-stroke is-${stroke.kind}`}
          d={stroke.d}
        />
      ))}
      {layer.window.map((line, index) => (
        <path
          key={`window-${index}`}
          className="planner-horizon-path-stroke is-window"
          d={line.d}
        />
      ))}
    </g>
  );
}

function place(point, layer) {
  const circular = layer.projection === "circular";
  return {
    left: `${(point.x / (circular ? 200 : 360)) * 100}%`,
    top: `${(point.y / (circular ? 200 : 90)) * 100}%`,
  };
}

/**
 * The markers and labels of the path, in an HTML layer over the SVG, and the
 * names of the plan's other targets (`others`: `{ id, x, y, label }` in the
 * plot's user space) when the labels are on.
 */
export function HorizonPathMarkers({ layer, locale, others = [], timeZone }) {
  if (!layer) return null;
  const clock = (value) => placeClock(value, locale, timeZone);
  return (
    <div className="planner-horizon-path-markers" aria-hidden="true">
      {others.map((other) => (
        <span
          key={other.id}
          className="planner-horizon-path-marker is-other"
          style={place(other, layer)}
        >
          <em className="is-start">{other.label}</em>
        </span>
      ))}
      {layer.start && (
        <span
          className="planner-horizon-path-marker is-start"
          style={place(layer.start, layer)}
        />
      )}
      {layer.ticks.map((tick) => (
        <span
          key={tick.time}
          className="planner-horizon-path-marker is-tick"
          data-time={tick.time}
          style={place(tick, layer)}
        >
          {tick.labelled && (
            // Beside the dot, on the normal of the path: the offset is
            // computed in pixels by `horizonPathLayer`.
            <em
              className="is-hour"
              style={{
                "--label-dx": `${tick.label?.x ?? 0}px`,
                "--label-dy": `${tick.label?.y ?? 0}px`,
              }}
            >
              {clock(tick.time)}
            </em>
          )}
        </span>
      ))}
      {layer.end && (
        <span
          className="planner-horizon-path-marker is-end"
          style={place(layer.end, layer)}
        />
      )}
      {layer.crossings.map((crossing) => (
        <span
          key={`${crossing.kind}-${crossing.time}`}
          className={`planner-horizon-path-marker is-crossing is-${crossing.kind}`}
          style={place(crossing, layer)}
        >
          <em>{clock(crossing.time)}</em>
        </span>
      ))}
      {layer.current && (
        <span
          className="planner-horizon-path-marker is-current"
          style={place(layer.current, layer)}
        >
          <em>{clock(layer.current.time)}</em>
        </span>
      )}
    </div>
  );
}

export function horizonPathCardLabel(card) {
  const target = card?.target || {};
  return target.designation || target.objects?.[0] || target.title || "";
}

/** The chips "Cible du trajet": the plan's targets, one selected. */
export function HorizonPathTargetChips({
  cards,
  locale,
  selectedId,
  onSelect,
}) {
  return (
    <div className="planner-horizon-path-targets">
      <p id="planner-horizon-path-target">
        {message(locale, "horizonPathTarget")}
      </p>
      <div role="group" aria-labelledby="planner-horizon-path-target">
        {cards.map((card) => (
          <button
            key={card.target.id}
            type="button"
            className={card.target.id === selectedId ? "is-active" : ""}
            aria-pressed={card.target.id === selectedId}
            onClick={() => onSelect(card.target.id)}
          >
            {horizonPathCardLabel(card)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The legend under the path, one item per line: the best window with its
 * hours, the path "un point par heure", behind the mask, the minimum height
 * with its value, the mask. Each swatch is drawn in the line style it names
 * (`.is-window` thick and solid, `.is-visible` fine with a dot, `.is-masked`
 * dashed, `.is-minimum` dotted, `.is-mask` hatched).
 */
export function HorizonPathLegend({
  locale,
  path,
  timeZone,
  minAltitude = null,
}) {
  const clock = (value) => placeClock(value, locale, timeZone);
  const minimum = Number.isFinite(Number(minAltitude))
    ? `${Math.round(Number(minAltitude))}°`
    : null;
  return (
    <ul className="planner-horizon-path-legend">
      {path?.bestWindow && (
        <li data-legend="window">
          <i className="is-window" aria-hidden="true" />
          <span>
            {message(locale, "horizonPathLegendWindow")}{" "}
            <span className="is-muted">
              {clock(path.bestWindow.start)} – {clock(path.bestWindow.end)}
            </span>
          </span>
        </li>
      )}
      <li data-legend="path">
        <i className="is-visible" aria-hidden="true" />
        <span>
          {message(locale, "horizonPathLegendPath")}{" "}
          <span className="is-muted">
            {message(locale, "horizonPathLegendPathNote")}
          </span>
        </span>
      </li>
      {path?.maskEnabled && (
        <li data-legend="masked">
          <i className="is-masked" aria-hidden="true" />
          <span>{message(locale, "horizonPathLegendMasked")}</span>
        </li>
      )}
      <li data-legend="minimum">
        <i className="is-minimum" aria-hidden="true" />
        <span>
          {message(locale, "horizonPathLegendMinimum")}{" "}
          {minimum && <span className="is-muted">{minimum}</span>}
        </span>
      </li>
      {path?.maskEnabled && (
        <li data-legend="mask">
          <i className="is-mask" aria-hidden="true" />
          <span>{message(locale, "horizonPathLegendMask")}</span>
        </li>
      )}
    </ul>
  );
}

function RowIcon({ kind }) {
  if (kind === "culmination") return <TargetPathGlyph className="is-success" />;
  if (kind === "masked")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="is-mask">
        <path d="M4 20 H20" />
        <path d="M12 4 V15" />
        <path d="M8 11 L12 15 L16 11" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="is-minimum">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11 V16.5" />
      <path d="M12 7.6 V7.8" />
    </svg>
  );
}

/** The card "Trajet de <cible>" (`horizonPathSummary`). */
export function HorizonPathCard({
  card,
  locale,
  summary,
  timeZone,
  nightEnd = null,
}) {
  const clock = (value) => placeClock(value, locale, timeZone);
  const name = horizonPathCardLabel(card);
  // The target's common name ("Galaxie d’Andromède"), never the catalogue
  // title that repeats the designation.
  const title = card?.target?.name;
  return (
    <section
      className="planner-horizon-path-card"
      aria-label={message(locale, "horizonPathCard").replace("{target}", name)}
    >
      <p className="planner-horizon-path-card-title">
        {name}
        {title && title !== name && <span> · {title}</span>}
      </p>
      {summary.state === "never-up" ? (
        <p className="planner-horizon-path-card-empty">
          {message(locale, "horizonPathNeverUp").replace("{target}", name)}
        </p>
      ) : (
        <ul>
          {summary.culmination && (
            <li data-row="culmination">
              <RowIcon kind="culmination" />
              <span>
                {withValues(message(locale, "horizonPathCulminates"), {
                  time: clock(summary.culmination.time),
                  altitude: `${summary.culmination.altitude}°`,
                })}
              </span>
            </li>
          )}
          {summary.masked.map((stretch) => (
            <li key={stretch.start} data-row="masked">
              <RowIcon kind="masked" />
              <span>
                {
                  // A masked stretch that runs to the end of the night says
                  // "dès", not "de … à …".
                  stretch.end === nightEnd
                    ? withValues(message(locale, "horizonPathMaskedFrom"), {
                        time: clock(stretch.start),
                      })
                    : withValues(message(locale, "horizonPathMaskedBetween"), {
                        start: clock(stretch.start),
                        end: clock(stretch.end),
                      })
                }
              </span>
            </li>
          ))}
          {summary.belowMinimumFrom && (
            <li data-row="below-minimum">
              <RowIcon kind="below-minimum" />
              <span>
                {withValues(message(locale, "horizonPathBelowMinimumFrom"), {
                  time: clock(summary.belowMinimumFrom),
                })}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * The names of the "Positions" map, in an HTML layer over the plot at the
 * map's rendered size so they are 11 px at least whatever the plot's scale:
 * the stretched linear plot would stretch an SVG `<text>`. `placements` are
 * laid out in pixels by the page (`layOutMapLabels`); each name is ringed by
 * a halo of the background. The dots stay, each with its name in its
 * `<title>`.
 */
export function HorizonPositionLabels({ placements }) {
  if (!placements.length) return null;
  return (
    <div className="planner-horizon-position-labels" aria-hidden="true">
      {placements.map((placement) => (
        <span
          key={placement.key}
          className={`planner-horizon-position-label${
            placement.priority === "selected" ? " is-selected" : ""
          }${placement.priority === "emphasized" ? " is-in-plan" : ""}`}
          style={{ left: placement.rect.x, top: placement.rect.y }}
        >
          {placement.text}
        </span>
      ))}
    </div>
  );
}
