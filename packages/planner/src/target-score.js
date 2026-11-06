// The score of a target for one night, explained criterion by criterion.
// Every point comes from a rule written in `docs/PLANNER_SCORE.md`; every
// criterion carries the facts its sentence needs; a criterion without
// data scores nothing and its scale leaves the maximum ("62 / 80"). The
// score ranks targets for one night: it never replaces the planner's
// constraints, and it is an estimate.
//
// The sky quality criterion also reads the light layer along the target's
// path (`bright-zone.js`), so a target crossing a bright zone ranks below
// the same target seen through a dark sky.
//
// Pure and JSON in, JSON out.
// Every rule computes from the facts as they are shown (whole degrees,
// whole minutes, whole percents, tenths of mag/arcsec²) with a single
// division at the end, so a reader can redo the sum from the sheet.
import { brightZoneCrossing } from "./bright-zone.js";
import {
  filterFamily,
  narrowbandFilterFamilies,
  recommendedFilterFamilies,
} from "./filters.js";
import {
  normalizeWindTolerance,
  windAssessment,
  windTonightSubject,
} from "./wind.js";

// The seven criteria, in the order of the sheet, with their scales.
export const targetScoreCriteria = Object.freeze([
  Object.freeze({ key: "altitude-window", max: 30 }),
  Object.freeze({ key: "moon", max: 15 }),
  Object.freeze({ key: "weather", max: 20 }),
  Object.freeze({ key: "sky-quality", max: 10 }),
  Object.freeze({ key: "horizon-mask", max: 5 }),
  Object.freeze({ key: "field-fit", max: 10 }),
  Object.freeze({ key: "wind", max: 10 }),
]);

// The settings of the rules, written once (and in `docs/PLANNER_SCORE.md`).
export const targetScoreRule = Object.freeze({
  // Altitude and window (TONIGHT-SCORE-WINDOW-01): 15 points for the
  // altitude, full at 80°, none at 20°; 15 points for the useful window (the
  // minutes the target is usable during the night: above the plan's minimum
  // altitude, clear of the mask and of the Moon), full from 4 h in photo
  // (the night runs unattended) and from 2 h in visual.
  altitudeFloor: 20,
  altitudeSpan: 60,
  altitudePoints: 15,
  windowPoints: 15,
  usableMinutesFullPhoto: 240,
  usableMinutesFullVisual: 120,
  // Under 45 minutes of useful window the score is capped so that it reads
  // 49 on 100 at most (« Fenêtre courte », a « Cible difficile »).
  shortWindowMinutes: 45,
  shortWindowPercent: 49,
  // Visual only: up to 5 points for the share of the evening (from one
  // hour after the start of the dark night to the middle of the night)
  // during which the target is usable; a photo night runs all night.
  eveningBonusPoints: 5,
  eveningDelayMinutes: 60,
  // Moon: a Moon farther than 120° still costs half; at 30° or closer, all.
  moonFarSeparation: 120,
  moonSeparationSpan: 90,
  // Weather: what humidity rising by this many points, or a dew risk, costs.
  humidityRisePoints: 10,
  humidityRisePenalty: 1,
  dewModeratePenalty: 2,
  dewHighPenalty: 4,
  // Sky quality: 18.0 mag/arcsec² scores nothing, 22.0 everything.
  sqmFloorTenths: 180,
  sqmSpanTenths: 40,
  // Field: a target filling 25 % of the field or more (and up to 68 %) is
  // comfortable; 68 % and 98 % are the bounds of the planner's framing fit.
  fieldFullOccupancy: 25,
  fieldComfortable: 68,
  fieldTight: 98,
  fieldTightPoints: 6,
  fieldMosaicPoints: 2,
  // Verdicts, in percent of the maximum.
  goodPercent: 75,
  possiblePercent: 50,
});

const minuteMs = 60000;
const hourMs = 3600000;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
// Half up (`Math.round` rounds -0.5 to -0).
const round = (value) => Math.floor(value + 0.5);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const iso = (ms) => new Date(ms).toISOString();

function instant(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// `{ time (ms), value }` samples of `series` read under `key`, in time order.
function samples(series, key) {
  return (Array.isArray(series) ? series : [])
    .map((point) => ({ time: instant(point?.time), value: point?.[key] }))
    .filter((point) => point.time !== null && finite(point.value))
    .sort((left, right) => left.time - right.time);
}

// Minutes of `[t0, t1]`, clipped to `[start, end]`, during which the value
// interpolated linearly from `v0` to `v1` is at or above `threshold`.
function minutesAtOrAbove(t0, v0, t1, v1, threshold, start, end) {
  const from = Math.max(t0, start);
  const to = Math.min(t1, end);
  if (!(to > from) || !(t1 > t0)) return 0;
  const at = (t) => v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  const a = at(from);
  const b = at(to);
  if (a >= threshold && b >= threshold) return (to - from) / minuteMs;
  if (a < threshold && b < threshold) return 0;
  const crossing = from + ((threshold - a) / (b - a)) * (to - from);
  return (a >= threshold ? crossing - from : to - crossing) / minuteMs;
}

function totalMinutesAtOrAbove(points, threshold, start, end) {
  let minutes = 0;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    minutes += minutesAtOrAbove(
      before.time,
      before.value,
      after.time,
      after.value,
      threshold,
      start,
      end,
    );
  }
  return minutes;
}

function valueAt(points, time) {
  if (time <= points[0].time) return points[0].value;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    if (time > after.time) continue;
    const span = after.time - before.time;
    return span > 0
      ? before.value +
          ((after.value - before.value) * (time - before.time)) / span
      : after.value;
  }
  return points.at(-1).value;
}

function unavailable(key, max, reason) {
  return { key, points: 0, max, available: false, reason, facts: {} };
}

function criterion(key, max, points, facts) {
  return {
    key,
    points: clamp(points, 0, max),
    max,
    available: true,
    reason: null,
    facts,
  };
}

// The window the target is observed in: its primary visibility window (the
// one the card shows), else the night.
function targetWindowOf(card, night) {
  const windows = Array.isArray(card?.visibilityWindows)
    ? card.visibilityWindows
    : [];
  const primary =
    windows.find(
      (window) =>
        window?.start === card.usableStart && window?.end === card.usableEnd,
    ) || windows[0];
  const from = instant(primary?.start);
  const to = instant(primary?.end);
  if (from !== null && to !== null && to > from) return { from, to };
  return { from: night.start, to: night.end };
}

// The stretches of `[start, end]` during which the value interpolated
// linearly between the samples is at or above `threshold`, in time order.
function intervalsAtOrAbove(points, threshold, start, end) {
  const intervals = [];
  let open = null;
  const push = (from, to) => {
    if (to > from) intervals.push({ from, to });
  };
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1];
    const after = points[index];
    const from = Math.max(before.time, start);
    const to = Math.min(after.time, end);
    if (!(to > from) || !(after.time > before.time)) continue;
    const at = (t) =>
      before.value +
      ((after.value - before.value) * (t - before.time)) /
        (after.time - before.time);
    const a = at(from);
    const b = at(to);
    if (a >= threshold && b >= threshold) {
      if (open === null) open = from;
    } else if (a >= threshold) {
      push(open ?? from, from + ((threshold - a) / (b - a)) * (to - from));
      open = null;
    } else if (b >= threshold) {
      if (open !== null) push(open, from);
      open = from + ((threshold - a) / (b - a)) * (to - from);
    } else if (open !== null) {
      push(open, from);
      open = null;
    }
  }
  if (open !== null)
    push(open, Math.min(points.at(-1)?.time ?? -Infinity, end));
  return intervals;
}

// The stretches of the night during which the target is usable: the card's
// visibility windows (above the plan's minimum altitude, clear of the mask,
// of the Moon and of the mount's limits: `withHorizonMask`), else the
// stretches of its path clear of the mask above the minimum
// (`targetNightPath`), else its series above the minimum; clipped to the
// night.
function usableIntervalsOf(card, maskPath, night, minimum, points) {
  let ranges;
  if (Array.isArray(card?.visibilityWindows))
    ranges = card.visibilityWindows.map((window) => ({
      from: instant(window?.start),
      to: instant(window?.end),
    }));
  else if (Array.isArray(maskPath?.segments))
    ranges = maskPath.segments
      .filter((segment) => segment?.state === "visible")
      .map((segment) => ({
        from: instant(segment.start),
        to: instant(segment.end),
      }));
  else return intervalsAtOrAbove(points, minimum, night.start, night.end);
  return ranges
    .filter((range) => range.from !== null && range.to !== null)
    .map((range) => ({
      from: Math.max(range.from, night.start),
      to: Math.min(range.to, night.end),
    }))
    .filter((range) => range.to > range.from)
    .sort((left, right) => left.from - right.from);
}

// The evening of the visual bonus: from one hour after the start of the dark
// night to the middle of the night (the dark night when the window gives it,
// else the night scored); null when it is empty.
function eveningOf(window, night) {
  const darkStart = instant(window?.darkStart) ?? night.start;
  const darkEnd = instant(window?.darkEnd) ?? night.end;
  if (!Number.isFinite(darkStart) || !Number.isFinite(darkEnd)) return null;
  const from = darkStart + targetScoreRule.eveningDelayMinutes * minuteMs;
  const to = darkStart + (darkEnd - darkStart) / 2;
  return round((to - from) / minuteMs) > 0 ? { from, to } : null;
}

function altitudeWindow(
  card,
  maskPath,
  night,
  { minimum, visual, evening, usableNight },
) {
  const { max } = targetScoreCriteria[0];
  const points = samples(card?.series, "altitude");
  if (!points.length) return unavailable("altitude-window", max, "no-series");
  const inNight = points.filter(
    (point) => point.time >= night.start && point.time <= night.end,
  );
  const highest = (inNight.length ? inNight : points).reduce((best, point) =>
    point.value > best.value ? point : best,
  );
  const culmination =
    maskPath?.culmination &&
    finite(maskPath.culmination.altitude) &&
    instant(maskPath.culmination.time) !== null
      ? {
          altitude: maskPath.culmination.altitude,
          time: instant(maskPath.culmination.time),
        }
      : { altitude: highest.value, time: highest.time };
  const altitude = round(culmination.altitude);
  // A target scored at its slot (a plan's target) keeps the useful window of
  // its night: the windows and the night the caller gives.
  const usable = usableNight
    ? usableIntervalsOf(
        { visibilityWindows: usableNight.windows },
        null,
        usableNight,
        minimum,
        points,
      )
    : usableIntervalsOf(card, maskPath, night, minimum, points);
  const usableMinutes = round(
    usable.reduce((sum, range) => sum + (range.to - range.from), 0) / minuteMs,
  );
  const fullMinutes = visual
    ? targetScoreRule.usableMinutesFullVisual
    : targetScoreRule.usableMinutesFullPhoto;
  const a = clamp(
    altitude - targetScoreRule.altitudeFloor,
    0,
    targetScoreRule.altitudeSpan,
  );
  const d = clamp(usableMinutes, 0, fullMinutes);
  // 15 × a / 60 + 15 × d / F, one division: (15 a F + 15 × 60 d) / (60 F).
  const criterionPoints = round(
    (targetScoreRule.altitudePoints * a * fullMinutes +
      targetScoreRule.windowPoints * targetScoreRule.altitudeSpan * d) /
      (targetScoreRule.altitudeSpan * fullMinutes),
  );
  // Visual only: the share of the evening during which the target is usable.
  let eveningBonus = null;
  if (visual && evening) {
    const eveningMinutes = round((evening.to - evening.from) / minuteMs);
    const overlap = round(
      usable.reduce(
        (sum, range) =>
          sum +
          Math.max(
            0,
            Math.min(range.to, evening.to) - Math.max(range.from, evening.from),
          ),
        0,
      ) / minuteMs,
    );
    const bonus = round(
      (targetScoreRule.eveningBonusPoints * Math.min(overlap, eveningMinutes)) /
        eveningMinutes,
    );
    if (bonus > 0)
      eveningBonus = {
        points: bonus,
        minutes: Math.min(overlap, eveningMinutes),
        from: iso(evening.from),
        to: iso(evening.to),
      };
  }
  return criterion("altitude-window", max, criterionPoints, {
    culminationAltitude: altitude,
    culminationAt: iso(culmination.time),
    minAltitude: minimum,
    usableMinutes,
    fullMinutes,
    mode: visual ? "visual" : "photo",
    eveningBonus,
  });
}

function targetName(target) {
  return String(
    target?.designation || target?.title || target?.objects?.[0] || "",
  );
}

// The narrowband family the observer has among those advised for the
// target (an emission or planetary nebula), else null.
function narrowbandFilterFor(card, equipment, ownedFilters) {
  const advised = recommendedFilterFamilies(card?.target, equipment?.mode);
  if (!Array.isArray(advised)) return null;
  const owned = new Set(
    [
      ...(Array.isArray(equipment?.filters) ? equipment.filters : []),
      ...(Array.isArray(ownedFilters) ? ownedFilters : []),
    ]
      .map((filter) => filterFamily(filter))
      .filter(Boolean),
  );
  return (
    advised.find(
      (family) =>
        narrowbandFilterFamilies.includes(family) && owned.has(family),
    ) || null
  );
}

function moonCriterion(
  card,
  maskPath,
  moonSeries,
  night,
  equipment,
  ownedFilters,
) {
  const { max } = targetScoreCriteria[1];
  const moon = samples(moonSeries, "altitude");
  const illumination = finite(night.moonIllumination)
    ? clamp(round(night.moonIllumination), 0, 100)
    : null;
  if (illumination === null || moon.length < 2)
    return unavailable("moon", max, "no-moon");
  const start = Number.isFinite(night.start) ? night.start : moon[0].time;
  const end = Number.isFinite(night.end) ? night.end : moon.at(-1).time;
  const nightMinutes = round((end - start) / minuteMs);
  if (!(nightMinutes > 0)) return unavailable("moon", max, "no-moon");
  const upMinutes = clamp(
    round(totalMinutesAtOrAbove(moon, 0, start, end)),
    0,
    nightMinutes,
  );
  let state = "up";
  let setAt = null;
  let riseAt = null;
  if (upMinutes === 0) state = "down";
  else if (upMinutes < nightMinutes) {
    const upAtStart = valueAt(moon, start) > 0;
    state = upAtStart ? "sets" : "rises";
    for (let index = 1; index < moon.length; index += 1) {
      const before = moon[index - 1];
      const after = moon[index];
      if (before.value > 0 === after.value > 0) continue;
      const crossing =
        before.time +
        ((0 - before.value) / (after.value - before.value)) *
          (after.time - before.time);
      if (crossing < start || crossing > end) continue;
      if (upAtStart && before.value > 0) {
        setAt = round(crossing / minuteMs) * minuteMs;
        break;
      }
      if (!upAtStart && after.value > 0) {
        riseAt = round(crossing / minuteMs) * minuteMs;
        break;
      }
    }
  }
  const top = (Array.isArray(card?.series) ? card.series : []).reduce(
    (best, point) =>
      finite(point?.altitude) && (!best || point.altitude > best.altitude)
        ? point
        : best,
    null,
  );
  const rawSeparation = finite(maskPath?.moonSeparationAtCulmination)
    ? maskPath.moonSeparationAtCulmination
    : finite(top?.moonSeparation)
      ? top.moonSeparation
      : null;
  const separation = rawSeparation === null ? null : round(rawSeparation);
  // d: how close the Moon is, 0 (120° or more) to 90 (30° or less); an
  // unknown separation counts as close.
  const d =
    separation === null
      ? targetScoreRule.moonSeparationSpan
      : clamp(
          targetScoreRule.moonFarSeparation - separation,
          0,
          targetScoreRule.moonSeparationSpan,
        );
  const narrowbandFilter = narrowbandFilterFor(card, equipment, ownedFilters);
  // harm = (I / 100) × (U / N) × (90 + d) / 180, halved by a narrowband
  // filter; points = 15 × (1 − harm).
  const numerator = max * illumination * upMinutes * (90 + d);
  const denominator = 100 * nightMinutes * 180 * (narrowbandFilter ? 2 : 1);
  return criterion("moon", max, round(max - numerator / denominator), {
    illumination,
    separation,
    targetName: targetName(card?.target),
    state,
    setAt: setAt === null ? null : iso(setAt),
    riseAt: riseAt === null ? null : iso(riseAt),
    upMinutes,
    nightMinutes,
    narrowbandFilter,
  });
}

const dewRank = { low: 0, moderate: 1, high: 2 };

function overlapping(hourly, window) {
  return (Array.isArray(hourly) ? hourly : [])
    .map((row) => ({ row, time: instant(row?.time) }))
    .filter(
      ({ time }) =>
        time !== null && time < window.to && time + hourMs > window.from,
    )
    .sort((left, right) => left.time - right.time);
}

function weatherCriterion(hourly, window) {
  const { max } = targetScoreCriteria[2];
  const rows = overlapping(hourly, window);
  const clouded = rows.filter(({ row }) => finite(row.cloud));
  if (!clouded.length) return unavailable("weather", max, "no-forecast");
  const cloudMean = round(
    clouded.reduce((sum, { row }) => sum + row.cloud, 0) / clouded.length,
  );
  let dewRisk = null;
  let dewRiskFrom = null;
  for (const { row, time } of rows) {
    if (!Object.hasOwn(dewRank, row.dewRisk ?? "")) continue;
    if (dewRisk === null || dewRank[row.dewRisk] > dewRank[dewRisk]) {
      dewRisk = row.dewRisk;
      dewRiskFrom = time;
    }
  }
  const humid = rows.filter(({ row }) => finite(row.humidity));
  let humidity = null;
  let humidityRiseAt = null;
  if (humid.length >= 2) {
    const rise = humid
      .slice(1)
      .find(
        ({ row }) =>
          row.humidity >=
          humid[0].row.humidity + targetScoreRule.humidityRisePoints,
      );
    humidity = rise ? "rising" : "steady";
    humidityRiseAt = rise ? rise.time : null;
  }
  const penalty =
    dewRisk === "high"
      ? targetScoreRule.dewHighPenalty
      : dewRisk === "moderate"
        ? targetScoreRule.dewModeratePenalty
        : humidity === "rising"
          ? targetScoreRule.humidityRisePenalty
          : 0;
  // 20 × (1 − cloud / 100) − penalty.
  return criterion(
    "weather",
    max,
    round((max * (100 - cloudMean) - 100 * penalty) / 100),
    {
      cloudMean,
      humidity,
      humidityRiseAt: humidityRiseAt === null ? null : iso(humidityRiseAt),
      dewRisk,
      dewRiskFrom: dewRiskFrom === null ? null : iso(dewRiskFrom),
    },
  );
}

// Where the target is observed, for the bright zone it crosses: the best
// window of its path (`targetNightPath`), else the stretches clear of the
// mask above the minimum altitude, else (no path computed) the window of the
// card; clipped to the night.
function brightZoneWindow(maskPath, targetWindow, night) {
  const best = maskPath?.bestWindow;
  let ranges;
  if (instant(best?.start) !== null && instant(best?.end) !== null)
    ranges = [{ start: best.start, end: best.end }];
  else if (Array.isArray(maskPath?.segments))
    ranges = maskPath.segments
      .filter((segment) => segment?.state === "visible")
      .map(({ start, end }) => ({ start, end }));
  else ranges = [{ start: targetWindow.from, end: targetWindow.to }];
  return ranges
    .map((range) => ({
      start: Math.max(instant(range.start) ?? Infinity, night.start),
      end: Math.min(instant(range.end) ?? -Infinity, night.end),
    }))
    .filter((range) => range.end >= range.start);
}

// The sky quality of the place, less what the target pays for the bright
// zone it crosses (`bright-zone.js`, read from the same grid as the layer of
// the horizon map): the points of the zenith sky, minus a deduction that
// never exceeds them. Without a grid, exactly the zenith points.
function skyQualityCriterion(
  skyQuality,
  { card, maskPath, targetWindow, night, skyDirection },
) {
  const { max } = targetScoreCriteria[3];
  const bortleClass = finite(skyQuality?.bortleClass)
    ? clamp(round(skyQuality.bortleClass), 1, 9)
    : null;
  const sqmTenths = finite(skyQuality?.sqm) ? round(skyQuality.sqm * 10) : null;
  if (bortleClass === null && sqmTenths === null)
    return unavailable("sky-quality", max, "no-sky-quality");
  const zenithPoints = clamp(
    sqmTenths !== null
      ? round(
          (max *
            clamp(
              sqmTenths - targetScoreRule.sqmFloorTenths,
              0,
              targetScoreRule.sqmSpanTenths,
            )) /
            targetScoreRule.sqmSpanTenths,
        )
      : round((max * (9 - bortleClass)) / 8),
    0,
    max,
  );
  const crossing = skyDirection
    ? brightZoneCrossing({
        path: card?.series,
        grid: skyDirection,
        window: brightZoneWindow(maskPath, targetWindow, night),
        points: zenithPoints,
      })
    : null;
  const deduction = crossing?.available ? crossing.deduction : 0;
  // The value the place retains (measured, else typed, else the model's)
  // says where it comes from when a person gave it (measured on their poses,
  // typed); the model's estimate says nothing, so the key is absent.
  const source =
    skyQuality?.source === "measured" || skyQuality?.source === "entered"
      ? skyQuality.source
      : null;
  return criterion("sky-quality", max, zenithPoints - deduction, {
    bortleClass,
    sqm: sqmTenths === null ? null : sqmTenths / 10,
    ...(source ? { source } : {}),
    brightZone:
      deduction > 0
        ? {
            worstSqm: crossing.worstSqm,
            share: crossing.share,
            from: crossing.from,
            to: crossing.to,
            compass: crossing.compass,
            deduction,
          }
        : null,
  });
}

function maskCriterion(maskPath, night, minAltitude) {
  const { max } = targetScoreCriteria[4];
  if (!maskPath || maskPath.maskEnabled !== true)
    return unavailable("horizon-mask", max, "no-mask");
  let clear = 0;
  let lost = 0;
  let longest = null;
  for (const segment of Array.isArray(maskPath.segments)
    ? maskPath.segments
    : []) {
    const points = samples(segment?.points, "altitude");
    if (segment?.state === "visible") {
      const from = Math.max(instant(segment.start) ?? Infinity, night.start);
      const to = Math.min(instant(segment.end) ?? -Infinity, night.end);
      if (to > from) {
        clear += (to - from) / minuteMs;
        if (!longest || to - from > longest.to - longest.from)
          longest = { from, to };
      }
    } else if (segment?.state === "masked") {
      lost += totalMinutesAtOrAbove(
        points,
        minAltitude,
        night.start,
        night.end,
      );
    }
  }
  const clearMinutes = round(clear);
  const maskedMinutes = round(lost);
  const state = longest
    ? "clear"
    : maskedMinutes > 0
      ? "hidden"
      : "below-minimum";
  const total = clearMinutes + maskedMinutes;
  return criterion(
    "horizon-mask",
    max,
    total > 0 ? round((max * clearMinutes) / total) : 0,
    {
      state,
      clearFrom: longest ? iso(longest.from) : null,
      clearTo: longest ? iso(longest.to) : null,
      clearMinutes,
      maskedMinutes,
      minAltitude,
    },
  );
}

function fieldCriterion(card, equipment) {
  const { max } = targetScoreCriteria[5];
  const rawSize = Array.isArray(card?.framing?.size)
    ? card.framing.size
    : card?.target?.apparentSizeArcmin;
  const size =
    Array.isArray(rawSize) &&
    finite(rawSize[0]) &&
    finite(rawSize[1]) &&
    rawSize[0] > 0 &&
    rawSize[1] > 0
      ? [rawSize[0], rawSize[1]]
      : null;
  if (!size) return unavailable("field-fit", max, "no-size");
  const field = equipment?.field;
  if (!(finite(field?.width) && finite(field?.height)) || !(field.width > 0))
    return unavailable("field-fit", max, "no-field");
  if (!(field.height > 0)) return unavailable("field-fit", max, "no-field");
  const widthShare = (size[0] / 60 / field.width) * 100;
  const heightShare = (size[1] / 60 / field.height) * 100;
  const occupancyRaw = Math.max(widthShare, heightShare);
  const occupancy = round(occupancyRaw);
  const fit =
    occupancyRaw <= targetScoreRule.fieldComfortable
      ? occupancy >= targetScoreRule.fieldFullOccupancy
        ? "comfortable"
        : "small"
      : occupancyRaw <= targetScoreRule.fieldTight
        ? "tight"
        : "mosaic";
  const points =
    fit === "comfortable"
      ? max
      : fit === "small"
        ? Math.max(
            1,
            round((max * occupancy) / targetScoreRule.fieldFullOccupancy),
          )
        : fit === "tight"
          ? targetScoreRule.fieldTightPoints
          : targetScoreRule.fieldMosaicPoints;
  return criterion("field-fit", max, points, {
    fit,
    occupancy,
    dimension: heightShare > widthShare ? "height" : "width",
    targetName: targetName(card?.target),
    sizeArcmin: size,
    fieldWidth: round(field.width * 10) / 10,
    fieldHeight: round(field.height * 10) / 10,
    fieldShape: field.shape === "circle" ? "circle" : "rectangle",
  });
}

function windCriterion(hourly, tolerance, window) {
  const { max } = targetScoreCriteria[6];
  const limits = normalizeWindTolerance(tolerance);
  const assessment = windAssessment({
    hourly,
    tolerance: limits,
    window: { start: window.from, end: window.to },
  });
  if (!assessment) return unavailable("wind", max, "no-forecast");
  const subject = windTonightSubject(assessment);
  // Per limit L and strongest value v: 10 × (1.1 − v / L) / 0.6, written
  // (110 L − 100 v) / (6 L); the worse of the gusts and the sustained wind.
  const scores = [
    [assessment.gustMax, limits.gustKmh],
    [assessment.windMax, limits.sustainedKmh],
  ]
    .filter(([value]) => finite(value))
    .map(([value, limit]) => (110 * limit - 100 * value) / (6 * limit));
  const worst = scores.length ? Math.min(...scores) : max;
  const points = assessment.level === "over" ? 0 : round(clamp(worst, 0, max));
  const subjectKind = subject?.subject ?? "gust";
  return criterion("wind", max, points, {
    level: assessment.level,
    subject: subjectKind,
    value: finite(subject?.value) ? subject.value : null,
    at: finite(subject?.at) ? iso(subject.at) : null,
    limit: subjectKind === "sustained" ? limits.sustainedKmh : limits.gustKmh,
    preset: limits.preset,
    sustainedKmh: limits.sustainedKmh,
    gustKmh: limits.gustKmh,
  });
}

/**
 * The score of `card` for the night.
 *
 * - `card`: a planner card (`planNight`, then `withHorizonMask`): `target`,
 *   `series` (`{ time, altitude, azimuth, moonSeparation }`),
 *   `visibilityWindows`, `usableStart`/`usableEnd`, `framing`, `minAltitude`;
 * - `window`: the night, `{ start, end, darkStart?, darkEnd?,
 *   moonIllumination }` (instants ISO-8601 or epoch milliseconds, the
 *   illumination in percent): `start`/`end` the night proposed (the plan's
 *   span, the whole dark night by default), `darkStart`/`darkEnd` the dark
 *   night the visual evening bonus reads (else `start`/`end`);
 * - `hourly`: the rows of `hourlyAstronomyForecast` (`time` in epoch
 *   milliseconds, `cloud`, `humidity`, `wind`, `gust`, `dewRisk`); empty
 *   or absent without a forecast;
 * - `moonSeries`: the Moon's altitude over the night, `[{ time, altitude }]`;
 * - `skyQuality`: `{ bortleClass, sqm, source? }` of the place (the value it
 *   retains, measured, else typed, else the model's, `placeScoreSky`; `source` `measured` or `entered` when a
 *   person gave it), or null;
 * - `skyDirection`: the brightness by direction around the place (the grid of
 *   the horizon map's light layer, `skyBrightnessByDirection`), or null /
 *   absent: the "Qualité du ciel" criterion then keeps the zenith points
 *  alone (with a grid, a target whose window crosses a
 *   bright zone pays for it, up to the criterion's points; the layer's switch
 *   changes nothing here);
 * - `maskPath`: `targetNightPath` of the card against the place's mask;
 * - `equipment`: `{ field: { width, height, shape }, mode, filters }`, the
 *   field of view of the plan's equipment (`fieldOfView`), its mode
 *   (`visual`, else photo: the useful window's saturation and the evening
 *   bonus) and its filters;
 * - `ownedFilters`: the filters the observer owns (`ownedFiltersUnion`:
 *   the space's inventory, then the ones added on this device);
 * - `windTolerance`: the mount's tolerance (`planWindTolerance`);
 * - `minAltitude`: the plan's minimum altitude (default: the card's);
 * - `usableNight`: `{ start, end, windows }`, for a target scored at a slot
 *   of its night (a plan's target, `window` being the slot): the night
 *   proposed and the target's visibility windows over it, which the useful
 *   window reads instead of the slot's.
 *
 * Returns `{ total, max, verdict, estimate, bonus, cap, criteria }`:
 * `criteria` in the order of `targetScoreCriteria`, each `{ key, points, max,
 * available, reason, facts }`; `bonus` the points of the visual evening
 * (already in `total`, which never exceeds `max`); `cap`, when the useful
 * window is shorter than 45 min, `{ minutes, limit, ceiling, uncapped }` (the
 * total is then at most `ceiling`, the highest total that reads 49 on 100),
 * else null.
 */
export function targetTonightScore({
  card,
  window,
  hourly,
  moonSeries,
  skyQuality,
  skyDirection,
  maskPath,
  equipment,
  ownedFilters,
  windTolerance,
  minAltitude,
  usableNight,
} = {}) {
  const night = {
    start: instant(window?.start) ?? -Infinity,
    end: instant(window?.end) ?? Infinity,
    moonIllumination: window?.moonIllumination,
  };
  const minimum = finite(minAltitude)
    ? minAltitude
    : finite(card?.minAltitude)
      ? card.minAltitude
      : 0;
  const targetWindow = targetWindowOf(card, night);
  const visual = equipment?.mode === "visual";
  const nightOfWindows =
    usableNight &&
    Array.isArray(usableNight.windows) &&
    instant(usableNight.start) !== null &&
    instant(usableNight.end) !== null
      ? {
          windows: usableNight.windows,
          start: instant(usableNight.start),
          end: instant(usableNight.end),
        }
      : null;
  const criteria = [
    altitudeWindow(card, maskPath, night, {
      minimum,
      visual,
      evening: eveningOf(window, night),
      usableNight: nightOfWindows,
    }),
    moonCriterion(card, maskPath, moonSeries, night, equipment, ownedFilters),
    weatherCriterion(hourly, targetWindow),
    skyQualityCriterion(skyQuality, {
      card,
      maskPath,
      targetWindow,
      night,
      skyDirection,
    }),
    maskCriterion(maskPath, night, minimum),
    fieldCriterion(card, equipment),
    windCriterion(hourly, windTolerance, targetWindow),
  ];
  const counted = criteria.filter((entry) => entry.available);
  const sum = counted.reduce((total, entry) => total + entry.points, 0);
  const max = counted.reduce((total, entry) => total + entry.max, 0);
  const windowCriterion = criteria[0];
  const bonus = windowCriterion.available
    ? (windowCriterion.facts.eveningBonus?.points ?? 0)
    : 0;
  const uncapped = Math.min(max, sum + bonus);
  // « Fenêtre courte »: under 45 min of useful window, at most the highest
  // total that reads 49 on 100 (`scoreOn100`): 49 / 100, 44 / 90, 47 / 95.
  const short =
    windowCriterion.available &&
    windowCriterion.facts.usableMinutes < targetScoreRule.shortWindowMinutes;
  const ceiling = Math.floor(
    ((2 * targetScoreRule.shortWindowPercent + 1) * max - 1) / 200,
  );
  const total = short ? Math.min(uncapped, ceiling) : uncapped;
  return {
    total,
    max,
    verdict: targetScoreVerdict(total, max),
    estimate: true,
    bonus,
    cap: short
      ? {
          minutes: windowCriterion.facts.usableMinutes,
          limit: targetScoreRule.shortWindowMinutes,
          ceiling,
          uncapped,
        }
      : null,
    criteria,
  };
}

/**
 * The estimate of a target at the slot it is really given ("Rapproché"
 * of the suggestion sheet): the night's score with its altitude read at the
 * highest altitude inside `[start, end]` instead of at the culmination, its
 * useful window unchanged (the night's); every other criterion, the evening
 * bonus and the short-window cap are the night's, and the result never
 * exceeds the night's score (a slot cannot be better placed than the night's
 * best).
 *
 * - `score`: the night's `targetTonightScore` result (`total`, `max`,
 *   `criteria`, `cap`); without finite `total` and `max`, the answer is `null`;
 * - `card`: the card, whose `series` carries the altitude;
 * - `start`, `end`: the slot, instants (ms or ISO strings).
 *
 * Returns `{ total, max }`; the night's own values when the score has no
 * altitude criterion to read, or the card no series.
 */
export function targetSlotScore({ score, card, start, end } = {}) {
  if (!score || !finite(score.total) || !finite(score.max)) return null;
  const night = { total: score.total, max: score.max };
  const criterion = (Array.isArray(score.criteria) ? score.criteria : []).find(
    (entry) => entry?.key === "altitude-window",
  );
  const points = samples(card?.series, "altitude");
  const from = instant(start);
  const to = instant(end);
  if (
    !criterion?.available ||
    !finite(criterion.points) ||
    !finite(criterion.facts?.usableMinutes) ||
    !finite(criterion.facts?.fullMinutes) ||
    !(criterion.facts.fullMinutes > 0) ||
    !points.length ||
    from === null ||
    to === null ||
    !(to >= from)
  )
    return night;
  // The highest point of the curve inside the slot: its two ends, read on the
  // straight lines between samples, and the samples between them.
  const highest = [
    valueAt(points, from),
    valueAt(points, to),
    ...points
      .filter((point) => point.time > from && point.time < to)
      .map((point) => point.value),
  ].reduce((best, value) => (value > best ? value : best));
  const a = clamp(
    round(highest) - targetScoreRule.altitudeFloor,
    0,
    targetScoreRule.altitudeSpan,
  );
  const fullMinutes = criterion.facts.fullMinutes;
  const d = clamp(criterion.facts.usableMinutes, 0, fullMinutes);
  const atSlot = Math.min(
    criterion.points,
    clamp(
      round(
        (targetScoreRule.altitudePoints * a * fullMinutes +
          targetScoreRule.windowPoints * targetScoreRule.altitudeSpan * d) /
          (targetScoreRule.altitudeSpan * fullMinutes),
      ),
      0,
      targetScoreCriteria[0].max,
    ),
  );
  // From the night's total before its cap, then never above the night's.
  const uncapped = finite(score.cap?.uncapped)
    ? score.cap.uncapped
    : night.total;
  return {
    total: Math.min(night.total, uncapped - criterion.points + atSlot),
    max: night.max,
  };
}

/**
 * SUGGEST-FILTERS-01: the estimate of a target over the periods of the night
 * a person chose (« Milieu de nuit », « Début + Fin »): the night's score
 * with its « Hauteur et durée » read inside `windows` only — the altitude at
 * the highest point of the curve inside them, the useful duration their sum
 * (never above the night's) — and the short-window cap when that sum is
 * under `shortWindowMinutes`. Every other criterion is the night's, and the
 * result never exceeds the night's score: a target high for only twenty
 * minutes in the period is worth less.
 *
 * - `score`: the night's `targetTonightScore` result; without finite `total`
 *   and `max`, the answer is `null`;
 * - `card`: the card, whose `series` carries the altitude;
 * - `windows`: `[{ start, end }]`, the target's usable stretches inside the
 *   periods (instants, ms or ISO strings).
 *
 * Returns `{ total, max }`; the night's own values when the score has no
 * altitude criterion to read, the card no series, or `windows` is empty.
 */
export function targetWindowsScore({ score, card, windows } = {}) {
  if (!score || !finite(score.total) || !finite(score.max)) return null;
  const night = { total: score.total, max: score.max };
  const criterion = (Array.isArray(score.criteria) ? score.criteria : []).find(
    (entry) => entry?.key === "altitude-window",
  );
  const points = samples(card?.series, "altitude");
  const ranges = (Array.isArray(windows) ? windows : [])
    .map((window) => ({
      from: instant(window?.start),
      to: instant(window?.end),
    }))
    .filter(
      (range) =>
        range.from !== null && range.to !== null && range.to > range.from,
    );
  if (
    !criterion?.available ||
    !finite(criterion.points) ||
    !finite(criterion.facts?.usableMinutes) ||
    !finite(criterion.facts?.fullMinutes) ||
    !(criterion.facts.fullMinutes > 0) ||
    !points.length ||
    !ranges.length
  )
    return night;
  let highest = -Infinity;
  for (const { from, to } of ranges)
    for (const value of [
      valueAt(points, from),
      valueAt(points, to),
      ...points
        .filter((point) => point.time > from && point.time < to)
        .map((point) => point.value),
    ])
      if (value > highest) highest = value;
  const a = clamp(
    round(highest) - targetScoreRule.altitudeFloor,
    0,
    targetScoreRule.altitudeSpan,
  );
  const fullMinutes = criterion.facts.fullMinutes;
  const usable = Math.min(
    criterion.facts.usableMinutes,
    round(
      ranges.reduce((sum, range) => sum + range.to - range.from, 0) / minuteMs,
    ),
  );
  const d = clamp(usable, 0, fullMinutes);
  const inPeriods = Math.min(
    criterion.points,
    clamp(
      round(
        (targetScoreRule.altitudePoints * a * fullMinutes +
          targetScoreRule.windowPoints * targetScoreRule.altitudeSpan * d) /
          (targetScoreRule.altitudeSpan * fullMinutes),
      ),
      0,
      targetScoreCriteria[0].max,
    ),
  );
  const uncapped =
    (finite(score.cap?.uncapped) ? score.cap.uncapped : night.total) -
    criterion.points +
    inPeriods;
  const ceiling = Math.floor(
    ((2 * targetScoreRule.shortWindowPercent + 1) * night.max - 1) / 200,
  );
  const capped =
    usable < targetScoreRule.shortWindowMinutes
      ? Math.min(uncapped, ceiling)
      : uncapped;
  return { total: Math.max(0, Math.min(night.total, capped)), max: night.max };
}

// "Bonne cible pour ce soir" (75 % of the maximum or more), "Cible
// possible ce soir" (50 % to 74 %), "Cible difficile ce soir" (under 50 %).
export function targetScoreVerdict(total, max) {
  if (!(max > 0)) return "difficult";
  if (total * 100 >= max * targetScoreRule.goodPercent) return "good";
  if (total * 100 >= max * targetScoreRule.possiblePercent) return "possible";
  return "difficult";
}

// Orders two scores for the sort "Score de ce soir": the higher share of
// its own maximum first (compared by cross-multiplication, never a rounded
// percent); a card without a score last.
export function compareTonightScores(left, right) {
  const leftScored = left && left.max > 0;
  const rightScored = right && right.max > 0;
  if (!leftScored || !rightScored)
    return leftScored === rightScored ? 0 : leftScored ? -1 : 1;
  return right.total * left.max - left.total * right.max;
}
