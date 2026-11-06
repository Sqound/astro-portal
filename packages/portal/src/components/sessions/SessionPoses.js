"use client";

// SESSION-GUIDING-STATS-01 — « Poses » of the page of a session: the
// frames of the night (`analysis.report.quality[]`) as one bar each over the
// night's hours (its length the exposure, its colour the filter), the frames
// the stacking left out hatched with their reason in the bubble, the pauses,
// meridian flips and focus runs above, four figures (kept / declared, kept
// integration, left out by Astro Sync, the sensor) and a table by filter.
// A report that does not say which frames were left out (`posesSummary.
// rejectedKnown` false, a report v2) shows none and says so in one line. The
// axis is the whole night's, also when « Guidage » is zoomed. Inline SVG at
// the chart's real width; the rules are `session-guiding-view.js`'s.

import { useId } from "react";
import { message } from "portal/i18n.js";
import { InfoButton } from "../dialog/InfoButton.js";
import { useChartWidth } from "./chart-width.js";
import { say } from "./night-detail-view.js";
import {
  celsiusText,
  chartZone,
  exposureText,
  figureText,
  filterName,
  markerTimes,
  nightMarkers,
  nightWindow,
  pausesAndFlips,
  posesByFilter,
  posesOf,
  poseTip,
  reasonsLine,
  reasonText,
  sensorOf,
  traceOf,
  windowTicks,
  zonedClock,
} from "./session-guiding-view.js";
import { durationText } from "../../written-forms.js";

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");

/** The frames over the night, one bar each; `compact` for a night's tab. */
export function PosesTimeline({
  locale = "en",
  poses,
  markers = [],
  window,
  zone = null,
  compact = false,
  initialWidth = 1000,
}) {
  const [box, width] = useChartWidth(initialWidth);
  const id = safeId(useId());
  if (!poses?.length || !window) return null;
  const narrow = width < 600;
  const left = compact || narrow ? 34 : 40;
  const right = 6;
  const labels = 16;
  const trackTop = labels + 2;
  const track = compact ? 16 : 24;
  const trackBottom = trackTop + track;
  const rejectedRow = poses.some((pose) => pose.rejected) && !compact ? 16 : 0;
  const axisY = trackBottom + rejectedRow + 14;
  const height = axisY + 6;
  const span = window.to - window.from;
  const x = (t) =>
    left +
    ((Math.max(window.from, Math.min(window.to, t)) - window.from) / span) *
      (width - left - right);
  const ticks = windowTicks(
    window,
    zone,
    width - left - right,
    compact ? 54 : 64,
  );
  const { pauses, flips } = pausesAndFlips(markers);
  const focus = markerTimes(markers, "autofocus");
  const rejected = poses.filter((pose) => pose.rejected);
  const named = rejected.length <= 3 ? rejected : [];
  return (
    <div
      ref={box}
      className={`session-poses-plot${compact ? " is-compact" : ""}`}
      data-testid="session-poses-chart"
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={message(locale, "sessionPosesChartLabel")}
      >
        <defs>
          <pattern
            id={`rejected-${id}`}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect
              width="4"
              height="4"
              className="session-poses-rejected-fill"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="4"
              className="session-poses-rejected-line"
            />
          </pattern>
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
        <text
          className="session-guiding-tick"
          x={left - 4}
          y={trackTop + track / 2 + 3}
          textAnchor="end"
        >
          {message(locale, "sessionPosesRowLabel")}
        </text>
        <rect
          className="session-guiding-frame"
          x={left}
          y={trackTop}
          width={width - left - right}
          height={track}
          rx={3}
        />
        {ticks.map((tick) => (
          <line
            key={`hour-${tick.t}`}
            className={`session-guiding-hour${tick.whole ? " is-whole" : ""}`}
            x1={x(tick.t)}
            x2={x(tick.t)}
            y1={trackTop}
            y2={trackBottom}
          />
        ))}
        {pauses.map((pause) => (
          <g key={`pause-${pause.from}`}>
            <rect
              className="session-guiding-pause"
              x={x(pause.from)}
              y={trackTop}
              width={Math.max(1, x(pause.to) - x(pause.from))}
              height={track}
              fill={`url(#pause-${id})`}
            >
              <title>
                {`${say(locale, "sessionPosesPause", {
                  duration: durationText(
                    Math.max(1, Math.round((pause.to - pause.from) / 60_000)),
                    locale,
                  ),
                })} · ${zonedClock(pause.from, zone)}–${zonedClock(pause.to, zone)}`}
              </title>
            </rect>
          </g>
        ))}
        {poses.map((pose) => (
          <rect
            key={`pose-${pose.index}`}
            className={`session-poses-bar tone-${pose.tone}${pose.rejected ? " is-rejected" : ""}`}
            x={x(pose.at)}
            y={trackTop + 3}
            width={Math.max(1.2, x(pose.end) - x(pose.at) - 1)}
            height={track - 6}
            fill={pose.rejected ? `url(#rejected-${id})` : undefined}
            data-pose={pose.index}
          >
            <title>{poseTip(pose, { locale, zone })}</title>
          </rect>
        ))}
        {flips.map((t) => (
          <g key={`flip-${t}`} className="session-guiding-flip">
            <line x1={x(t)} x2={x(t)} y1={trackTop - 2} y2={trackBottom + 2} />
            <line
              className="session-poses-hit"
              x1={x(t)}
              x2={x(t)}
              y1={trackTop - 2}
              y2={trackBottom + 2}
            >
              <title>
                {say(locale, "nightPageFlipAt", { time: zonedClock(t, zone) })}
              </title>
            </line>
          </g>
        ))}
        {focus.map((t) => (
          <circle
            key={`focus-${t}`}
            className="session-guiding-focus"
            cx={x(t)}
            cy={trackTop - 6}
            r={3.5}
          >
            <title>
              {`${message(locale, "sessionGuidingLegendFocus")} · ${zonedClock(t, zone)}`}
            </title>
          </circle>
        ))}
        {named.map((pose) => (
          <text
            key={`mark-${pose.index}`}
            className="session-poses-note is-rejected"
            x={x(pose.at)}
            y={trackBottom + 12}
            textAnchor={x(pose.at) > width - 90 ? "end" : "start"}
          >
            {`▲ ${say(locale, "sessionPosesRejectedMark", { index: pose.index })}`}
          </text>
        ))}
        {ticks.map((tick, index) => (
          <text
            key={`label-${tick.t}`}
            className={`session-guiding-axis${tick.whole ? " is-whole" : ""}`}
            x={x(tick.t)}
            y={axisY}
            textAnchor={
              index === 0 && x(tick.t) - left < 16 ? "start" : "middle"
            }
          >
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** The legend: the filters of the night, the left-out frames, the marks. */
function PosesLegend({ locale, poses, markers }) {
  const tones = [];
  for (const pose of poses)
    if (
      !tones.some(
        (entry) =>
          entry.tone === pose.tone &&
          (pose.tone !== "other" || entry.filter === pose.filter),
      )
    )
      tones.push({ tone: pose.tone, filter: pose.filter });
  const { pauses, flips } = pausesAndFlips(markers);
  return (
    <ul className="session-guiding-legend session-poses-legend">
      {tones.map((entry) => (
        <li
          key={`${entry.tone}-${entry.filter}`}
          className={`is-tone tone-${entry.tone}`}
        >
          <i aria-hidden="true" />
          {entry.tone === "none"
            ? message(locale, "sessionPosesNoFilterLegend")
            : filterName(entry.filter, locale)}
        </li>
      ))}
      {poses.some((pose) => pose.rejected) ? (
        <li className="is-rejected">
          <i aria-hidden="true" />
          {message(locale, "sessionPosesLegendRejected")}
        </li>
      ) : null}
      {pauses.length ? (
        <li className="is-pause">
          <i aria-hidden="true" />
          {message(locale, "sessionGuidingLegendPause")}
        </li>
      ) : null}
      {flips.length ? (
        <li className="is-flip">
          <i aria-hidden="true" />
          {message(locale, "sessionGuidingLegendFlip")}
        </li>
      ) : null}
      {markers.some((marker) => marker.type === "autofocus") ? (
        <li className="is-focus">
          <i aria-hidden="true" />
          {message(locale, "sessionGuidingLegendFocus")}
        </li>
      ) : null}
    </ul>
  );
}

/** « 2 h 14 »: an integration. */
const integration = (seconds, locale) =>
  durationText(Math.round((seconds ?? 0) / 60), locale);

/** « non alignée » for one reason, « 14 aube · 1 non alignée » for several. */
function rejectedDetail(byReason, locale) {
  const reasons = Object.entries(byReason ?? {}).filter(
    ([, count]) => count > 0,
  );
  return reasons.length === 1
    ? reasonText(reasons[0][0], locale)
    : reasonsLine(byReason, locale);
}

/** The four figures: kept / declared, kept integration, left out, the sensor. */
export function PosesFigures({ locale, summary, poses, rejectedKnown }) {
  const groups = posesByFilter(poses);
  const sensor = sensorOf(poses);
  const sharedExposure = groups.length === 1 ? groups[0] : null;
  const number = (value) => new Intl.NumberFormat(locale).format(value ?? 0);
  return (
    <dl className="night-figures session-poses-figures">
      <div className="night-figure">
        <dt>{message(locale, "sessionPosesKept")}</dt>
        <dd>
          {number(summary?.kept)}
          <span className="night-figure-extra">
            {" "}
            {say(locale, "sessionPosesOf", { total: number(summary?.total) })}
          </span>
        </dd>
      </div>
      <div className="night-figure">
        <dt>{message(locale, "sessionPosesIntegration")}</dt>
        <dd>
          {integration(summary?.keptSeconds, locale)}
          {sharedExposure ? (
            <span className="night-figure-extra">
              {" "}
              {[
                exposureText(sharedExposure.exposureSeconds, locale),
                sharedExposure.gain !== null
                  ? say(locale, "sessionPosesGain", {
                      gain: sharedExposure.gain,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : null}
        </dd>
      </div>
      <div
        className={`night-figure${(summary?.rejected ?? 0) > 0 && rejectedKnown ? " is-rejected" : ""}`}
      >
        <dt>{message(locale, "sessionPosesRejected")}</dt>
        <dd>
          {rejectedKnown ? number(summary?.rejected) : "—"}
          <span className="night-figure-extra">
            {" "}
            {rejectedKnown
              ? (summary?.rejected ?? 0) > 0
                ? rejectedDetail(summary?.byReason, locale)
                : message(locale, "sessionPosesRejectedNone")
              : message(locale, "sessionPosesRejectsUnknownShort")}
          </span>
        </dd>
      </div>
      <div className="night-figure">
        <dt>{message(locale, "sessionPosesSensor")}</dt>
        <dd>
          {sensor ? celsiusText(sensor.median, locale) : "—"}
          {sensor ? (
            <span className="night-figure-extra">
              {" "}
              {sensor.spread <= 0.5
                ? say(locale, "sessionPosesStable", {
                    spread: figureText(sensor.spread, locale, 1),
                  })
                : say(locale, "sessionPosesSpread", {
                    spread: figureText(sensor.spread, locale, 1),
                  })}
            </span>
          ) : null}
        </dd>
      </div>
    </dl>
  );
}

/** The table by filter (and exposure). */
function PosesTable({ locale, poses, rejectedKnown }) {
  const groups = posesByFilter(poses);
  return (
    <div className="session-poses-table-wrap">
      <table className="session-poses-table">
        <thead>
          <tr>
            <th scope="col">{message(locale, "sessionPosesColFilter")}</th>
            <th scope="col">{message(locale, "sessionPosesColPose")}</th>
            <th scope="col">{message(locale, "sessionPosesColKept")}</th>
            {rejectedKnown ? (
              <th scope="col">{message(locale, "sessionPosesColRejected")}</th>
            ) : null}
            <th scope="col">{message(locale, "sessionPosesColIntegration")}</th>
            <th scope="col">{message(locale, "sessionPosesColSensor")}</th>
            <th scope="col">{message(locale, "sessionPosesColMeasures")}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <th scope="row">
                <i
                  className={`session-poses-swatch tone-${group.tone}`}
                  aria-hidden="true"
                />
                {filterName(group.filter, locale)}
              </th>
              <td>
                {[
                  exposureText(group.exposureSeconds, locale),
                  group.gain !== null
                    ? say(locale, "sessionPosesGain", { gain: group.gain })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </td>
              <td>{new Intl.NumberFormat(locale).format(group.kept)}</td>
              {rejectedKnown ? (
                <td>
                  {group.rejected ? reasonsLine(group.reasons, locale) : "0"}
                </td>
              ) : null}
              <td>{integration(group.keptSeconds, locale)}</td>
              <td>{celsiusText(group.sensorTempC, locale)}</td>
              <td>
                {group.fwhmPixels !== null || group.eccentricity !== null
                  ? [
                      group.fwhmPixels !== null
                        ? `${figureText(group.fwhmPixels, locale, 2)} px`
                        : "—",
                      group.eccentricity !== null
                        ? figureText(group.eccentricity, locale, 2)
                        : "—",
                    ].join(" · ")
                  : message(locale, "sessionPosesNotMeasured")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The section: absent without a frame (no analysis, or one without a
 * quality row). `summary` is `posesSummary` of the service, `report` the
 * analysis, `guidingTrace` the service's trace (its markers and its hours).
 */
export function SessionPosesSection({
  locale = "en",
  summary = null,
  report = null,
  guidingTrace = null,
  bounds = null,
  zone = null,
  initialWidth = 1000,
}) {
  if (!summary || !report) return null;
  const rejectedKnown = summary.rejectedKnown === true;
  const poses = posesOf(report, { rejectedKnown });
  if (!poses.length) return null;
  const trace = traceOf(guidingTrace);
  const markers = nightMarkers(trace, report);
  const window = nightWindow(
    bounds,
    trace ?? {
      from: poses[0].at,
      to: poses[poses.length - 1].end,
    },
  );
  return (
    <section
      id="session-poses"
      className="night-card session-poses"
      aria-labelledby="session-poses-title"
      data-testid="session-poses"
    >
      <div className="session-guiding-head">
        <h2 id="session-poses-title">{message(locale, "sessionPosesTitle")}</h2>
        <span className="session-guiding-badge">
          {message(locale, "sessionPosesCountedBy")}
        </span>
        <span className="session-guiding-head-end">
          <InfoButton
            locale={locale}
            label={message(locale, "sessionPosesInfoLabel")}
            title={message(locale, "sessionPosesTitle")}
            body={message(locale, "sessionPosesInfo")}
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
            rejectedKnown
              ? "sessionPosesSubtitle"
              : "sessionPosesSubtitleNoRejects",
          ),
        ].join(" · ")}
      </p>
      <PosesFigures
        locale={locale}
        summary={summary}
        poses={poses}
        rejectedKnown={rejectedKnown}
      />
      {rejectedKnown ? null : (
        <p
          className="session-poses-unknown"
          data-testid="session-poses-unknown"
        >
          {message(locale, "sessionPosesRejectsUnknown")}
        </p>
      )}
      <PosesTimeline
        locale={locale}
        poses={poses}
        markers={markers}
        window={window}
        zone={zone}
        initialWidth={initialWidth}
      />
      <PosesLegend locale={locale} poses={poses} markers={markers} />
      <PosesTable locale={locale} poses={poses} rejectedKnown={rejectedKnown} />
    </section>
  );
}
