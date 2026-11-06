"use client";

// A target's whole night of altitude, drawn in filigree behind what shows the
// target (`planner-availability`): the planner's target cards, and the rows of
// "À voir ce soir" on "Cette nuit".

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function altitudePath(series, predicate = () => true) {
  if (!series.length) return "";
  let previousMatches = false;
  return series
    .map((point, index) => {
      const matches = predicate(point);
      if (!matches) {
        previousMatches = false;
        return "";
      }
      const x = (index / Math.max(1, series.length - 1)) * 100;
      const y = 100 - Math.max(0, Math.min(90, point.altitude)) / 0.9;
      const command = previousMatches ? "L" : "M";
      previousMatches = true;
      return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
}

export function AvailabilityGraph({
  card,
  highlightHorizon = false,
  highlightLowAltitude = false,
}) {
  const minAltitude = clamp(Number(card.minAltitude) || 30, 0, 90);
  const path = altitudePath(card.series);
  const maskedPath = altitudePath(card.series, (point) => point.horizonBlocked);
  const lowPath = altitudePath(
    card.series,
    (point) => point.altitude < minAltitude,
  );
  const minimumY = 100 - minAltitude / 0.9;
  return (
    <svg
      className={`planner-availability${highlightHorizon ? " is-horizon-selected" : ""}${highlightLowAltitude ? " is-low-altitude-selected" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`planner-altitude-${card.target.id}`}
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0" stopColor="#e0a85e" stopOpacity="0.36" />
          <stop offset="1" stopColor="#e0a85e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        className="planner-altitude-minimum"
        x1="0"
        y1={minimumY}
        x2="100"
        y2={minimumY}
      />
      <path
        className="planner-altitude-area"
        d={`${path} L100 100 L0 100 Z`}
        fill={`url(#planner-altitude-${card.target.id})`}
      />
      <path className="planner-altitude-path" d={path} />
      {maskedPath && (
        <path className="planner-altitude-masked" d={maskedPath} />
      )}
      {lowPath && <path className="planner-altitude-low" d={lowPath} />}
    </svg>
  );
}
