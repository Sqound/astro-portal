import { formatDeclination, formatRightAscension } from "portal/format.js";
import { message } from "portal/i18n.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import { zoneOffsetMinutes } from "./horizon-path-mode.js";
import { projectDateAfter } from "./project-night.js";
import { seasonEndCause, seasonRulesLine } from "./season-card-model.js";
import { targetSeason } from "./season-window.js";
import { planetIdOf } from "./solar-system-position.js";
import { targetDistanceOf } from "./target-distance.js";
import {
  targetIsSolarSystem,
  targetNightFactsAndSamples,
} from "./target-night-facts.js";
import { targetNightMoon } from "./target-night-moon.js";
import { targetNightPath } from "./target-path.js";
import { clock, fill } from "./wind-section.js";

// What the dialog "Statistiques de la cible" adds to the note: the target's
// night ("Cette nuit"), its season ("Saison") and its characteristics, from
// the pure functions of the core (`targetNightFacts`, `targetSeason`) and
// the card of the target. Free: no capability is read. Kept apart from the
// components so it is tested without rendering.

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** A body of the Solar System: no season, no constellation, no distance. */
export function factsIsSolarSystem(card) {
  const target = card?.target || {};
  return (
    targetIsSolarSystem(target) ||
    Boolean(target.tags?.includes?.("planet")) ||
    target.skyTarget?.typeKey === "Planète"
  );
}

/**
 * The target as the core reads it, `{ id, coordinate: { ra, dec } (degrees,
 * J2000), solarSystem }`, or `null` without a coordinate. A planet carries
 * the coordinate of the night the planner worked out (`best.equatorial`, in
 * hours), as `targetNightFacts` asks.
 */
export function factsTarget(card) {
  const target = card?.target || {};
  const solarSystem = factsIsSolarSystem(card);
  let ra = finite(target.coordinate?.ra);
  let dec = finite(target.coordinate?.dec);
  if (ra === null || dec === null) {
    const equatorial = card?.best?.equatorial;
    ra = finite(equatorial?.ra) === null ? null : finite(equatorial.ra) * 15;
    dec = finite(equatorial?.dec);
  }
  if (ra === null || dec === null) return null;
  return {
    id: target.id ?? null,
    coordinate: { ra, dec },
    ...(solarSystem ? { solarSystem: true } : {}),
  };
}

function decimal(value, locale, digits) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}

/** The branch of an ICU `{scale, select, million{…} other{…}}` for `scale`. */
export function factsSelect(template, scale) {
  const body = String(template).slice(String(template).indexOf("select,") + 7);
  const branches = [...body.matchAll(/(\w+)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
  const chosen =
    branches.find(([, name]) => name === scale) ||
    branches.find(([, name]) => name === "other");
  return chosen ? chosen[2] : "";
}

/**
 * "≈ 2,5 millions d’années-lumière" / "1 344 années-lumière": the
 * distance as the tile writes it; the `≈` only for the `redshift` layer (a
 * model, whose provenance line says "estimation").
 */
export function factsDistanceText(distance, locale) {
  if (!distance) return "";
  const million = distance.lightYears >= 1000000;
  const value = million
    ? decimal(
        distance.lightYears / 1000000,
        locale,
        distance.lightYears < 10000000 ? 1 : 0,
      )
    : decimal(distance.lightYears, locale, 0);
  const text = fill(
    factsSelect(
      message(locale, "targetFactsDistanceLy"),
      million ? "million" : "other",
    ),
    { value },
  );
  return distance.isEstimate ? `≈ ${text}` : text;
}

const distanceNoteKeys = Object.freeze({
  published: "targetFactsDistancePublished",
  parallax: "targetFactsDistanceParallax",
  redshift: "targetFactsDistanceEstimate",
});

/**
 * An apparent size written as the catalogue writes it, always in minutes of arc
 * (arcminutes are the usual unit for apparent sizes): "180 × 60′", "8,5 × 3′",
 * "1,4′" — one decimal below 10′, none above (the major axis decides for both),
 * `""` without a size. The very form of the catalogue's `apparentSizeLabel`
 * (`dimensionLabel` of the target library), so the tile reads like the card.
 */
export function targetArcminLabel(sizeArcmin, locale) {
  if (!Array.isArray(sizeArcmin)) return "";
  const [major, minor] = sizeArcmin.map(Number);
  if (!(major > 0) || !Number.isFinite(major)) return "";
  const decimal = new Intl.NumberFormat(locale, {
    maximumFractionDigits: major < 10 ? 1 : 0,
  });
  return Number.isFinite(minor) && Math.abs(major - minor) > 0.05
    ? `${decimal.format(major)} × ${decimal.format(minor)}′`
    : `${decimal.format(major)}′`;
}

/**
 * The tiles of "Caractéristiques", in order: constellation, magnitude,
 * apparent size (the major axis by the minor axis, in minutes of arc, never a
 * real size) and
 * distance — **one tile per known datum**, none for an unknown one. A planet
 * has neither constellation nor distance. `[{ key, label, value, note? }]`.
 */
export function factsCharacteristics(card, locale) {
  const target = card?.target || {};
  const knowledge = target.knowledge || {};
  const solar = factsIsSolarSystem(card);
  const tiles = [];
  const constellation =
    target.skyTarget?.constellation ||
    knowledge.constellation ||
    target.constellation ||
    "";
  if (!solar && constellation)
    tiles.push({
      key: "constellation",
      label: message(locale, "targetFactsConstellation"),
      value: String(constellation),
    });
  const magnitude = finite(
    target.integratedMagnitude ?? knowledge.magnitude ?? target.magnitude,
  );
  if (magnitude !== null)
    tiles.push({
      key: "magnitude",
      label: message(locale, "plannerCatalogueMagnitude"),
      value: decimal(magnitude, locale, 1),
    });
  const arcmin = Array.isArray(target.apparentSizeArcmin)
    ? target.apparentSizeArcmin
    : Array.isArray(card?.framing?.size)
      ? card.framing.size
      : null;
  // The catalogue's own writing when the card carries it, else the same
  // writing worked out from the size in minutes of arc.
  const sizeLabel =
    knowledge.apparentSizeLabel ||
    target.apparentSizeLabel ||
    (arcmin ? targetArcminLabel(arcmin, locale) : "");
  if (sizeLabel)
    tiles.push({
      key: "size",
      label: message(locale, "targetFactsApparentSize"),
      value: sizeLabel,
    });
  const distance = solar
    ? null
    : targetDistanceOf(target) || targetDistanceOf(knowledge);
  if (distance)
    tiles.push({
      key: "distance",
      label: message(locale, "targetFactsDistance"),
      value: factsDistanceText(distance, locale),
      note: message(locale, distanceNoteKeys[distance.source]),
    });
  return tiles;
}

/**
 * "hauteur d’au moins 30°, masque d’horizon": the rules the night was
 * judged by, after "Calculé sur cet appareil :" — the minimum height and,
 * when the place has one, its horizon mask (the Moon's limit is the
 * season's).
 */
export function factsNightRules(locale, { place, constraints }) {
  const altitude = Math.round(finite(constraints?.minAltitude) ?? 30);
  const parts = [fill(message(locale, "multiNightRuleAltitude"), { altitude })];
  if (normaliseHorizonMask(place?.horizonMask).enabled)
    parts.push(message(locale, "multiNightRuleMask"));
  return parts.join(message(locale, "multiNightRuleSeparator"));
}

const CHART = Object.freeze({
  width: 340,
  height: 132,
  left: 28,
  right: 6,
  top: 8,
  bottom: 20,
});

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * The drawing of the night's curve, in a 340 × 132 box: the grid at 30°, 60°
 * and 90°, the dashed minimum height, the window's band, the curve in runs of
 * one state each (`above`, `below-minimum`, `masked`), the area under it and
 * the hour marks (whole hours of the place's clock, every `step` hours).
 */
export function factsNightChart(facts, { minAltitude, timeZone, locale }) {
  const { width, height, left, right, top, bottom } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const from = Date.parse(facts.night.from);
  const to = Date.parse(facts.night.to);
  const span = Math.max(MINUTE_MS, to - from);
  const x = (time) =>
    round(left + ((Date.parse(time) - from) / span) * plotWidth);
  const y = (altitude) =>
    round(
      top +
        plotHeight -
        (Math.max(0, Math.min(90, altitude)) / 90) * plotHeight,
    );
  const runs = [];
  for (const point of facts.series) {
    const here = [x(point.time), y(point.altitude)];
    const last = runs.at(-1);
    if (last && last.state === point.state) last.points.push(here);
    else
      // A run starts where the previous one ended: the curve is one line.
      runs.push({
        state: point.state,
        points: last ? [last.points.at(-1), here] : [here],
      });
  }
  const path = (points) =>
    points
      .map(([px, py], index) => `${index ? "L" : "M"}${px} ${py}`)
      .join(" ");
  const all = facts.series.map((point) => [x(point.time), y(point.altitude)]);
  const baseline = round(top + plotHeight);
  const step = Math.max(1, Math.ceil(span / HOUR_MS / 6));
  const offset = zoneOffsetMinutes(from, timeZone) * MINUTE_MS;
  const ticks = [];
  for (
    let local = Math.ceil((from + offset) / (step * HOUR_MS)) * step * HOUR_MS;
    local - offset <= to;
    local += step * HOUR_MS
  ) {
    const instant = new Date(local - offset).toISOString();
    ticks.push({ x: x(instant), label: clock(instant, locale, timeZone) });
  }
  return {
    width,
    height,
    left,
    right: width - right,
    baseline,
    grid: [30, 60, 90].map((altitude) => ({
      altitude,
      y: y(altitude),
      label: `${altitude}°`,
    })),
    minimumY: y(minAltitude),
    band: facts.bestWindow
      ? {
          x: x(facts.bestWindow.from),
          width: round(x(facts.bestWindow.to) - x(facts.bestWindow.from)),
        }
      : null,
    runs: runs
      .filter((run) => run.points.length > 1)
      .map((run) => ({ state: run.state, d: path(run.points) })),
    area: all.length
      ? `${path(all)} L${all.at(-1)[0]} ${baseline} L${all[0][0]} ${baseline} Z`
      : "",
    ticks,
    top,
  };
}

const placed = (place) =>
  finite(place?.latitude) !== null && finite(place?.longitude) !== null;

/**
 * "Cette nuit" of the dialog. `context` is `{ place, date, constraints,
 * darkness }` (the place with its horizon mask and its time zone, the night's
 * evening date); `card` the target's card. `state`: `no-place` (no place to
 * judge the night by), `unknown` (no coordinate, or the night cannot be
 * worked out), `ready` with the words and, unless the target never clears the
 * threshold (`noWindow`: the sentence), the drawing.
 */
export function factsNight({ card, context, locale }) {
  const target = factsTarget(card);
  const place = context?.place;
  if (!placed(place)) return { state: "no-place" };
  const minAltitude = Math.round(
    finite(context?.constraints?.minAltitude) ?? 30,
  );
  const night = target
    ? targetNightFactsAndSamples({
        target,
        place,
        date: context?.date,
        constraints: { ...context?.constraints, minAltitude },
        darkness: context?.darkness,
      })
    : null;
  const facts = night?.facts ?? null;
  if (!facts) return { state: "unknown" };
  const timeZone = place.timeZone;
  const name = card?.target?.designation || card?.target?.title || "";
  const path = targetNightPath({
    series: night.samples,
    mask: place.horizonMask,
    minAltitude,
    moonSeparationMinimum: context?.constraints?.moonSeparationMinimum ?? 25,
    // The hour marks of the polar map fall on the place's own full hours.
    tickOffsetMinutes: zoneOffsetMinutes(night.samples[0]?.time, timeZone),
  });
  // One culmination everywhere, the path's (the highest sample refined by a
  // parabola), written above the curve as on the polar map.
  const top = path.culmination ?? facts.culmination;
  const base = {
    state: "ready",
    facts,
    window: facts.bestWindow
      ? fill(message(locale, "tonightBestWindow"), {
          start: clock(facts.bestWindow.from, locale, timeZone),
          end: clock(facts.bestWindow.to, locale, timeZone),
        })
      : null,
    culminates: fill(message(locale, "targetFactsCulminates"), {
      altitude: Math.round(top.altitude),
      time: clock(top.time, locale, timeZone),
    }),
    rules: factsNightRules(locale, { place, constraints: { minAltitude } }),
    minAltitude,
    // The same night over the place's horizon mask, from the
    // samples the curve comes from (`TargetPathCard`).
    pathMask: place.horizonMask ?? null,
    path,
    // The Moon over the night (its track above the horizon, the two extreme
    // separations).
    moon: targetNightMoon({ series: night.samples, track: night.moon }),
    timeZone,
    designation: card?.target?.designation || card?.target?.title || "",
  };
  if (facts.noWindow)
    return {
      ...base,
      noWindow: fill(
        message(
          locale,
          facts.noWindow === "masked"
            ? "targetPathNoWindowMasked"
            : "targetPathNoWindowBelowMinimum",
        ),
        { altitude: minAltitude },
      ),
    };
  return {
    ...base,
    noWindow: null,
    chart: factsNightChart(facts, { minAltitude, timeZone, locale }),
    label: fill(message(locale, "targetFactsNightChart"), {
      target: name,
      from: clock(facts.night.from, locale, timeZone),
      to: clock(facts.night.to, locale, timeZone),
    }),
  };
}

/**
 * The planet a card stands for, as the season reads it (`{ id: "solar-system-
 * jupiter" }`), or `null` for a fixed target, the Sun, the Moon and the Earth
 * (the card's id, or the astronomy-engine `body` a planner card carries).
 */
export function factsPlanet(card) {
  const target = card?.target || {};
  const id = planetIdOf(target);
  return id ? { id } : null;
}

/**
 * "Saison" of the dialog, computed by `targetSeason` from the night's
 * evening date: `{ status: "solar" }` for the Sun and the Moon (a planet has
 * its own season), `no-place`, `unknown` (no coordinate), else `{ status:
 * "ready", season, rules, endCause, yearArgs }` — the rules line, the reason
 * the season ends, as the card of a multi-night plan writes them, and what
 * the card's year view is worked out from.
 */
export function factsSeason({ card, context, locale }) {
  const planet = factsPlanet(card);
  if (factsIsSolarSystem(card) && !planet) return { status: "solar" };
  const place = context?.place;
  if (!placed(place)) return { status: "no-place" };
  const target = planet || factsTarget(card);
  const constraints = {
    minAltitude: Math.round(finite(context?.constraints?.minAltitude) ?? 30),
  };
  const season = target
    ? targetSeason({
        target,
        place,
        constraints,
        darkness: context?.darkness,
        from: context?.date,
      })
    : null;
  if (!season) return { status: "unknown" };
  return {
    status: "ready",
    season,
    rules: seasonRulesLine(locale, { constraints, place, target }),
    endCause:
      season.state === "ends" && season.workableUntil
        ? seasonEndCause({
            place,
            target,
            constraints,
            dayAfter: projectDateAfter(season.workableUntil, 1),
          })
        : null,
    yearArgs: {
      target,
      place,
      constraints,
      darkness: context?.darkness,
      from: context?.date,
    },
  };
}

/**
 * "1 objet dans le catalogue local" / "12 objets…": the count of the
 * catalogue's list, the noun agreeing with it in each language
 * (`Intl.PluralRules`: one, and the Russian few).
 */
export function catalogueCountLine(locale, total) {
  const count = Number(total) || 0;
  const category = new Intl.PluralRules(locale).select(count);
  const key =
    category === "one"
      ? "plannerTargetCatalogueObjectsOne"
      : category === "few"
        ? "plannerTargetCatalogueObjectsFew"
        : "plannerTargetCatalogueObjects";
  return `${new Intl.NumberFormat(locale).format(count)} ${message(locale, key)}`;
}

/**
 * The position line of a catalogue card, "0h 42m 44s · +41° 16′ 09″": the full
 * view of `GET /api/target-library` gives the right ascension in hours,
 * `formatRightAscension` reads degrees. `null` for a target without a position.
 */
export function catalogueCoordinateLine(target) {
  const ra = finite(target?.coordinate?.ra);
  const dec = finite(target?.coordinate?.dec);
  return ra === null || dec === null
    ? null
    : `${formatRightAscension(ra * 15)} · ${formatDeclination(dec)}`;
}

/**
 * The card of a catalogue target (the full view of `GET /api/target-library`,
 * the right ascension in hours) as the dialog reads a planner card: the
 * coordinate in degrees, the type and the constellation under `skyTarget`,
 * the magnitude as the planner names it.
 */
export function catalogueFactsCard(target) {
  const ra = finite(target?.coordinate?.ra);
  const dec = finite(target?.coordinate?.dec);
  return {
    target: {
      ...target,
      coordinate:
        ra === null || dec === null ? undefined : { ra: ra * 15, dec },
      coordinateUnit: "degrees",
      skyTarget: {
        type: target?.type || "",
        constellation: target?.constellation || "",
        typeKey: target?.typeKey,
      },
      integratedMagnitude: target?.magnitude,
    },
  };
}
