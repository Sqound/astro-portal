"use client";

import { useEffect, useMemo, useState } from "react";
import { message } from "portal/i18n.js";
import { BrandLoader } from "portal/components/BrandLoader.js";
import {
  factsCharacteristics,
  factsIsSolarSystem,
  factsNight,
  factsPlanet,
  factsSeason,
} from "../target-facts-model.js";
import { SeasonCard } from "./SeasonCard.js";
import {
  TargetPathContent,
  TargetPathIcon,
  TargetPathSummary,
} from "./TargetPathSummary.js";
import { targetPathSummaryState } from "../target-path-summary.js";

// The blocks the dialog "Statistiques de la cible" adds to the note: "Cette
// nuit" (the curve of the target's night at full strength), "Saison" (the
// shared card, without "Nuits à venir") and "Caractéristiques". Free, computed
// in the browser (offline included); the figures come from
// `target-facts-model.js`.

/** The place a block needs and the person has not saved. */
function NoPlace({ locale, onAddPlace, textKey = "targetFactsNoPlace" }) {
  return (
    <>
      <p className="planner-target-facts-muted" data-testid="facts-no-place">
        {message(locale, textKey)}
      </p>
      {onAddPlace && textKey === "targetFactsNoPlace" ? (
        <button
          type="button"
          className="btn-tertiary planner-target-facts-add-place"
          onClick={onAddPlace}
        >
          {message(locale, "targetFactsAddPlace")}
        </button>
      ) : null}
    </>
  );
}

/** The curve: axes, window band, dashed minimum, red under it, violet behind the mask. */
export function TargetNightChart({ locale, night }) {
  const chart = night.chart;
  return (
    <svg
      className="planner-target-facts-chart"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      role="img"
      aria-label={night.label}
      data-testid="facts-night-chart"
    >
      {chart.band ? (
        <rect
          className="planner-target-facts-band"
          x={chart.band.x}
          y={chart.top}
          width={chart.band.width}
          height={chart.baseline - chart.top}
        />
      ) : null}
      {chart.grid.map((line) => (
        <g key={line.altitude}>
          <line
            className="planner-target-facts-grid"
            x1={chart.left}
            x2={chart.right}
            y1={line.y}
            y2={line.y}
          />
          <text className="planner-target-facts-axis" x="0" y={line.y + 3}>
            {line.label}
          </text>
        </g>
      ))}
      <line
        className="planner-target-facts-minimum"
        x1={chart.left}
        x2={chart.right}
        y1={chart.minimumY}
        y2={chart.minimumY}
      />
      <path className="planner-target-facts-area" d={chart.area} />
      {chart.runs.map((run, index) => (
        <path
          key={index}
          className={`planner-target-facts-curve is-${run.state}`}
          d={run.d}
        />
      ))}
      {chart.ticks.map((tick) => (
        <text
          key={tick.x}
          className="planner-target-facts-axis is-hour"
          x={tick.x}
          y={chart.height - 5}
          textAnchor="middle"
        >
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

/**
 * "Déplacement de la cible" under the curve: the polar map of the target's
 * night over the place's horizon mask, its legend and the lines the night gives
 * (the culmination is written above the curve, once). The glyph stands in the
 * corner where the icon of "Saison" stands and opens the enlarged view. No
 * camera view on the web.
 */
function TargetPathCard({ locale, night }) {
  const [enlarged, setEnlarged] = useState(false);
  if (!night.path || targetPathSummaryState(night.path) === "never-up")
    return null;
  const title = message(locale, "targetPathOpen");
  return (
    <div
      className="planner-target-facts-panel planner-target-path-card"
      data-testid="facts-path"
    >
      <div className="multi-night-season-head">
        <h4>{title}</h4>
        <button
          type="button"
          className="multi-night-season-toggle planner-target-path-enlarge"
          aria-label={title}
          title={title}
          data-testid="facts-path-enlarge"
          onClick={() => setEnlarged(true)}
        >
          <TargetPathIcon />
        </button>
      </div>
      <TargetPathContent
        path={night.path}
        mask={night.pathMask}
        moon={night.moon}
        minAltitude={night.minAltitude}
        designation={night.designation}
        locale={locale}
        timeZone={night.timeZone}
        culminationRow={false}
      />
      {enlarged && (
        <TargetPathSummary
          path={night.path}
          mask={night.pathMask}
          moon={night.moon}
          minAltitude={night.minAltitude}
          title={night.designation}
          locale={locale}
          timeZone={night.timeZone}
          onClose={() => setEnlarged(false)}
        />
      )}
    </div>
  );
}

/** "Cette nuit": the best window, the culmination, the curve and its legend. */
export function TargetNightBlock({ locale, night, onAddPlace }) {
  // A body without a fixed coordinate (the catalogue's Solar System) has no
  // night to draw here: no block, no empty title.
  if (night.state === "unknown") return null;
  const title = message(locale, "targetFactsNight");
  return (
    <section
      className="planner-target-facts-section"
      aria-labelledby="target-facts-night"
      data-testid="facts-night"
    >
      <h3 id="target-facts-night">{title}</h3>
      <div className="planner-target-facts-panel">
        {night.state === "no-place" ? (
          <NoPlace locale={locale} onAddPlace={onAddPlace} />
        ) : (
          <>
            {night.window ? (
              <p className="planner-target-facts-lead">{night.window}</p>
            ) : null}
            <p className="planner-target-facts-muted">{night.culminates}</p>
            {night.noWindow ? (
              <p
                className="planner-target-facts-lead"
                data-testid="facts-no-window"
              >
                {night.noWindow}
              </p>
            ) : (
              <>
                <TargetNightChart locale={locale} night={night} />
                <p className="planner-target-facts-legend">
                  <span className="is-above">
                    {message(locale, "targetFactsLegendHeight")}
                  </span>
                  <span className="is-minimum">
                    {message(locale, "targetFactsLegendMinimum").replace(
                      "{altitude}",
                      String(night.minAltitude),
                    )}
                  </span>
                  <span className="is-below-minimum">
                    {message(locale, "targetFactsLegendBelow").replace(
                      "{altitude}",
                      String(night.minAltitude),
                    )}
                  </span>
                  <span className="is-masked">
                    {message(locale, "targetFactsLegendMasked")}
                  </span>
                </p>
              </>
            )}
            <p className="planner-target-facts-muted">
              {message(locale, "multiNightComputedHere").replace(
                "{rules}",
                night.rules,
              )}
            </p>
          </>
        )}
      </div>
      {night.state === "ready" && (
        <TargetPathCard locale={locale} night={night} />
      )}
    </section>
  );
}

/**
 * The season of a target worked out in the browser: a first state while it
 * is computed (the work runs after the dialog's first paint), then the
 * result of `factsSeason`.
 */
export function useTargetSeason({ card, context, locale }) {
  const key = JSON.stringify([
    card?.target?.id,
    card?.target?.coordinate,
    card?.best?.equatorial,
    context?.place,
    context?.date,
    context?.constraints,
    context?.darkness,
    locale,
  ]);
  // The Sun or the Moon, or no place: nothing to work out, the answer is at once.
  const cheap =
    (factsIsSolarSystem(card) && !factsPlanet(card)) ||
    !Number.isFinite(Number(context?.place?.latitude)) ||
    !Number.isFinite(Number(context?.place?.longitude));
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    if (cheap) return undefined;
    setState({ status: "loading" });
    const timer = setTimeout(() => {
      let next;
      try {
        next = factsSeason({ card, context, locale });
      } catch {
        next = { status: "unknown" };
      }
      setState(next);
    }, 0);
    return () => clearTimeout(timer);
    // `key` stands for the card and the context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cheap]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quick = useMemo(
    () => (cheap ? factsSeason({ card, context, locale }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, cheap],
  );
  return quick || state;
}

/** "Saison": the shared card (without "Nuits à venir"), or what stands in its place. */
export function TargetSeasonBlock({ locale, season, onAddPlace }) {
  if (season.status === "ready" || season.status === "unknown")
    return (
      <SeasonCard
        locale={locale}
        season={season.status === "ready" ? season.season : null}
        rules={season.rules || ""}
        endCause={season.endCause || null}
        yearArgs={season.status === "ready" ? season.yearArgs : null}
        headingId="target-facts-season"
      />
    );
  return (
    <section
      className="multi-night-section"
      aria-labelledby="target-facts-season"
      data-testid="facts-season"
    >
      <div className="multi-night-section-heading">
        <h3 id="target-facts-season">{message(locale, "multiNightSeason")}</h3>
      </div>
      <div className="multi-night-panel">
        {season.status === "loading" ? (
          <p
            className="planner-target-facts-loading"
            role="status"
            data-testid="facts-season-loading"
          >
            <BrandLoader size={24} />
          </p>
        ) : season.status === "solar" ? (
          <p className="planner-target-facts-muted">
            {message(locale, "targetFactsSeasonSolar")}
          </p>
        ) : (
          <NoPlace
            locale={locale}
            onAddPlace={onAddPlace}
            textKey="targetFactsNeedPlace"
          />
        )}
      </div>
    </section>
  );
}

/** "Caractéristiques": one tile per known datum, two columns; nothing when none is known. */
export function TargetCharacteristicsBlock({ locale, card }) {
  const tiles = useMemo(
    () => factsCharacteristics(card, locale),
    [card, locale],
  );
  if (!tiles.length) return null;
  return (
    <section
      className="planner-target-facts-section"
      aria-labelledby="target-facts-facts"
      data-testid="facts-characteristics"
    >
      <h3 id="target-facts-facts">{message(locale, "targetFactsFacts")}</h3>
      <dl className="planner-target-facts-tiles">
        {tiles.map((tile) => (
          <div key={tile.key} data-fact={tile.key}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
            {tile.note ? <small>{tile.note}</small> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** What the night block shows for a card in a context: `factsNight`, memoised. */
export function useTargetNight({ card, context, locale }) {
  return useMemo(
    () => factsNight({ card, context, locale }),
    // The card and the context are rebuilt by the callers at every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      card?.target?.id,
      card?.target?.coordinate,
      card?.best?.equatorial,
      JSON.stringify(context),
      locale,
    ],
  );
}
