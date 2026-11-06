import {
  moonUpIntervals,
  projectDateAfter,
  projectNight,
  validProjectDate,
} from "../project-night.js";

/** The longest calendar a call computes. */
export const multiNightCalendarMaximumNights = 120;

/**
 * The coming nights of the multi-night plans followed at one place
 * ("Nuits à venir"), computed on the device and offline: one line per
 * night with its dark duration, the Moon's illumination and the time it is
 * up, and each plan's usable windows that night.
 *
 * Arguments: `projects` (`[{ id, target: { coordinate: { ra, dec } },
 * constraints, filters }]`, each a multi-night plan with its target's
 * coordinate resolved by the caller), `place` (the shared place, its
 * `horizonMask` included), `darkness`, `from` (`YYYY-MM-DD`), `nights` (14).
 *
 * Returns `null` without a usable place or date, else `{ nights: [{ date,
 * start, end, darkMinutes, moonIllumination, moonUp: [{ start, end }],
 * projects: [{ projectId, usableMinutes, windows: [{ start, end }], peak,
 * reason }] }] }` — instants rounded to the minute, `peak` when the target
 * is highest that night (what the assisted allocation centres a share on),
 * `reason` (`moon`, `horizon`, `altitude`) only when the plan has no window
 * that night.
 */
export function multiNightCalendar({
  projects = [],
  place,
  darkness,
  from,
  nights = 14,
} = {}) {
  const count = typeof nights === "number" ? Math.trunc(nights) : NaN;
  if (
    !validProjectDate(from) ||
    !Number.isFinite(count) ||
    count < 1 ||
    count > multiNightCalendarMaximumNights
  )
    return null;
  const plans = (Array.isArray(projects) ? projects : [])
    .filter((project) => typeof project?.id === "string" && project.id)
    .map((project) => ({
      key: project.id,
      target: project.target,
      constraints: project.constraints,
      filters: project.filters,
    }));
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const date = projectDateAfter(from, index);
    const night = projectNight({ date, place, darkness, plans });
    if (!night) return null;
    result.push({
      date,
      start: night.start,
      end: night.end,
      darkMinutes: night.darkMinutes,
      moonIllumination: night.moonIllumination,
      moonUp: moonUpIntervals(night.moonSeries),
      projects: night.plans.map((plan) => ({
        projectId: plan.key,
        usableMinutes: plan.usableMinutes,
        windows: plan.windows,
        peak: plan.peak,
        reason: plan.reason,
      })),
    });
  }
  return { nights: result };
}
