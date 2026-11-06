// Each target of tonight's plans over its slot, the planner's card of the target for the plan's
// night (its heights, ten minutes apart, which the row's filigree and the
// sheet's curve draw) and **its score for its slot in the plan**, from
// `targetTonightScore` with the slot as the night and as the target's window,
// and the inputs "À voir ce soir" scores with. Never throws: a plan the planner
// cannot place gives no night, and its rows and dialog show what the item
// carries.
import { Body, Illumination } from "astronomy-engine";
import { normalizePlanDarkness } from "portal/planner/state.js";
import {
  fieldOfView,
  planNight,
  planNightSpanSky,
  resolveEquipment,
} from "./planner.js";
import { withHorizonMask } from "./recommendations.js";
import { targetNightPath } from "./target-path.js";
import { targetTonightScore } from "./target-score.js";
import { tonightPlanCard } from "./tonight-overview.js";
import { visualInventoryOf } from "./visual-pairs.js";
import { normalizeWindTolerance } from "./wind.js";

const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** The height of `series` at `instant` (ms), between its two nearest samples. */
export function planTargetAltitudeAt(series, instant) {
  let previous = null;
  for (const point of series || []) {
    const time = Date.parse(point?.time);
    const altitude = point?.altitude;
    if (!Number.isFinite(time) || !finite(altitude)) continue;
    if (time === instant) return altitude;
    if (time > instant) {
      if (!previous) return null;
      const span = time - previous.time;
      if (span <= 0) return altitude;
      return (
        previous.altitude +
        ((altitude - previous.altitude) * (instant - previous.time)) / span
      );
    }
    previous = { time, altitude };
  }
  return null;
}

/** The highest height of `series` between `start` and `end` (ms), both included. */
export function planTargetMaxAltitude(series, start, end) {
  let best = null;
  const consider = (value) => {
    if (finite(value) && (best === null || value > best)) best = value;
  };
  consider(planTargetAltitudeAt(series, start));
  consider(planTargetAltitudeAt(series, end));
  for (const point of series || []) {
    const time = Date.parse(point?.time);
    if (!Number.isFinite(time) || time < start || time > end) continue;
    consider(point?.altitude);
  }
  return best;
}

/** How the target moves over its slot: `rising`, `culminating` or `setting`. */
export function planTargetTrend(night) {
  const start = night?.startAltitude;
  const end = night?.endAltitude;
  const max = night?.maxAltitude;
  if (!finite(start) || !finite(end)) return null;
  if (finite(max) && max > Math.max(start, end)) return "culminating";
  return end >= start ? "rising" : "setting";
}

const round = (value) => (finite(value) ? Math.round(value) : null);

/**
 * The night of each slotted target of `plan` (a stored plan with its `items`,
 * `date`, `location`…), keyed by the item's index. `place` is the page's,
 * used when the plan has none; `profileSets` resolve the plan's equipment.
 */
export function scorePlanTargets({
  plan,
  place = null,
  date,
  darkness = "astronomical",
  profileSets = null,
  hourly = [],
  skyQuality = null,
  // The sky the visual limit reads (`{ sqm, bortleClass }`); null keeps the
  // dark-sky one, as before.
  visualSkyQuality = null,
  skyDirection = null,
  ownedFilters = [],
  locale = "en",
}) {
  try {
    const location = plan?.location ?? place;
    if (
      !location ||
      !Number.isFinite(Number(location.latitude)) ||
      !Number.isFinite(Number(location.longitude))
    )
      return {};
    const card = tonightPlanCard(plan, location);
    const items = card.items.filter((item) => item.start);
    if (!items.length) return {};
    const night = String(plan?.date ?? date);
    const threshold = normalizePlanDarkness(plan?.darkness) || darkness;
    const sky = planNightSpanSky(
      { date: night, darkness: threshold },
      location,
    );
    if (!sky) return {};
    const minAltitude = finite(plan?.minAltitude)
      ? Math.round(plan.minAltitude)
      : 30;
    const moonSeparationMinimum = finite(plan?.moonSeparationMinimum)
      ? Math.round(plan.moonSeparationMinimum)
      : 25;
    const profile = resolveEquipment(plan?.equipment || {}, profileSets);
    const planned = planNight({
      date: night,
      location,
      targets: items.map((item) => ({
        ...item.target,
        id: item.key,
        plannerSource: null,
      })),
      profile,
      locale,
      minAltitude,
      moonSeparationMinimum,
      planetReferences: { planets: [] },
      darkness: threshold,
      skyQuality: visualSkyQuality,
      // The eyepieces and filters of « Mon matériel » judge a visual card
      // before the generic ones (VISUAL-SIM-02a); none without profile sets.
      visualInventory: profileSets ? visualInventoryOf(profileSets) : null,
    });
    if (!planned) return {};
    const mask = location.horizonMask;
    const mountSafety = plan?.mountSafety;
    const cards = new Map(
      withHorizonMask(
        planned.cards,
        mask,
        minAltitude,
        moonSeparationMinimum,
        mountSafety,
      ).map((entry) => [entry?.target?.id, entry]),
    );
    const moonIllumination = Math.round(
      Illumination(Body.Moon, new Date(sky.darkStart)).phase_fraction * 100,
    );
    const equipment = {
      field: fieldOfView(profile),
      mode: profile?.mode,
      filters: profile?.filters,
    };
    const windTolerance = normalizeWindTolerance(
      plan?.equipment?.windTolerance,
    );
    const nights = {};
    for (const item of items) {
      const planner = cards.get(item.key);
      if (!planner) continue;
      // The slot is the target's window: the forecast, the sky and the wind
      // are read over it, and the height and the mask over it as the night.
      const slotted = {
        ...planner,
        target: item.target,
        visibilityWindows: [{ start: item.start, end: item.end }],
        usableStart: item.start,
        usableEnd: item.end,
      };
      let score = null;
      try {
        score = targetTonightScore({
          card: slotted,
          window: {
            start: item.start,
            end: item.end,
            darkStart: sky.darkStart,
            darkEnd: sky.darkEnd,
            moonIllumination,
          },
          // The useful window is the target's night's, not its slot's.
          usableNight: {
            start: sky.start,
            end: sky.end,
            windows: planner.visibilityWindows || [],
          },
          hourly,
          moonSeries: sky.moonSeries,
          skyQuality,
          skyDirection,
          maskPath: targetNightPath({
            series: planner.series || [],
            mask,
            minAltitude,
            moonSeparationMinimum:
              planner.constraints?.moonSeparationMinimum ?? 0,
            mountSafety,
          }),
          equipment,
          ownedFilters,
          windTolerance,
          minAltitude,
        });
      } catch {
        score = null;
      }
      const start = Date.parse(item.start);
      const end = Date.parse(item.end);
      nights[item.index] = {
        card: slotted,
        score,
        startAltitude: round(planTargetAltitudeAt(planner.series, start)),
        endAltitude: round(planTargetAltitudeAt(planner.series, end)),
        maxAltitude: round(planTargetMaxAltitude(planner.series, start, end)),
      };
    }
    return nights;
  } catch {
    return {};
  }
}
