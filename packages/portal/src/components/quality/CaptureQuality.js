"use client";

import { useState } from "react";
import { message } from "portal/i18n.js";
import { durationText, labelValueSeparator } from "portal/written-forms.js";

const chartDefinitions = [
  {
    key: "backgroundRelativePercent",
    label: "qualitySkyBackground",
    help: "qualitySkyBackgroundHelp",
    format: (value, locale) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} %`,
  },
  {
    key: "fwhmPixels",
    label: "qualityFwhm",
    help: "qualityFwhmHelp",
    format: (value, locale) =>
      `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} px`,
  },
  {
    key: "eccentricity",
    label: "qualityEccentricity",
    help: "qualityEccentricityHelp",
    format: (value, locale) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value),
  },
];

function finiteSeries(series, key) {
  return series
    .map((point) => ({ ...point, value: Number(point[key]) }))
    .filter((point) => Number.isFinite(point.value));
}

/**
 * A point of a gallery's charts carries no clock time: `fromMinute` and
 * `toMinute`, the minutes since the night's first measure (an event,
 * `minute`). The catalogue's points carry their UTC times.
 */
const relative = (points) =>
  points.length > 0 && Number.isFinite(Number(points[0]?.fromMinute));

function meridianPositions(points, events) {
  if (relative(points)) {
    const start = Math.min(...points.map((point) => Number(point.fromMinute)));
    const end = Math.max(...points.map((point) => Number(point.toMinute)));
    if (!(end > start)) return [];
    return (Array.isArray(events) ? events : [])
      .filter((event) => event?.type === "meridian-flip")
      .map((event) => Number(event.minute))
      .filter((at) => Number.isFinite(at) && at >= start && at <= end)
      .map((at) => ((at - start) / (end - start)) * 100);
  }
  const start = Math.min(
    ...points
      .map((point) => Date.parse(point.fromUtc || point.dateUtc))
      .filter(Number.isFinite),
  );
  const end = Math.max(
    ...points
      .map((point) => Date.parse(point.toUtc || point.dateUtc))
      .filter(Number.isFinite),
  );
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return [];
  return (Array.isArray(events) ? events : [])
    .filter((event) => event?.type === "meridian-flip")
    .map((event) => Date.parse(event.dateUtc))
    .filter((at) => Number.isFinite(at) && at >= start && at <= end)
    .map((at) => ((at - start) / (end - start)) * 100);
}

function MeridianLines({ positions, height, bottom }) {
  return positions.map((position, index) => (
    <line
      className="chart-meridian-line"
      key={`${position}-${index}`}
      x1={position}
      x2={position}
      y1="0"
      y2={bottom ?? height}
      vectorEffect="non-scaling-stroke"
    />
  ));
}

function MeridianLegend({ locale, className = "" }) {
  return (
    <span className={`meridian-legend ${className}`.trim()}>
      <i aria-hidden="true" />
      {message(locale, "plannerMeridianFlipLegend")}
    </span>
  );
}

function Sparkline({
  points,
  selectedIndex,
  onSelect,
  onClear,
  locale,
  meridianEvents = [],
}) {
  if (points.length < 2) return <div className="quality-sparkline is-empty" />;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = maximum - minimum || Math.max(Math.abs(maximum) * 0.05, 1);
  const plottedPoints = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 26 - ((point.value - minimum) / spread) * 22;
    return { point, x, y };
  });
  const plot = plottedPoints
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const meridianLines = meridianPositions(points, meridianEvents);
  const selectAt = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / Math.max(bounds.width, 1)),
    );
    onSelect(Math.round(ratio * (points.length - 1)));
  };
  const selectFromPointer = (event) => {
    if (
      event.pointerType !== "mouse" &&
      !event.currentTarget.hasPointerCapture?.(event.pointerId)
    )
      return;
    selectAt(event);
  };
  const beginPointerSelection = (event) => {
    // Capturing the pointer lets a touch continue to control the marker even
    // when a finger drifts beyond the narrow chart line.
    if (event.pointerType !== "mouse") {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
    selectAt(event);
  };
  const endPointerSelection = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const selectWithKeyboard = (event) => {
    const current = Number.isInteger(selectedIndex) ? selectedIndex : 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(
        Math.max(
          0,
          Math.min(
            points.length - 1,
            current + (event.key === "ArrowLeft" ? -1 : 1),
          ),
        ),
      );
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(current);
    }
  };
  const selected = plottedPoints[selectedIndex];
  return (
    <div
      className="quality-sparkline-wrap"
      role="button"
      tabIndex={0}
      aria-label={message(locale, "qualityInteractiveChart")}
      onKeyDown={selectWithKeyboard}
      onPointerDown={beginPointerSelection}
      onPointerMove={selectFromPointer}
      onPointerUp={endPointerSelection}
      onPointerCancel={endPointerSelection}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onClear();
      }}
    >
      <svg
        className="quality-sparkline"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="quality-sparkline-baseline"
          d="M0 26H100"
          vectorEffect="non-scaling-stroke"
        />
        <MeridianLines positions={meridianLines} height={28} bottom={26} />
        <polyline points={plot} vectorEffect="non-scaling-stroke" />
      </svg>
      {selected && (
        <span
          className="quality-sparkline-marker"
          style={{
            "--quality-marker-x": `${selected.x}%`,
            "--quality-marker-y": `${(selected.y / 28) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

function pointWindow(point, locale, timeZone = "UTC", withNight = false) {
  if (Number.isFinite(Number(point?.fromMinute))) {
    const window = message(locale, "qualityElapsedWindow")
      .replace("{from}", durationText(Number(point.fromMinute), locale) || "0")
      .replace("{to}", durationText(Number(point.toMinute), locale) || "0");
    return withNight && point.night
      ? `${message(locale, "publicNightLabel").replace("{night}", String(point.night))} · ${window}`
      : window;
  }
  const format = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  });
  const from = new Date(point.fromUtc || point.dateUtc);
  const to = new Date(point.toUtc || point.dateUtc);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()))
    return "";
  return `${format.format(from)}–${format.format(to)} ${timeZone === "UTC" ? "UTC" : "JST"}`;
}

function range(values) {
  const numbers = values.filter(Number.isFinite);
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : null;
}

function qualityInterpretation(quality, locale) {
  const background = range(
    quality.series.map((point) => Number(point.backgroundRelativePercent)),
  );
  const fwhm = range(quality.series.map((point) => Number(point.fwhmPixels)));
  const eccentricity = Number(quality.summary?.medianEccentricity);
  const backgroundPeak = background && background[1] >= 125;
  const fwhmVaries = fwhm && fwhm[1] / Math.max(fwhm[0], 0.01) >= 1.25;
  const shapeNeedsAttention =
    Number.isFinite(eccentricity) && eccentricity >= 0.35;
  if (!backgroundPeak && !fwhmVaries && !shapeNeedsAttention)
    return message(locale, "qualityInterpretationStable");
  return [
    backgroundPeak &&
      message(locale, "qualityInterpretationBackground").replace(
        "{value}",
        Math.round(background[1]),
      ),
    fwhmVaries && message(locale, "qualityInterpretationFwhm"),
    shapeNeedsAttention && message(locale, "qualityInterpretationShape"),
  ]
    .filter(Boolean)
    .join(" ");
}

function formatArcseconds(value, locale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}″`;
}

function formatSignedArcseconds(value, locale) {
  const number = Number(value);
  const sign = number > 0 ? "+" : number < 0 ? "−" : "";
  return `${sign}${formatArcseconds(Math.abs(number), locale)}`;
}

function GuidingTrace({
  points,
  selectedIndex,
  onSelect,
  onClear,
  locale,
  meridianEvents = [],
}) {
  const maximum = Math.max(
    2.25,
    ...points.flatMap((point) => [
      Math.abs(point.raArcsec),
      Math.abs(point.decArcsec),
      Math.abs(point.rmsTotalArcsec),
    ]),
  );
  const domain = Math.ceil(maximum * 2) / 2;
  const x = (index) => (index / Math.max(points.length - 1, 1)) * 100;
  const y = (value) => 30 - (value / domain) * 27;
  const polyline = (valueFor) =>
    points
      .map(
        (point, index) =>
          `${x(index).toFixed(2)},${y(valueFor(point)).toFixed(2)}`,
      )
      .join(" ");
  const rmsBand = [
    ...points.map(
      (point, index) =>
        `${x(index).toFixed(2)},${y(point.rmsTotalArcsec).toFixed(2)}`,
    ),
    ...points.map((point, index) => {
      const reverseIndex = points.length - index - 1;
      return `${x(reverseIndex).toFixed(2)},${y(-points[reverseIndex].rmsTotalArcsec).toFixed(2)}`;
    }),
  ].join(" ");
  const meridianLines = meridianPositions(points, meridianEvents);
  const selectAt = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - bounds.left) / Math.max(bounds.width, 1)),
    );
    onSelect(Math.round(ratio * (points.length - 1)));
  };
  const selectFromPointer = (event) => {
    if (
      event.pointerType !== "mouse" &&
      !event.currentTarget.hasPointerCapture?.(event.pointerId)
    )
      return;
    selectAt(event);
  };
  const beginPointerSelection = (event) => {
    if (event.pointerType !== "mouse") {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
    selectAt(event);
  };
  const endPointerSelection = (event) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const selectWithKeyboard = (event) => {
    const current = Number.isInteger(selectedIndex) ? selectedIndex : 0;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(
        Math.max(
          0,
          Math.min(
            points.length - 1,
            current + (event.key === "ArrowLeft" ? -1 : 1),
          ),
        ),
      );
    }
  };
  return (
    <div
      className="guiding-trace-wrap"
      role="button"
      tabIndex={0}
      aria-label={message(locale, "qualityInteractiveChart")}
      onKeyDown={selectWithKeyboard}
      onPointerDown={beginPointerSelection}
      onPointerMove={selectFromPointer}
      onPointerUp={endPointerSelection}
      onPointerCancel={endPointerSelection}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onClear();
      }}
    >
      <svg
        className="guiding-trace"
        viewBox="0 0 100 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className="guiding-trace-zero"
          d="M0 30H100"
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="guiding-trace-threshold"
          d={`M0 ${y(2)}H100`}
          vectorEffect="non-scaling-stroke"
        />
        <path
          className="guiding-trace-threshold"
          d={`M0 ${y(-2)}H100`}
          vectorEffect="non-scaling-stroke"
        />
        <MeridianLines positions={meridianLines} height={60} />
        <polygon className="guiding-trace-rms-band" points={rmsBand} />
        <polyline
          className="guiding-trace-ra"
          points={polyline((point) => point.raArcsec)}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          className="guiding-trace-dec"
          points={polyline((point) => point.decArcsec)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="guiding-trace-threshold-label"
        style={{ "--guiding-threshold-y": `${(y(2) / 60) * 100}%` }}
      >
        +2″
      </span>
      <span
        className="guiding-trace-threshold-label"
        style={{ "--guiding-threshold-y": `${(y(-2) / 60) * 100}%` }}
      >
        −2″
      </span>
      {Number.isInteger(selectedIndex) && (
        <span
          className="guiding-trace-marker"
          style={{ "--guiding-marker-x": `${x(selectedIndex)}%` }}
        />
      )}
    </div>
  );
}

function sessionLabel(session, locale) {
  if (session.night)
    return message(locale, "publicNightLabel").replace(
      "{night}",
      String(session.night),
    );
  const date = new Date(session.startUtc);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: session.timeZone || "UTC",
  }).format(date);
}

export function SessionTelemetry({
  sessions,
  locale,
  title = message(locale, "sessionTelemetry"),
}) {
  const [activeId, setActiveId] = useState(sessions[0]?.id || "");
  const [activePoint, setActivePoint] = useState(null);
  const session = sessions.find((item) => item.id === activeId) || sessions[0];
  if (!session) return null;
  const summary = session.summary || {};
  const temperatureEvents = (session.events || []).filter(
    (event) =>
      event.type === "autofocus" && Number.isFinite(event.temperatureC),
  );
  const guidePoints = (session.guideSeries || []).filter(
    (point) =>
      Number.isFinite(Number(point.raArcsec)) &&
      Number.isFinite(Number(point.decArcsec)) &&
      Number.isFinite(Number(point.rmsTotalArcsec)),
  );
  const meridianEvents = (session.events || []).filter(
    (event) => event.type === "meridian-flip",
  );
  return (
    <section className="session-telemetry">
      {title || sessions.length > 1 ? (
        <div className="capture-quality-heading">
          <div>{title ? <h3>{title}</h3> : null}</div>
          {sessions.length > 1 && (
            <label className="session-telemetry-select">
              <span>{message(locale, "sessionTelemetrySession")}</span>
              <select
                value={session.id}
                onChange={(event) => {
                  setActiveId(event.target.value);
                  setActivePoint(null);
                }}
              >
                {sessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {sessionLabel(item, locale)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      ) : null}
      {/* The catalogue's sources; a gallery's night names none. */}
      {session.night ? null : (
        <p className="session-telemetry-intro">
          {message(locale, "sessionTelemetryIntro")}
        </p>
      )}
      <p className="session-telemetry-window">
        {sessionLabel(session, locale)} ·{" "}
        {session.night
          ? message(locale, "sessionTelemetryDuration").replace(
              "{duration}",
              durationText(session.durationMinutes, locale),
            )
          : pointWindow(
              { fromUtc: session.startUtc, toUtc: session.endUtc },
              locale,
              session.timeZone || "UTC",
            )}
      </p>
      {guidePoints.length > 1 && (
        <div className="quality-chart-area session-telemetry-charts">
          <div className="guiding-chart">
            <div
              className="guiding-legend"
              aria-label={message(locale, "sessionTelemetry")}
            >
              <span className="is-ra">
                <i />
                {message(locale, "guidingRa")}
                <strong>{formatArcseconds(summary.rmsRaArcsec, locale)}</strong>
              </span>
              <span className="is-dec">
                <i />
                {message(locale, "guidingDec")}
                <strong>
                  {formatArcseconds(summary.rmsDecArcsec, locale)}
                </strong>
              </span>
              <span className="is-rms">
                <i />
                RMS{" "}
                <strong>
                  {formatArcseconds(summary.rmsTotalArcsec, locale)}
                </strong>
              </span>
              {meridianEvents.length > 0 && <MeridianLegend locale={locale} />}
            </div>
            <GuidingTrace
              points={guidePoints}
              selectedIndex={activePoint?.index}
              locale={locale}
              onSelect={(index) =>
                setActivePoint({ index, point: guidePoints[index] })
              }
              onClear={() => setActivePoint(null)}
              meridianEvents={meridianEvents}
            />
          </div>
          {activePoint && (
            <div className="quality-point-details" role="status">
              <strong>
                {pointWindow(
                  activePoint.point,
                  locale,
                  session.timeZone || "UTC",
                )}
              </strong>
              <span>
                <b className="is-ra">
                  {message(locale, "guidingRa")}
                  {formatSignedArcseconds(activePoint.point.raArcsec, locale)}
                </b>
                <b className="is-dec">
                  {message(locale, "guidingDec")}
                  {formatSignedArcseconds(activePoint.point.decArcsec, locale)}
                </b>
                <b className="is-rms">
                  RMS{" "}
                  {formatArcseconds(activePoint.point.rmsTotalArcsec, locale)}
                </b>
                · {activePoint.point.sampleCount}{" "}
                {message(locale, "guidingSamplesAtPoint")}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="session-telemetry-events">
        <span>
          <strong>{summary.ditherCount || 0}</strong>
          {message(locale, "guidingDithers")}
        </span>
        <span>
          <strong>{summary.settleTimeoutCount || 0}</strong>
          {message(locale, "guidingSettleTimeouts")}
        </span>
        <span>
          <strong>
            {summary.autofocusSuccessCount || 0}/{summary.autofocusCount || 0}
          </strong>
          {message(locale, "guidingAutofocus")}
        </span>
        <span>
          <strong>{summary.meridianFlipCount || 0}</strong>
          {message(locale, "guidingMeridianFlips")}
        </span>
      </div>
      {temperatureEvents.length > 0 && (
        <p className="session-telemetry-temperature">
          {message(locale, "guidingAutofocusTemperatures")}
          {labelValueSeparator(locale)}
          {temperatureEvents
            .map(
              (event) =>
                `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(event.temperatureC)} °C`,
            )
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

/** A compact, shared visual for a target and its nightly session aggregate. */
export function CaptureQuality({
  quality,
  locale = "en",
  compact = false,
  // A gallery draws the charts inside its own section (no title of their
  // own) and the guiding in another (`withTelemetry: false`).
  title = message(locale, "captureQuality"),
  withTelemetry = true,
}) {
  const [openHelp, setOpenHelp] = useState(null);
  const [activePoint, setActivePoint] = useState(null);
  if (!quality?.series?.length) return null;
  const summaries = {
    backgroundRelativePercent: quality.series.at(-1)?.backgroundRelativePercent,
    fwhmPixels: quality.summary?.medianFwhmPixels,
    eccentricity: quality.summary?.medianEccentricity,
  };
  const meridianEvents = (quality.sessionTelemetry || []).flatMap((session) =>
    (session.events || []).filter((event) => event.type === "meridian-flip"),
  );
  return (
    <section className={`capture-quality${compact ? " is-compact" : ""}`}>
      <div className="capture-quality-heading">
        <div>
          {title ? <h3>{title}</h3> : null}
          <p>
            {quality.frameCount} {message(locale, "qualityFramesMeasured")}
          </p>
        </div>
        <div className="quality-heading-meta">
          {meridianEvents.length > 0 && <MeridianLegend locale={locale} />}
          <span className="quality-note">
            {message(locale, "qualityNormalized")}
          </span>
        </div>
      </div>
      <div className="quality-chart-area">
        <div className="quality-charts">
          {chartDefinitions.map((definition) => {
            const points = finiteSeries(quality.series, definition.key);
            const value = Number(summaries[definition.key]);
            if (!points.length || !Number.isFinite(value)) return null;
            const selectedIndex =
              activePoint?.key === definition.key ? activePoint.index : null;
            return (
              <div className="quality-chart" key={definition.key}>
                <div className="quality-chart-value">
                  <strong>{definition.format(value, locale)}</strong>
                </div>
                <Sparkline
                  points={points}
                  selectedIndex={selectedIndex}
                  locale={locale}
                  onSelect={(index) =>
                    setActivePoint({
                      key: definition.key,
                      index,
                      point: points[index],
                    })
                  }
                  onClear={() =>
                    setActivePoint((current) =>
                      current?.key === definition.key ? null : current,
                    )
                  }
                  meridianEvents={meridianEvents}
                />
                <div className="quality-chart-description">
                  <span className="quality-chart-label">
                    {message(locale, definition.label)}
                    <span
                      className={`quality-help-wrap${openHelp === definition.key ? " is-open" : ""}`}
                    >
                      <button
                        className={`quality-help${openHelp === definition.key ? " is-active" : ""}`}
                        type="button"
                        onClick={() =>
                          setOpenHelp((current) =>
                            current === definition.key ? null : definition.key,
                          )
                        }
                        aria-label={message(locale, "qualityMetricHelp")}
                        aria-expanded={openHelp === definition.key}
                        aria-controls={`quality-help-${definition.key}`}
                      >
                        ?
                      </button>
                      <span
                        className="quality-help-tooltip"
                        id={`quality-help-${definition.key}`}
                        role="tooltip"
                      >
                        {message(locale, definition.help)}
                      </span>
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {activePoint && (
          <div className="quality-point-details" role="status">
            <strong>
              {message(
                locale,
                chartDefinitions.find(
                  (definition) => definition.key === activePoint.key,
                )?.label,
              )}
              {" · "}
              {chartDefinitions
                .find((definition) => definition.key === activePoint.key)
                ?.format(activePoint.point.value, locale)}
            </strong>
            <span>
              {pointWindow(
                activePoint.point,
                locale,
                "UTC",
                quality.series.some((point) => point.night > 1),
              )}{" "}
              · {activePoint.point.frameCount}{" "}
              {message(locale, "qualityFramesAtPoint")}
            </span>
          </div>
        )}
      </div>
      <p className="quality-interpretation">
        {qualityInterpretation(quality, locale)}
      </p>
      {withTelemetry && quality.sessionTelemetry?.length > 0 && (
        <SessionTelemetry sessions={quality.sessionTelemetry} locale={locale} />
      )}
    </section>
  );
}
