"use client";

// The hourly weather strip, out of `PlannerPage.js` so that "Cette nuit" shows
// the planner's strip as it is: the icon-and-value columns, the ⓘ with the
// estimate's note and the forecast's confidence, the refresh, the horizontal
// swipe, "Mis à jour à …" after a refresh.

import { useEffect, useRef, useState } from "react";
import { cardinalDirection } from "portal/planner/cardinal-directions.js";
import { message } from "portal/i18n.js";
import { WebDialog } from "portal/components/dialog/WebDialog.js";
import {
  cloudDisagreement,
  cloudUncertainMedianPercent,
  forecastModelLabels,
  retainedCloudCover,
} from "portal/astronomy-forecast.js";
import {
  horizontalWheelScrollDelta,
  hourlyForecastConfidence,
} from "../hourly-forecast.js";
import { validTimeZone } from "../planner.js";

function time(value, locale, timeZone) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: validTimeZone(timeZone),
  }).format(new Date(value));
}

function decimal(value, locale, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

/** The level of an hour's score (the bounds: 82, 64, 42). */
export function scoreLevel(score) {
  return score >= 82
    ? "excellent"
    : score >= 64
      ? "favourable"
      : score >= 42
        ? "variable"
        : "poor";
}

// "The models disagree (ICON 74 %, JMA 4 %)" for an hour whose weather models
// are 25 points or more apart, `null` otherwise.
export function modelsDisagreementNote(row, locale) {
  const disagreement = cloudDisagreement(row?.cloudModels);
  if (!disagreement) return null;
  return message(locale, "plannerForecastModelsDisagree")
    .replace("{highModel}", disagreement.high.label)
    .replace("{highCover}", String(disagreement.high.cover))
    .replace("{lowModel}", disagreement.low.label)
    .replace("{lowCover}", String(disagreement.low.cover));
}

/**
 * The models' range next to the retained cover ("3–74 %"), `null` without
 * several models or when they give the same cover.
 */
export function cloudRangeText(source, locale) {
  const min = source?.cloudMin;
  const max = source?.cloudMax;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max)
    return null;
  return message(locale, "plannerForecastCloudRange")
    .replace("{min}", String(min))
    .replace("{max}", String(max));
}

const windCardinal = (direction, locale) =>
  Number.isFinite(direction) ? cardinalDirection(direction, locale) : null;

const windDirectionLabel = (locale, direction) => {
  const from = windCardinal(direction, locale);
  if (!from) return null;
  const to = windCardinal(direction + 180, locale);
  return message(locale, "plannerForecastWindDirection")
    .replace("{from}", from)
    .replace("{to}", to);
};

function ForecastMetricIcon({ kind, direction }) {
  if (kind === "cloud")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 18h10a3.5 3.5 0 1 0-1-6.86A5 5 0 0 0 6 13.25 2.75 2.75 0 0 0 6.5 18Z" />
      </svg>
    );
  if (kind === "humidity")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.5s5.5 5.6 5.5 10a5.5 5.5 0 0 1-11 0c0-4.4 5.5-10 5.5-10Z" />
      </svg>
    );
  if (kind === "precipitation")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11a8 8 0 0 1 16 0H4Z" />
        <path d="M12 11v7a2 2 0 0 0 4 0" />
      </svg>
    );
  if (kind === "visibility")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ transform: `rotate(${Number(direction || 0) + 180}deg)` }}
    >
      <path d="M12 3v16M7.5 7.5 12 3l4.5 4.5" />
    </svg>
  );
}

// A small "i" trigger that opens a click-toggled popover next to whatever it
// sits beside -- the theme's own click-to-open pattern (see
// `TargetKnowledgeDetails`), used here for explanatory copy that used to
// only ever surface as a `title=` hover tooltip and so never reached a touch
// device: the sky-quality VIIRS note and the hourly forecast's own
// confidence/estimate note. Deliberately lighter than
// `TargetKnowledgeDetails` -- no portal, no viewport-aware repositioning --
// since both call sites sit in the document's normal flow with room enough
// below them for a small panel.
export function InfoDisclosure({ ariaLabel, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const dismissWhenOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissWhenOutside);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissWhenOutside);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);
  return (
    <span
      className={`planner-info-disclosure${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 10.7v5" />
          <path d="M12 7.5h.01" />
        </svg>
      </button>
      {open && (
        <div
          className="planner-info-disclosure-popover"
          role="dialog"
          aria-label={ariaLabel}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      )}
    </span>
  );
}

/**
 * The detail of one hour, what a touch on a column of the strip, or on a row of
 * "Heure par heure", opens. The models one by one (proper names, never
 * translated), the range in one line and the "incertaine" tag with its reason
 * live here, never on the compact views.
 */
export function HourDetailBody({ row, locale }) {
  const retained = retainedCloudCover(row?.cloudModels);
  const several = retained && retained.count > 1 ? retained : null;
  const windDirection = windDirectionLabel(locale, row.windDirection);
  const percent = (value) =>
    value === null || value === undefined ? "—" : `${value}%`;
  const lines = [
    ["cloud", "plannerForecastCloud", percent(row.cloud)],
    [
      "precipitation",
      "plannerForecastPrecipitation",
      percent(row.precipitation),
    ],
    ["humidity", "plannerForecastHumidity", percent(row.humidity)],
    [
      "wind",
      "plannerForecastWind",
      `${row.wind === null || row.wind === undefined ? "—" : `${row.wind} km/h`}${
        windDirection ? ` · ${windDirection}` : ""
      }`,
    ],
    [
      "visibility",
      "plannerForecastVisibility",
      row.visibilityKm === null || row.visibilityKm === undefined
        ? "—"
        : `${decimal(row.visibilityKm, locale, 1)} km`,
    ],
  ];
  const order = Object.keys(forecastModelLabels);
  const models = several
    ? Object.entries(row.cloudModels)
        .filter(([, cover]) => Number.isFinite(cover))
        .sort(([a], [b]) => {
          const left = order.includes(a) ? order.indexOf(a) : order.length;
          const right = order.includes(b) ? order.indexOf(b) : order.length;
          return left - right || (a < b ? -1 : a > b ? 1 : 0);
        })
    : [];
  const range = cloudRangeText(row, locale);
  const disagreement = modelsDisagreementNote(row, locale);
  return (
    <div className="planner-hour-detail" data-testid="planner-hour-detail">
      {lines.map(([kind, key, value]) => (
        <p
          className={`planner-hour-detail-line is-${kind}`}
          data-metric={kind}
          key={kind}
        >
          <span>{message(locale, key)}</span>
          <strong>{value}</strong>
        </p>
      ))}
      {several ? (
        <section
          className="planner-hour-detail-models"
          data-testid="planner-hour-detail-models"
          aria-label={message(locale, "plannerForecastDetailModels")}
        >
          <h3>{message(locale, "plannerForecastDetailModels")}</h3>
          {models.map(([model, cover]) => (
            <p
              className="planner-hour-detail-line"
              data-model={model}
              key={model}
            >
              <span>{forecastModelLabels[model] || model}</span>
              <strong>{`${Math.round(cover)}%`}</strong>
            </p>
          ))}
          {range ? (
            <p
              className="planner-hour-detail-line"
              data-testid="planner-hour-detail-range"
            >
              <span>{message(locale, "plannerForecastDetailRange")}</span>
              <strong>{range}</strong>
            </p>
          ) : null}
          {row.cloudUncertain ? (
            <p
              className="planner-hour-detail-uncertain"
              data-testid="planner-hour-detail-uncertain"
            >
              <strong>{message(locale, "plannerForecastUncertain")}</strong>
              {" · "}
              {message(locale, "plannerForecastUncertainHourWhy")
                .replace(
                  "{model}",
                  forecastModelLabels[retained.high.model] ||
                    retained.high.model,
                )
                .replace("{cover}", String(Math.round(retained.high.cover)))
                .replace("{limit}", String(cloudUncertainMedianPercent))}
            </p>
          ) : null}
        </section>
      ) : null}
      {disagreement ? (
        <p
          className="planner-hourly-forecast-models-note"
          data-testid="planner-hour-detail-disagreement"
        >
          {disagreement}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The dialog around [HourDetailBody]; its title is the hour (`title`, already
 * written in the place's clock, or the hour of the row in `timeZone`).
 */
export function HourDetailDialog({
  row,
  locale,
  timeZone,
  title = null,
  onClose,
}) {
  const close = message(locale, "infoClose");
  return (
    <WebDialog
      className="info-dialog planner-hour-detail-dialog"
      bodyClassName="info-dialog-body"
      closeLabel={close}
      closeOnBackdrop
      title={title ?? time(new Date(row.time), locale, timeZone)}
      onClose={onClose}
      footer={
        <button type="button" className="btn-tertiary" onClick={onClose}>
          {close}
        </button>
      }
    >
      <HourDetailBody row={row} locale={locale} />
    </WebDialog>
  );
}

/**
 * The hourly strip, the planner's and "Cette nuit"'s: `forecast` carries the
 * hours (`hourly`, rows of `hourlyAstronomyForecast`) and `fetchedAt`. "Cette
 * nuit" names it otherwise (`title`: "Estimation météo heure par heure", the
 * word "estimation" kept visible) and shows each hour's score in its level's
 * tint (`hourScores`); the planner passes neither.
 */
export function HourlyForecast({
  forecast,
  locale,
  night,
  onRefresh,
  refreshing = false,
  timeZone,
  title = null,
  hourScores = false,
  className = "",
  infoInCorner = false,
  slot = null,
}) {
  const rows = forecast?.hourly || [];
  const trackRef = useRef(null);
  // The hour whose detail is open.
  const [detail, setDetail] = useState(null);
  // A discreet "Updated at HH:MM" line for a few seconds once a manual refresh
  // (`onRefresh`) settles. Only the success case is surfaced here: a failed
  // refresh clears `forecast` to the "unavailable" state at the call site,
  // which unmounts this section in favour of the retry block that already
  // explains the failure.
  const [refreshStatus, setRefreshStatus] = useState(null);
  const wasRefreshingRef = useRef(refreshing);
  const statusTimerRef = useRef(null);
  useEffect(() => {
    if (wasRefreshingRef.current && !refreshing && forecast?.fetchedAt) {
      setRefreshStatus(
        message(locale, "plannerForecastRefreshedAt").replace(
          "{time}",
          time(forecast.fetchedAt, locale, timeZone),
        ),
      );
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setRefreshStatus(null), 4000);
    }
    wasRefreshingRef.current = refreshing;
  }, [refreshing, forecast?.fetchedAt, locale, timeZone]);
  useEffect(() => () => clearTimeout(statusTimerRef.current), []);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    // The track only needs to scroll once its cells stop fitting the
    // available width; that can happen at any viewport width once there are
    // enough hourly cells, not only under the CSS breakpoint that lowers the
    // mobile cell size. No scrollbar is shown here, and a plain mouse wheel
    // only moves the page vertically by default (only a touch swipe
    // naturally pans sideways), so redirect vertical wheel input into a
    // horizontal scroll whenever the track is actually overflowing. This
    // needs a real listener rather than React's onWheel: React's wheel
    // handler is registered passively, so preventDefault there cannot stop
    // the page from also scrolling underneath.
    const handleWheel = (event) => {
      const delta = horizontalWheelScrollDelta({
        scrollWidth: track.scrollWidth,
        clientWidth: track.clientWidth,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
      if (delta === null) return;
      event.preventDefault();
      track.scrollLeft += delta;
    };
    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => track.removeEventListener("wheel", handleWheel);
  }, [rows.length]);
  if (!rows.length) return null;
  const confidence = hourlyForecastConfidence(night);
  // The cover shown is the highest of several models; when they
  // disagree, the hour where they disagree most is said under the strip.
  const hasModels = rows.some((row) => row.cloudModels);
  const worstDisagreement = rows.reduce(
    (worst, row) =>
      modelsDisagreementNote(row, locale) &&
      (!worst || row.cloudSpread > worst.cloudSpread)
        ? row
        : worst,
    null,
  );
  // On "Cette nuit" the ⓘ goes to the panel's top right
  // corner, the refresh immediately left of it.
  const info = (
    <InfoDisclosure ariaLabel={message(locale, "plannerForecastNote")}>
      <p>{message(locale, "plannerForecastNote")}</p>
      <p>{message(locale, `plannerForecastConfidence${confidence}`)}</p>
      {hasModels && <p>{message(locale, "plannerForecastModelsNote")}</p>}
      {rows.some((row) => row.cloudUncertain) && (
        <p>{message(locale, "plannerForecastUncertainNote")}</p>
      )}
    </InfoDisclosure>
  );
  // An hour wholly outside the chosen slot is hatched.
  const slotStart = slot ? Date.parse(slot.start) : null;
  const slotEnd = slot ? Date.parse(slot.end) : null;
  const outside = (value) => {
    if (!slot) return false;
    const start = typeof value === "number" ? value : Date.parse(value);
    return start + 3600000 <= slotStart || start >= slotEnd;
  };
  return (
    <section
      className={`planner-hourly-forecast${infoInCorner ? " is-info-corner" : ""}${className ? ` ${className}` : ""}`}
      aria-label={title || message(locale, "plannerHourlyForecast")}
    >
      <div className="planner-hourly-forecast-heading">
        <div className="planner-hourly-forecast-title">
          {title ? (
            <h3>{title}</h3>
          ) : (
            <strong>{message(locale, "plannerHourlyForecast")}</strong>
          )}
          {infoInCorner ? null : info}
        </div>
        {onRefresh && (
          <button
            className={`planner-hourly-forecast-refresh${refreshing ? " is-spinning" : ""}`}
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={message(locale, "plannerForecastRefresh")}
            title={message(locale, "plannerForecastRefresh")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4.6 11a7.4 7.4 0 0 1 12.8-4.6M19.4 13a7.4 7.4 0 0 1-12.8 4.6" />
              <path d="M17.6 3.6v4.4h-4.4M6.4 20.4V16h4.4" />
            </svg>
          </button>
        )}
        {infoInCorner ? info : null}
      </div>
      <div
        className="planner-hourly-forecast-track"
        ref={trackRef}
        style={{
          gridTemplateColumns: `repeat(${rows.length}, minmax(var(--planner-hourly-cell-min), 1fr))`,
        }}
      >
        {rows.map((row) => {
          const windDirection = windDirectionLabel(locale, row.windDirection);
          const disagreement = modelsDisagreementNote(row, locale);
          return (
            <div
              className={`planner-hourly-forecast-cell${outside(row.time) ? " is-excluded" : ""}`}
              data-excluded={outside(row.time) ? "true" : undefined}
              key={row.time}
              // A touch on a column opens that hour's detail.
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setDetail(row)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                setDetail(row);
              }}
            >
              {hourScores && Number.isFinite(row.score) ? (
                <span className="planner-hourly-forecast-cell-head">
                  <time>{time(new Date(row.time), locale, timeZone)}</time>
                  <span
                    className="planner-hourly-forecast-score"
                    data-level={scoreLevel(row.score)}
                    // The number at the head of a column has a name.
                    role="img"
                    aria-label={`${message(locale, "plannerForecastHourScore")} ${Math.round(row.score)}`}
                    title={message(locale, "plannerForecastHourScore")}
                  >
                    {Math.round(row.score)}
                  </span>
                </span>
              ) : (
                <time>{time(new Date(row.time), locale, timeZone)}</time>
              )}
              {hourScores && (
                // FIX-FIN-AG: the line is reserved in every scored column
                // (empty and hidden from assistive technology when the score
                // is certain), so the columns share one height and their
                // metric rows line up.
                <span
                  className="planner-hourly-forecast-uncertain"
                  aria-hidden={row.cloudUncertain ? undefined : "true"}
                  title={
                    row.cloudUncertain
                      ? message(locale, "plannerForecastUncertainNote")
                      : undefined
                  }
                >
                  {row.cloudUncertain
                    ? message(locale, "plannerForecastUncertain")
                    : null}
                </span>
              )}
              <div className="planner-hourly-weather-details">
                <span
                  className="planner-hourly-weather-metric is-cloud"
                  data-models-disagree={disagreement ? "true" : undefined}
                  aria-label={`${message(locale, "plannerForecastCloud")} ${row.cloud ?? "—"}%${disagreement ? `. ${disagreement}` : ""}`}
                  title={`${message(locale, "plannerForecastCloud")} ${row.cloud ?? "—"}%${disagreement ? `. ${disagreement}` : ""}`}
                >
                  <ForecastMetricIcon kind="cloud" />
                  <strong>{row.cloud === null ? "—" : `${row.cloud}%`}</strong>
                </span>
                <span
                  className="planner-hourly-weather-metric is-precipitation"
                  aria-label={`${message(locale, "plannerForecastPrecipitation")} ${row.precipitation ?? "—"}%`}
                  title={`${message(locale, "plannerForecastPrecipitation")} ${row.precipitation ?? "—"}%`}
                >
                  <ForecastMetricIcon kind="precipitation" />
                  <strong>
                    {row.precipitation === null ? "—" : `${row.precipitation}%`}
                  </strong>
                </span>
                <span
                  className="planner-hourly-weather-metric is-humidity"
                  aria-label={`${message(locale, "plannerForecastHumidity")} ${row.humidity ?? "—"}%`}
                  title={`${message(locale, "plannerForecastHumidity")} ${row.humidity ?? "—"}%`}
                >
                  <ForecastMetricIcon kind="humidity" />
                  <strong>
                    {row.humidity === null ? "—" : `${row.humidity}%`}
                  </strong>
                </span>
                <span
                  className="planner-hourly-weather-metric is-wind"
                  aria-label={`${message(locale, "plannerForecastWind")} ${row.wind ?? "—"} km/h${windDirection ? ` · ${windDirection}` : ""}`}
                  title={`${message(locale, "plannerForecastWind")} ${row.wind ?? "—"} km/h${windDirection ? ` · ${windDirection}` : ""}`}
                >
                  <ForecastMetricIcon
                    kind="wind"
                    direction={row.windDirection}
                  />
                  <strong>
                    {row.wind === null ? "—" : `${row.wind} km/h`}
                    {windDirection && (
                      // A space between the unit and the point of the compass
                      // ("9 km/h O", not "9 km/hO").
                      <>
                        {" "}
                        <em>{windCardinal(row.windDirection, locale)}</em>
                      </>
                    )}
                  </strong>
                </span>
                <span
                  className="planner-hourly-weather-metric is-visibility"
                  aria-label={`${message(locale, "plannerForecastVisibility")} ${row.visibilityKm ?? "—"} km`}
                  title={`${message(locale, "plannerForecastVisibility")} ${row.visibilityKm ?? "—"} km`}
                >
                  <ForecastMetricIcon kind="visibility" />
                  <strong>
                    {row.visibilityKm === null
                      ? "—"
                      : `${decimal(row.visibilityKm, locale, 1)} km`}
                  </strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {worstDisagreement && (
        <p className="planner-hourly-forecast-models-note" role="note">
          <time>
            {time(new Date(worstDisagreement.time), locale, timeZone)}
          </time>
          {" · "}
          {modelsDisagreementNote(worstDisagreement, locale)}
        </p>
      )}
      {detail ? (
        <HourDetailDialog
          row={detail}
          locale={locale}
          timeZone={timeZone}
          onClose={() => setDetail(null)}
        />
      ) : null}
      <p className="planner-hourly-forecast-scroll-hint">
        <span aria-hidden="true">↔</span>
        {message(locale, "plannerForecastScrollHint")}
        {refreshStatus && (
          <span className="planner-hourly-forecast-updated" role="status">
            {refreshStatus}
          </span>
        )}
      </p>
    </section>
  );
}
