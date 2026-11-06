function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normaliseMountSafety(value = {}) {
  const zenithAvoidanceDegrees = clamp(
    Number(value?.zenithAvoidanceDegrees) || 0,
    0,
    30,
  );
  const azimuthStart =
    value?.azimuthStart === "" || value?.azimuthStart === null
      ? null
      : Number(value?.azimuthStart);
  const azimuthEnd =
    value?.azimuthEnd === "" || value?.azimuthEnd === null
      ? null
      : Number(value?.azimuthEnd);
  const hasCableSector =
    Number.isFinite(azimuthStart) && Number.isFinite(azimuthEnd);
  return {
    enabled: Boolean(value?.enabled),
    zenithAvoidanceDegrees,
    azimuthStart: hasCableSector ? clamp(azimuthStart, 0, 359) : "",
    azimuthEnd: hasCableSector ? clamp(azimuthEnd, 0, 359) : "",
    // MERIDIAN-LIMIT-02a: the cut at the meridian is on unless the plan says
    // otherwise; the plan's own N ("" = the mount's value, 0..120).
    meridianCut: value?.meridianCut !== false,
    meridianLimitMinutes:
      normaliseMeridianLimit(value?.meridianLimitMinutes) ?? "",
  };
}

// The minutes a mount can keep tracking past the meridian: a whole number of
// minutes in 0..120, or null when nothing was entered (an empty field is not
// a zero: 0 means "flips at the meridian itself").
export function normaliseMeridianLimit(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), 0, 120) : null;
}

export function plannerAdvancedConstraintsActive({
  mountSafety,
  activeFilterNames = [],
  moonSeparationMinimumByFilter = {},
} = {}) {
  const safety = normaliseMountSafety(mountSafety);
  const mountSafetyActive =
    safety.enabled &&
    (safety.zenithAvoidanceDegrees > 0 ||
      (safety.azimuthStart !== "" && safety.azimuthEnd !== ""));
  const filterThresholdActive = Boolean(
    plannerFilterThresholdRange({
      activeFilterNames,
      moonSeparationMinimumByFilter,
    }),
  );
  return mountSafetyActive || filterThresholdActive;
}

export function plannerFilterThresholdRange({
  activeFilterNames = [],
  moonSeparationMinimumByFilter = {},
} = {}) {
  const values = activeFilterNames.flatMap((name) => {
    const value = moonSeparationMinimumByFilter?.[name];
    return value !== "" && value !== null && Number.isFinite(Number(value))
      ? [Number(value)]
      : [];
  });
  if (!values.length) return null;
  return {
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

export function azimuthIsInRange(azimuth, start, end) {
  if (
    start === "" ||
    end === "" ||
    !Number.isFinite(Number(start)) ||
    !Number.isFinite(Number(end))
  )
    return false;
  const normalized = ((Number(azimuth) % 360) + 360) % 360;
  return start <= end
    ? normalized >= start && normalized <= end
    : normalized >= start || normalized <= end;
}

export function zenithLimitAltitude(value) {
  const safety = normaliseMountSafety(value);
  return safety.enabled && safety.zenithAvoidanceDegrees > 0
    ? 90 - safety.zenithAvoidanceDegrees
    : null;
}

export function mountSafetyReason(value, point) {
  const safety = normaliseMountSafety(value);
  if (!safety.enabled) return null;
  const zenithAltitude = zenithLimitAltitude(safety);
  if (zenithAltitude !== null && point.altitude >= zenithAltitude)
    return "zenith";
  if (azimuthIsInRange(point.azimuth, safety.azimuthStart, safety.azimuthEnd))
    return "cables";
  return null;
}

export function plannerPointConstraint({
  point,
  profileAltitude = 0,
  horizonEnabled = false,
  minAltitude = 0,
  moonSeparationMinimum = 0,
  mountSafety,
}) {
  const mountReason = mountSafetyReason(mountSafety, point);
  const horizonBlocked = horizonEnabled && point.altitude < profileAltitude;
  const low = point.altitude < minAltitude;
  const moonBlocked = point.moonSeparation < moonSeparationMinimum;
  return {
    profileAltitude,
    horizonBlocked,
    low,
    moonBlocked,
    mountReason,
    constraint:
      mountReason ||
      (horizonBlocked
        ? "horizon"
        : low
          ? "altitude"
          : moonBlocked
            ? "moon"
            : null),
  };
}

// A retained target that would otherwise be excluded keeps accumulating
// distinct constraint reasons across the whole night's series instead of
// disappearing, on top of whatever reviewReasons it already carried.
export function accumulatedReviewReasons(existingReasons, constraintReasons) {
  return [
    ...new Set([
      ...(existingReasons || []),
      ...constraintReasons.filter(Boolean),
    ]),
  ];
}

function transitionTime(previous, next, reason, context) {
  if (!previous || !next) return new Date(next?.time || previous?.time);
  const margin = (point) => {
    if (reason === "moon")
      return point.moonSeparation - context.moonSeparationMinimum;
    if (reason === "horizon") return point.altitude - point.profileAltitude;
    if (reason === "altitude") return point.altitude - context.minAltitude;
    if (reason === "zenith")
      return 90 - context.mountSafety.zenithAvoidanceDegrees - point.altitude;
    return 0;
  };
  const before = margin(previous);
  const after = margin(next);
  const ratio =
    Number.isFinite(before) && Number.isFinite(after) && after !== before
      ? clamp(-before / (after - before), 0, 1)
      : 1;
  const start = new Date(previous.time).getTime();
  const end = new Date(next.time).getTime();
  return new Date(start + (end - start) * ratio);
}

// The planner only samples the sky every ten minutes; sub-sample interpolate
// the exact moment a constraint (moon/horizon/altitude/zenith) starts or
// stops applying, instead of reporting a window edge rounded to a sample.
export function visibilityWindows(series, context) {
  const windows = [];
  let startIndex = -1;
  series.forEach((point, index) => {
    if (point.constraint === null && startIndex < 0) startIndex = index;
    const next = series[index + 1];
    if (startIndex >= 0 && (!next || next.constraint !== null)) {
      const previous = series[startIndex - 1];
      const entryReason = previous?.constraint || null;
      const exitReason = next?.constraint || null;
      const startsAt = previous
        ? transitionTime(previous, series[startIndex], entryReason, context)
        : new Date(series[startIndex].time);
      const endsAt = next
        ? transitionTime(series[index], next, exitReason, context)
        : new Date(series[index].time);
      windows.push({
        start: startsAt.toISOString(),
        end: endsAt.toISOString(),
        entryReason,
        exitReason,
      });
      startIndex = -1;
    }
  });
  return windows;
}
