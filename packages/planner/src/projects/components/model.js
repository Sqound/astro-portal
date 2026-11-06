// The multi-night plans on the web, as plain functions: the words their cards
// and their detail say and the figures those words are made of — the progress
// (`projectProgress`), the season (`seasonWindow`) and the calendar
// (`multiNightCalendar`) — and the bridges between a plan and its multi-night
// plans. Nothing here draws or fetches.
//
// Every bridge is lossless: following, turning into or attaching only writes
// `projectId` on the chosen items; detaching only removes it.

import {
  causeLabelInSentence,
  durationText,
} from "portal/components/sessions/night-summary-view.js";
import { weatherCodeForDate } from "portal/astronomy-forecast.js";
import { clockText } from "portal/written-forms.js";
import { normaliseHorizonMask } from "portal/planner/horizon-mask.js";
import { placeCivilDate } from "../../tonight-overview.js";
import { projectProgress } from "../project-progress.js";
import {
  seasonDefaultMinimumMinutes,
  seasonWindow,
} from "../../season-window.js";
import {
  seasonChartNights,
  seasonEndCause,
  seasonMoonRule,
} from "../../season-card-model.js";
import {
  projectDateAfter,
  projectDaysBetween,
  projectNight,
} from "../../project-night.js";
import { choose, multiNightCopy, say } from "./copy.js";
import { planTimeLeft, planTimeLeftText } from "../../plan-time-left.js";

const text = (value) => (typeof value === "string" ? value.trim() : "");
const number = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Up to this many weeks the season is counted in weeks; then by month. */
export const multiNightWeeksShown = 8;
/** The season of a card is worked out over about four months. */
export const multiNightSeasonNights = 120;
/** The detail's chart draws eight weeks. */
export const multiNightChartNights = seasonChartNights;
/** "Planifier la prochaine nuit" wants a night of at least an hour. */
export const multiNightNextNightMinimumMinutes = 60;
/** The forecast words cover five nights. */
// Sixteen nights of forecast, a trend from the eleventh.
export const multiNightForecastNights = 16;
export const multiNightTrendFrom = 11;

// ------------------------------------------------------------------ words

/** "4 h 10", "12 h", "50 min": the one duration writing. */
export function multiNightDuration(locale, minutes) {
  return durationText(locale, minutes);
}

/** "6 h à 10 h", "4 h 30 à 6 h": two durations of the one writing. */
export function multiNightRange(locale, minimum, maximum) {
  return say(locale, "range", {
    minimum: multiNightDuration(locale, minimum),
    maximum: multiNightDuration(locale, maximum),
  });
}

/**
 * The goal proposed for a suggested integration: the middle of its range,
 * rounded to 30 minutes, within the contract's 30 minutes to 100 hours.
 */
export function multiNightGoalFor(minimum, maximum) {
  return clamp(Math.round((minimum + maximum) / 2 / 30) * 30, 30, 6000);
}

/**
 * A card's suggested integration (`card.integration`) as
 * `{ minimum, maximum, recommended }`, or `null` (a free framing has none).
 */
export function multiNightIntegrationOf(card) {
  const integration = card?.integration;
  if (!integration || integration.available === false) return null;
  const minimum = number(integration.minimumMinutes);
  const maximum = number(integration.maximumMinutes);
  if (minimum === null || maximum === null || maximum < minimum) return null;
  const low = Math.round(minimum);
  const high = Math.round(maximum);
  return {
    minimum: low,
    maximum: high,
    recommended: multiNightGoalFor(low, high),
  };
}

/**
 * What the night gives a target: its usable window tonight in minutes from
 * the night's start (`availability`), and whether it is the whole night.
 */
export function multiNightTonightOf(availability, total) {
  const start = number(availability?.start);
  const end = number(availability?.end);
  const night = number(total ?? availability?.total);
  if (start === null || end === null || night === null) return null;
  const startMinute = Math.round(start);
  const endMinute = Math.round(end);
  return {
    startMinute,
    endMinute,
    totalMinutes: Math.round(night),
    minutes: Math.max(0, endMinute - startMinute),
    wholeNight: startMinute <= 0 && endMinute >= Math.round(night),
  };
}

/** Worth following over several nights: more is recommended than tonight gives. */
export const multiNightWorthFollowing = (integration, tonight) =>
  Boolean(integration && tonight && integration.recommended > tonight.minutes);

const TITLE_SEPARATORS = [" — ", " – ", " - "];

/**
 * The name a multi-night plan gives its target ("NGC 7000"): its
 * designation, else what its title says before "—", else its id.
 */
export function multiNightTargetLabel(target) {
  const designation = text(target?.designation);
  if (designation) return designation;
  const title = text(target?.title);
  for (const separator of TITLE_SEPARATORS) {
    const at = title.indexOf(separator);
    if (at > 0) return title.slice(0, at).trim();
  }
  return title || text(target?.name) || text(target?.id);
}

/** Its common name, from its title, or `null` when it has none of its own. */
export function multiNightTargetCommonName(target) {
  const name = multiNightTargetLabel(target);
  let title =
    text(target?.title) ||
    text(target?.commonName) ||
    (Array.isArray(target?.commonNames) ? text(target.commonNames[0]) : "");
  for (const separator of TITLE_SEPARATORS) {
    const at = title.indexOf(separator);
    if (at > 0) {
      title = title.slice(at + separator.length).trim();
      break;
    }
  }
  return !title || title === name ? null : title;
}

/** The `target` of a multi-night plan for a planner target. */
export function multiNightTargetDocument(target) {
  const name = multiNightTargetLabel(target);
  if (!name) return null;
  const commonName = multiNightTargetCommonName(target);
  const framingId = text(target?.framingId);
  if (framingId)
    return { framingId, name, ...(commonName ? { commonName } : {}) };
  const targetId = text(target?.id);
  if (!targetId) return null;
  return { targetId, name, ...(commonName ? { commonName } : {}) };
}

/** The name of a place, else its locality, else its coordinates. */
export function multiNightPlaceLabel(location) {
  if (!location || typeof location !== "object") return "";
  for (const key of ["name", "locality"]) {
    const value = text(location[key]);
    if (value) return value;
  }
  const latitude = number(location.latitude);
  const longitude = number(location.longitude);
  if (latitude === null || longitude === null) return "";
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

/** The `place` of a multi-night plan from a plan's `location`. */
export function multiNightPlaceFromLocation(location) {
  if (!location || typeof location !== "object") return null;
  const latitude = number(location.latitude);
  const longitude = number(location.longitude);
  if (
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null;
  const timeZone = text(location.timeZone);
  const place = {
    name: multiNightPlaceLabel(location),
    latitude,
    longitude,
    ...(timeZone ? { timeZone } : {}),
  };
  if (location.horizonMask && typeof location.horizonMask === "object") {
    const mask = normaliseHorizonMask(location.horizonMask);
    place.horizonMask = { enabled: mask.enabled === true, points: mask.points };
  }
  return place;
}

/** The constraints a plan carries, in the numbers the contract wants. */
export function multiNightConstraintsFromPlan(plan) {
  const byFilter = plan?.moonSeparationMinimumByFilter;
  const filters = {};
  if (byFilter && typeof byFilter === "object")
    for (const [name, value] of Object.entries(byFilter))
      if (name && number(value) !== null)
        filters[name] = clamp(number(value), 0, 180);
  return {
    minAltitude: clamp(number(plan?.minAltitude) ?? 30, 0, 90),
    moonSeparationMinimum: clamp(
      number(plan?.moonSeparationMinimum) ?? 25,
      0,
      180,
    ),
    moonSeparationMinimumByFilter: filters,
  };
}

/**
 * The body of `PUT /api/v1/projects/{id}` for a new multi-night plan
 * following `target` of `plan`: its place, equipment and constraints, and
 * `goalMinutes`. `null` without a place or a target identity.
 */
export function multiNightDocumentFromPlan({ plan, target, goalMinutes }) {
  const targetDocument = multiNightTargetDocument(target);
  const place = multiNightPlaceFromLocation(plan?.location);
  if (!targetDocument || !place) return null;
  return {
    target: targetDocument,
    goalMinutes: clamp(Math.round(goalMinutes), 30, 6000),
    place,
    equipment:
      plan?.equipment && typeof plan.equipment === "object"
        ? structuredClone(plan.equipment)
        : {},
    constraints: multiNightConstraintsFromPlan(plan),
  };
}

/** The writable part of a resource: what `PUT` takes back. */
export function multiNightWriteBody(project, changes = {}) {
  const { target, goalMinutes, place, equipment, constraints } = project;
  return { target, goalMinutes, place, equipment, constraints, ...changes };
}

/** `items` with each item of `projectIdByItemId` following its multi-night plan. */
export function itemsLinkedTo(items, projectIdByItemId) {
  return (items || []).map((item) =>
    projectIdByItemId[item?.id]
      ? { ...item, projectId: projectIdByItemId[item.id] }
      : item,
  );
}

/** `items` with the item `itemId` no longer following any multi-night plan. */
export function itemsDetached(items, itemId) {
  return (items || []).map((item) => {
    if (item?.id !== itemId) return item;
    const { projectId: _projectId, ...rest } = item;
    return rest;
  });
}

/** Whether a plan item follows the multi-night plan `projectId`. */
export const itemFollows = (item, projectId) =>
  Boolean(item && typeof item === "object" && item.projectId === projectId);

/** Whether a plan item is the target of `project`. */
export function itemIsProjectTarget(item, project) {
  const target = project?.target || {};
  if (text(target.framingId))
    return (
      item?.framingId === target.framingId || item?.id === target.framingId
    );
  return (
    Boolean(text(target.targetId)) &&
    (item?.id === target.targetId || item?.target?.id === target.targetId)
  );
}

/** Whether a plan's place differs from a multi-night plan's (about 100 m). */
export function multiNightPlaceDiffers(location, project) {
  const place = project?.place;
  const latitude = number(location?.latitude);
  const longitude = number(location?.longitude);
  const otherLatitude = number(place?.latitude);
  const otherLongitude = number(place?.longitude);
  if ([latitude, longitude, otherLatitude, otherLongitude].includes(null))
    return true;
  return (
    Math.abs(latitude - otherLatitude) > 0.001 ||
    Math.abs(longitude - otherLongitude) > 0.001
  );
}

/** Whether a plan's equipment differs from a multi-night plan's. */
export function multiNightEquipmentDiffers(equipment, project) {
  const mine = equipment && typeof equipment === "object" ? equipment : {};
  const theirs =
    project?.equipment && typeof project.equipment === "object"
      ? project.equipment
      : {};
  for (const key of [
    "mode",
    "telescopeId",
    "cameraId",
    "eyepieceId",
    "modifierId",
  ])
    if (String(mine[key] ?? "") !== String(theirs[key] ?? "")) return true;
  const filters = (value) =>
    new Set(Array.isArray(value.filterIds) ? value.filterIds.map(String) : []);
  const a = filters(mine);
  const b = filters(theirs);
  return a.size !== b.size || [...b].some((id) => !a.has(id));
}

/** "35" — the whole percent acquired of the goal. */
export const multiNightPercent = (acquired, goal) =>
  goal <= 0 ? 0 : clamp(Math.round((acquired / goal) * 100), 0, 100);

const dateOf = (iso) => new Date(`${iso}T12:00:00Z`);

/** "sam. 17 oct." */
export function multiNightShortDate(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** "Sam. 20 juin" — the same, capitalised, for a line that starts with it. */
export function multiNightLineDate(locale, iso) {
  const value = multiNightShortDate(locale, iso);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** "5 novembre", "28 septembre" — a day and its month. */
export function multiNightDayMonth(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** "5 nov.", "28 sept." */
export function multiNightDayMonthShort(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** "lundi 28 septembre" */
export function multiNightLongDate(locale, iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(dateOf(iso));
}

/** "mi-janvier", "early January", "1月中旬". */
export function multiNightMonthPart(locale, iso) {
  const day = dateOf(iso);
  if (Number.isNaN(day.getTime())) return iso;
  const month = new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
  }).format(day);
  const part =
    day.getUTCDate() <= 10 ? "early" : day.getUTCDate() <= 20 ? "mid" : "late";
  return choose(locale, "monthPart", part, { month });
}

/** The season line of a card, from `seasonWindow`'s result (or `null`). */
export function multiNightSeasonLine(locale, season) {
  if (!season) return say(locale, "seasonUnknown");
  if (season.state === "none") return say(locale, "outOfSeason");
  if (season.state === "continues")
    return say(locale, "seasonBeyond", {
      when: multiNightMonthPart(locale, season.nights.at(-1)?.date),
    });
  const weeks = Number(season.weeksLeft) || 0;
  if (weeks <= multiNightWeeksShown)
    return say(locale, "weeksLeft", { count: weeks });
  return say(locale, "seasonUntil", {
    when: multiNightMonthPart(locale, season.workableUntil),
  });
}

/**
 * The civil date of `now` at `place` (`YYYY-MM-DD`): "ce soir" is the place's
 * evening, whatever the zone of this browser — its time zone, else its
 * longitude. Without a place, the browser's own date.
 */
export function multiNightCivilDate(now = new Date(), place = null) {
  if (place) return placeCivilDate(new Date(now).getTime(), place);
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --------------------------------------------------------------- progress

/**
 * A planner plan's status in the words `projectProgress` reads. A plan still
 * pending whose night is past was run (or not) without being debriefed: it
 * reads "À débriefer", never as a night to come.
 */
function progressStatus(plan, today = null) {
  if (plan?.archivedAt || plan?.status === "archived") return "archived";
  const status = typeof plan?.status === "string" ? plan.status : "pending";
  if (
    status === "pending" &&
    today &&
    typeof plan?.date === "string" &&
    plan.date < today
  )
    return "past";
  return status;
}

/** When the dark night of a plan still ahead starts, or `null`. */
function plannedNightStart(plan) {
  if (progressStatus(plan) !== "pending") return null;
  try {
    return (
      projectNight({
        date: plan.date,
        place: plan.location,
        darkness: plan.darkness,
        plans: [],
      })?.start ?? null
    );
  } catch {
    return null;
  }
}

/**
 * The view of one multi-night plan: the resource, its progress, the plans
 * of its nights (by id), the next night planned from `today`, and how many
 * past nights wait for their debriefing. `plans` are the planner's plans;
 * `summaries` the debriefing summaries of their nights, by plan id.
 */
export function multiNightView({ project, plans = [], summaries = {}, today }) {
  const linked = plans.filter((plan) =>
    (plan?.items || []).some((item) => itemFollows(item, project.id)),
  );
  const progress = projectProgress({
    project: { id: project.id, goalMinutes: project.goalMinutes },
    plans: linked.map((plan) => {
      const start = plannedNightStart(plan);
      return {
        id: plan.id,
        date: plan.date,
        status: progressStatus(plan, today),
        ...(start ? { nightStartAt: start } : {}),
        items: plan.items,
      };
    }),
    summaries: linked
      .filter((plan) => summaries[plan.id])
      .map((plan) => ({ planId: plan.id, summary: summaries[plan.id] })),
  });
  const nextNight =
    progress.nights.find(
      (night) =>
        night.state === "planned" &&
        typeof night.date === "string" &&
        night.date >= today,
    ) || null;
  return {
    project,
    progress,
    plansById: Object.fromEntries(linked.map((plan) => [plan.id, plan])),
    nextNight,
    toDebrief: progress.nights.filter((night) => night.state === "undebriefed")
      .length,
  };
}

/**
 * A multi-night plan is "En cours" once one of its nights has passed or begun —
 * a night run (debriefed or not), or a planned night whose date is over or
 * whose astronomical night has started —, "À venir" before its first night.
 */
export function multiNightHasBegun(view, now = Date.now()) {
  for (const night of view?.progress?.nights ?? []) {
    if (night.state !== "planned") return true;
    if (typeof night.date !== "string") continue;
    const plan = view.plansById?.[night.planId];
    const left = planTimeLeft({
      date: night.date,
      location: plan?.location ?? view.project?.place ?? null,
      now,
    });
    if (left === null || left.kind === "started") return true;
  }
  return false;
}

/**
 * The lines of a card: "35 % acquired · 7 h 50 left" ("No hour
 * acquired" before the first night) and the rest; the next night with its
 * place and the time left before it: "Next night Sat 17 Oct · Col des
 * Mélèzes · in 3 days", "First night …" before the first.
 */
export function multiNightCardLines(locale, view, season, now = Date.now()) {
  const { progress } = view;
  const begun = multiNightHasBegun(view, now);
  const nextPlan = view.nextNight
    ? view.plansById?.[view.nextNight.planId]
    : null;
  const timeLeft = view.nextNight
    ? planTimeLeftText(
        locale,
        planTimeLeft({
          date: view.nextNight.date,
          location: nextPlan?.location ?? view.project?.place ?? null,
          now,
        }),
      )
    : null;
  const place = text(view.project?.place?.name);
  return {
    title: say(locale, "cardTitle", {
      target: view.project.target?.name || "",
      acquired: multiNightDuration(locale, progress.acquiredMinutes),
      goal: multiNightDuration(locale, progress.goalMinutes),
    }),
    commonName: view.project.target?.commonName || null,
    percent: multiNightPercent(progress.acquiredMinutes, progress.goalMinutes),
    acquiredRemaining:
      begun || progress.acquiredMinutes > 0
        ? say(locale, "acquiredRemaining", {
            percent: multiNightPercent(
              progress.acquiredMinutes,
              progress.goalMinutes,
            ),
            remaining: multiNightDuration(locale, progress.remainingMinutes),
          })
        : say(locale, "noHoursYet"),
    toDebrief: view.toDebrief
      ? say(locale, "toDebrief", { count: view.toDebrief })
      : null,
    next: view.nextNight
      ? [
          say(locale, begun ? "nextNightAt" : "firstNightAt", {
            date: multiNightShortDate(locale, view.nextNight.date),
            place,
          }).replace(/ · $/, ""),
          timeLeft,
        ]
          .filter(Boolean)
          .join(" · ")
      : say(locale, "noNight"),
    season: multiNightSeasonLine(locale, season),
  };
}

// ----------------------------------------------------------------- season

/** The filter names of a multi-night plan's equipment. */
export function multiNightFilters(project) {
  const ids = project?.equipment?.filterIds;
  return Array.isArray(ids) ? [...ids] : [];
}

/**
 * The planner target of a multi-night plan (its coordinate above all), from
 * what the planner holds: the framing it follows, a night already planned
 * for it, the planner's own targets. `null` when none of them has it.
 */
export function multiNightPlannerTarget({
  project,
  plans = [],
  framings = [],
  targets = [],
}) {
  const target = project?.target || {};
  if (text(target.framingId)) {
    const framing = framings.find((entry) => entry?.id === target.framingId);
    const saved = framing?.payload?.target;
    if (saved?.coordinate) return { ...saved, framingId: target.framingId };
  }
  for (const plan of plans)
    for (const item of plan?.items || [])
      if (
        (itemFollows(item, project.id) || itemIsProjectTarget(item, project)) &&
        item?.target?.coordinate
      )
        return item.target;
  if (text(target.targetId)) {
    const known =
      targets.find((entry) => entry?.id === target.targetId) ||
      rememberedTargets()[target.targetId];
    if (known?.coordinate) return known;
  }
  return null;
}

const REMEMBERED_KEY = "astro-portal:multi-night:targets:v1";

/** The catalogue targets chosen for a multi-night plan in this browser. */
export function rememberedTargets() {
  try {
    const stored = JSON.parse(
      globalThis.localStorage?.getItem(REMEMBERED_KEY) || "{}",
    );
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

/**
 * Keeps the coordinate of a target chosen from the catalogue (whose right
 * ascension the catalogue gives in hours), so that its season can be worked
 * out before any night is planned for it.
 */
export function rememberTarget(target) {
  const ra = number(target?.coordinate?.ra);
  const dec = number(target?.coordinate?.dec);
  if (!text(target?.id) || ra === null || dec === null) return;
  const degrees = target.coordinateUnit === "degrees" ? ra : ra * 15;
  try {
    const stored = rememberedTargets();
    stored[target.id] = {
      id: target.id,
      designation: multiNightTargetLabel(target),
      coordinate: { ra: degrees, dec },
      coordinateUnit: "degrees",
    };
    globalThis.localStorage?.setItem(REMEMBERED_KEY, JSON.stringify(stored));
  } catch {
    // Without storage, the season waits for a planned night.
  }
}

/**
 * The Moon's limit of a multi-night plan as its season and its calendar
 * apply it: "Lune à moins de 30° exclue" — the most tolerant of its
 * filters, else the plan's own separation. The Moon is limited by its
 * distance to the target, never by its illumination (question 2).
 */
export function multiNightMoonRule(locale, project) {
  return seasonMoonRule(locale, {
    constraints: project?.constraints || {},
    filters: multiNightFilters(project),
  });
}

/** The season of a multi-night plan from `from`, or `null`. */
export function multiNightSeason({
  project,
  target,
  from,
  nights = multiNightSeasonNights,
}) {
  if (!target) return null;
  try {
    return seasonWindow({
      target,
      place: project.place,
      constraints: project.constraints,
      filters: multiNightFilters(project),
      from,
      nights,
    });
  } catch {
    return null;
  }
}

/**
 * Why the season ends after the night before `dayAfter`: `mask` when the
 * place's horizon mask is what takes the night below the threshold, `low`
 * when the target is too low anyway.
 */
export function multiNightSeasonEndCause({ project, target, dayAfter }) {
  return seasonEndCause({
    place: project?.place,
    target,
    constraints: project?.constraints,
    filters: multiNightFilters(project),
    dayAfter,
  });
}

/**
 * The night "Planifier la prochaine nuit" proposes: the first night of the
 * season with at least an hour, and no night of the plan on that date.
 */
export function multiNightNextWorkableDate(season, takenDates = []) {
  if (!season) return null;
  const taken = new Set(takenDates);
  return (
    season.nights.find(
      (night) =>
        night.usableMinutes >= multiNightNextNightMinimumMinutes &&
        !taken.has(night.date),
    )?.date ?? null
  );
}

/**
 * The plan "Planifier la prochaine nuit" (or "Planifier <cible> cette
 * nuit") starts: the multi-night plan's place, equipment and constraints on
 * `date`, with its target alone, following it, for `durationMinutes`.
 */
export function multiNightNextNightPlan({
  project,
  target,
  date,
  durationMinutes,
}) {
  const place = project.place || {};
  const rules = project.constraints || {};
  const framingId = text(project.target?.framingId) || text(target?.framingId);
  const item = {
    id: framingId || text(target?.id) || text(project.target?.targetId),
    durationMinutes: clamp(Math.round(durationMinutes), 30, 720),
    filter: "",
    ...(target ? { target } : {}),
    ...(framingId ? { framingId } : {}),
    projectId: project.id,
  };
  return {
    date,
    name: project.target?.name || multiNightTargetLabel(target),
    location: {
      ...place,
      locality: place.name,
      elevation: "0",
    },
    settings: {
      equipment: structuredClone(project.equipment || {}),
      minAltitude: rules.minAltitude ?? 30,
      moonSeparationMinimum: rules.moonSeparationMinimum ?? 25,
      moonSeparationMinimumByFilter: structuredClone(
        rules.moonSeparationMinimumByFilter || {},
      ),
    },
    items: [item],
  };
}

/** Whether the time of `iso` is in the plan's place zone, "20:55". */
export function multiNightClock(iso, timeZone) {
  if (!iso) return "";
  return clockText(iso, timeZone || "UTC");
}

/** "Faite · 2 h 40", "Partielle · 1 h 30 · nuages après 23:10"… */
export function multiNightNightLine(locale, night, timeZone) {
  const parts = [];
  if (["done", "partial"].includes(night.state))
    parts.push(multiNightDuration(locale, night.acquiredMinutes));
  if (night.state === "planned" || night.state === "undebriefed")
    parts.push(
      say(locale, "plannedLine", {
        duration: multiNightDuration(locale, night.plannedMinutes),
      }),
    );
  if (night.state === "planned" && night.start && night.end)
    parts.push(
      `${multiNightClock(night.start, timeZone)} → ${multiNightClock(night.end, timeZone)}`,
    );
  const cause = (night.causes || []).find(
    (entry) => entry.cause !== "unexplained",
  );
  if (cause && ["partial", "lost"].includes(night.state)) {
    const name = causeLabelInSentence(locale, cause.cause);
    parts.push(
      night.state === "partial" && cause.from
        ? say(locale, "after", {
            cause: name,
            time: multiNightClock(cause.from, timeZone),
          })
        : name,
    );
  }
  return parts;
}

// ---------------------------------------------------------------- calendar

/**
 * The first page of "Nuits à venir": from tonight to the night after the
 * next new Moon (illumination under 15 %, at least three nights ahead), at
 * most `nights` nights computed.
 */
export function multiNightCalendarFirstPage(nights) {
  for (let index = 3; index < nights.length; index += 1)
    if (
      nights[index].moonIllumination < 15 &&
      (index + 1 >= nights.length ||
        nights[index + 1].moonIllumination >= nights[index].moonIllumination)
    )
      return { count: Math.min(nights.length, index + 2), newMoon: true };
  return { count: Math.min(nights.length, 14), newMoon: false };
}

/**
 * The forecast word of a night from the daily weather code of the planner's
 * forecast: 0–1 clear, 2 and showers uncertain, anything else overcast;
 * `none` beyond the forecast or without one.
 */
export function multiNightForecastWord(code) {
  const value = number(code);
  if (value === null) return "none";
  if (value <= 1) return "clear";
  if (
    value === 2 ||
    (value >= 80 && value <= 82) ||
    value === 85 ||
    value === 86
  )
    return "uncertain";
  return "overcast";
}

/** The Moon of a night line: absent, up from the evening, rising, setting. */
export function multiNightMoonState(night) {
  const up = night.moonUp || [];
  if (!up.length) return { state: "absent" };
  const first = up[0];
  if (Date.parse(first.start) <= Date.parse(night.start))
    return Date.parse(first.end) >= Date.parse(night.end)
      ? { state: "evening" }
      : { state: "sets", at: first.end };
  return { state: "rises", at: first.start };
}

/** The sentence a night line is read as (its `aria-label`). */
export function multiNightRowLabel(locale, night, projects, timeZone) {
  const copy = multiNightCopy(locale);
  const clock = (iso) => multiNightClock(iso, timeZone);
  const moon = multiNightMoonState(night);
  const parts = [
    say(locale, "rowDark", {
      start: clock(night.start),
      end: clock(night.end),
    }),
    choose(locale, "rowMoon", moon.state, {
      percent: Math.round(night.moonIllumination),
      time: clock(moon.at),
    }),
  ];
  let noneSaid = false;
  for (const project of projects) {
    const entry = night.projects.find((item) => item.projectId === project.id);
    const name = project.target?.name || "";
    if (!entry || !entry.windows.length) {
      parts.push(
        say(locale, noneSaid ? "rowNoWindowNext" : "rowNoWindowFirst", {
          target: name,
        }),
      );
      noneSaid = true;
      continue;
    }
    parts.push(
      [
        say(locale, "rowWindow", {
          target: name,
          start: clock(entry.windows[0].start),
          end: clock(entry.windows[0].end),
        }),
        ...entry.windows.slice(1).map((window) =>
          say(locale, "rowWindowMore", {
            start: clock(window.start),
            end: clock(window.end),
          }),
        ),
      ].join(" "),
    );
  }
  return parts.join(copy.rowSeparator) + copy.rowEnd;
}

/** Why no plan has a window that night (the reason of the first one). */
export function multiNightNoWindowReason(night) {
  if (night.projects.some((entry) => entry.windows.length)) return null;
  return night.projects.find((entry) => entry.reason)?.reason || "other";
}

// ---------------------------------------------------------------- progress

/** "20 juin, 0 h 15 · 15 sept. après 23:10, 0 h 55" — where a cause cost. */
export function multiNightLossNights(locale, loss, timeZone) {
  const several = loss.nights.length > 1;
  return loss.nights
    .map((night) => {
      const date = multiNightDayMonthShort(locale, night.date);
      const line =
        night.wholeNight && loss.cause !== "guiding"
          ? say(locale, "lossWhole", { date })
          : loss.cause === "guiding"
            ? say(locale, "lossRejected", { date })
            : night.from
              ? say(locale, "lossAfter", {
                  date,
                  time: multiNightClock(night.from, timeZone),
                })
              : date;
      return several
        ? say(locale, "lossWithDuration", {
            night: line,
            duration: multiNightDuration(locale, night.minutes),
          })
        : line;
    })
    .join(" · ");
}

/** The issue of a debriefed night, for the notice of "Avancement du plan". */
export function multiNightIssue(locale, night) {
  const issue = choose(locale, "issue", night?.state ?? "other");
  const cause = (night?.causes || []).find(
    (entry) => entry.cause !== "unexplained",
  );
  return cause && night.state !== "done"
    ? say(locale, "issueWithCause", {
        issue,
        cause: causeLabelInSentence(locale, cause.cause),
      })
    : issue;
}

/** The minutes one debriefed night adds to each multi-night plan it serves. */
export function multiNightNightAdds(items, summary) {
  const added = {};
  for (const entry of summary?.perTarget || []) {
    const item = (items || []).find(
      (candidate) => candidate?.id === entry.planItemId,
    );
    if (!item?.projectId) continue;
    added[item.projectId] =
      (added[item.projectId] || 0) +
      Math.max(0, Number(entry.acquiredMinutes) || 0);
  }
  return added;
}

export { projectDateAfter, projectDaysBetween };

// ------------------------------------------------------ assisted allocation

/**
 * How many coming nights the assisted allocation looks at: about two lunations.
 */
export const multiNightAllocationNights = 60;

/** The nights declared "Disponible", kept in this browser only. */
export const multiNightAvailableNightsKey =
  "astro-portal:multi-night:available-nights:v1";

/** The nights declared available from `today` on (`YYYY-MM-DD`). */
export function readAvailableNights(today) {
  try {
    const stored = JSON.parse(
      globalThis.localStorage?.getItem(multiNightAvailableNightsKey) || "[]",
    );
    return Array.isArray(stored)
      ? stored.filter((date) => typeof date === "string" && date >= today)
      : [];
  } catch {
    return [];
  }
}

/**
 * The planner's plans still to come as the rule reads them: pending, not
 * past, not debriefed by any multi-night plan of `views` — the nights
 * `projectProgress` calls planned — with the start of their dark night.
 */
export function multiNightAllocationPlans(plans, views, today) {
  const debriefed = new Set(
    views.flatMap((view) =>
      view.progress.nights
        .filter((night) => ["done", "partial", "lost"].includes(night.state))
        .map((night) => night.planId),
    ),
  );
  return (Array.isArray(plans) ? plans : [])
    .filter(
      (plan) =>
        progressStatus(plan, today) === "pending" && !debriefed.has(plan.id),
    )
    .map((plan) => {
      const start = plannedNightStart(plan);
      return {
        id: plan.id,
        date: plan.date,
        status: "pending",
        ...(start ? { nightStartAt: start } : {}),
        items: plan.items || [],
      };
    });
}

/**
 * The argument of `allocateRemainingHours` for the multi-night plans
 * followed at one place (`views`, their `seasons` by id), from the
 * calendar's `nights` (from `today`), the nights `available` and the daily
 * `weather` of the place (its first five nights only).
 */
export function multiNightAllocationInput({
  views,
  seasons = {},
  nights = [],
  available = [],
  weather = null,
  plans = [],
  today,
  now = new Date(),
}) {
  const declared = new Set(available);
  return {
    projects: views.map((view) => ({
      id: view.project.id,
      remainingMinutes: view.progress.remainingMinutes,
      season: {
        state: seasons[view.project.id]?.state ?? "continues",
        workableUntil: seasons[view.project.id]?.workableUntil ?? null,
      },
    })),
    nights: nights.map((night) => {
      const index = projectDaysBetween(today, night.date);
      const word =
        weather && index >= 0 && index < multiNightForecastNights
          ? multiNightForecastWord(weatherCodeForDate(weather, night.date))
          : "none";
      return {
        ...night,
        available: declared.has(night.date),
        forecast: word === "none" ? null : word,
      };
    }),
    plans: multiNightAllocationPlans(plans, views, today),
    now: now.toISOString(),
  };
}

/** One plan's part of an allocation: its summary and its rows, or `null`. */
export function multiNightAllocationOf(result, projectId) {
  const summary = result?.projects?.find(
    (entry) => entry.projectId === projectId,
  );
  if (!summary) return null;
  return {
    projectId,
    summary,
    rows: result.proposals.filter((row) => row.projectId === projectId),
    proposed: result.proposals.filter(
      (row) => row.projectId === projectId && row.status === "proposed",
    ),
  };
}

/** What the Moon sentence says of a plan's filters: `dual`, `narrow`, `other`. */
export function multiNightFilterKind(project) {
  const families = new Set(multiNightFilters(project).map(filterFamilyOf));
  if (families.has("dual")) return "dual";
  if (["ha", "oiii", "sii", "uhc", "hb"].some((family) => families.has(family)))
    return "narrow";
  return "other";
}

// `filterFamily` of the planner, by name only (the plan keeps filter ids).
function filterFamilyOf(filter) {
  const name = String(filter || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (
    /duo|dual|double.?band|bi.?band|tri.?band|quad.?band|l.extreme|l.enhance|sv220|sv240/.test(
      name,
    )
  )
    return "dual";
  if (/h.?alpha|hα|\bha\b/.test(name)) return "ha";
  if (/h.?beta|hβ|\bhb\b/.test(name)) return "hb";
  if (/o[ -]?(iii|3)/.test(name)) return "oiii";
  if (/s[ -]?(ii|2)/.test(name)) return "sii";
  if (/uhc/.test(name)) return "uhc";
  return null;
}

/**
 * Why a row is where it is: "Placée autour de la culmination, Lune
 * couchée", "Lune à 59 %, sans gêne en double bande", "Lune levée
 * jusqu’à 23:10, M33 prend la suite"…; `null` for a draft whose night is
 * not computed here.
 */
export function multiNightAllocationReason(
  locale,
  row,
  { names = {}, filterKind = "other", timeZone = null } = {},
) {
  const reason = row?.reason;
  if (!reason) return null;
  const percent = Math.round(Number(reason.moonIllumination) || 0);
  const next = reason.nextProjectId ? names[reason.nextProjectId] : null;
  if (next) {
    if (reason.moonUp && reason.moonSetsAt)
      return say(locale, "reasonMoonUntilNext", {
        time: multiNightClock(reason.moonSetsAt, timeZone),
        name: next,
      });
    if (reason.moonUp)
      return say(locale, "reasonMoonNext", { percent, name: next });
    return say(locale, "reasonDarkNext", { name: next });
  }
  if (reason.placement === "shortened")
    return say(locale, "reasonShortened", {
      duration: multiNightDuration(locale, row.durationMinutes),
    });
  if (reason.placement === "free-slot") return say(locale, "reasonFreeSlot");
  if (reason.moonUp)
    return say(
      locale,
      filterKind === "dual"
        ? "reasonMoonDual"
        : filterKind === "narrow"
          ? "reasonMoonNarrow"
          : "reasonMoonFar",
      { percent },
    );
  if (reason.moonUp === null || reason.moonUp === undefined) return null;
  return say(
    locale,
    reason.placement === "ideal" ? "reasonIdeal" : "reasonMoonDown",
  );
}

/** "10 et 17 oct.", "28 oct., 3 et 10 nov."; "10月10日、10月17日". */
export function multiNightDateList(locale, dates) {
  const days = dates
    .filter((date) => typeof date === "string")
    .map((date) => new Date(`${date}T12:00:00Z`))
    .filter((day) => Number.isFinite(day.getTime()));
  if (!days.length) return "";
  if (locale === "ja" || locale === "zh-Hans" || locale === "zh-Hant")
    return days
      .map((day) => `${day.getUTCMonth() + 1}月${day.getUTCDate()}日`)
      .join("、");
  const month = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  // German writes the day as an ordinal ("10. und 17. Okt.").
  const dayLabel = (day) =>
    locale === "de" ? `${day.getUTCDate()}.` : String(day.getUTCDate());
  const parts = days.map((day, index) => {
    const following = days[index + 1];
    const changes =
      !following ||
      following.getUTCMonth() !== day.getUTCMonth() ||
      following.getUTCFullYear() !== day.getUTCFullYear();
    return changes ? `${dayLabel(day)} ${month.format(day)}` : dayLabel(day);
  });
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")}${say(locale, "listAnd")}${parts.at(-1)}`;
}

/** "Nuits suivantes reproposées : 3 nuits de 2 h 30 à 3 h". */
export function multiNightAllocationTitle(locale, rows) {
  if (!rows.length) return say(locale, "allocationTitleEmpty");
  const minutes = rows.map((row) => Math.round(row.durationMinutes || 0));
  const shortest = Math.min(...minutes);
  const longest = Math.max(...minutes);
  return shortest === longest
    ? say(locale, "allocationTitleEven", {
        count: rows.length,
        duration: multiNightDuration(locale, shortest),
      })
    : say(locale, "allocationTitle", {
        count: rows.length,
        shortest: multiNightDuration(locale, shortest),
        longest: multiNightDuration(locale, longest),
      });
}

/** The sentences under the heading of the block, in order. */
export function multiNightAllocationSentences(locale, allocation) {
  const { summary } = allocation;
  if (summary.state === "nothing-to-place")
    return [say(locale, "allocationAllPlaced")];
  if (summary.state === "no-nights") return [say(locale, "allocationNoNights")];
  const remaining = multiNightDuration(locale, summary.remainingMinutes);
  return [
    summary.mode !== "declared"
      ? say(locale, "allocationNoneDeclared")
      : summary.seasonEnd
        ? say(locale, "allocationSpread", {
            remaining,
            date: multiNightDayMonth(locale, summary.seasonEnd),
          })
        : say(locale, "allocationSpreadOpen", { remaining }),
    ...(summary.state === "short"
      ? [
          say(locale, "allocationShort", {
            duration: multiNightDuration(locale, summary.shortMinutes),
          }),
        ]
      : []),
  ];
}

/**
 * The draft of a proposed row: the plan of "Planifier la prochaine nuit"
 * with its slot (from `row.startMinute` of the night, for its duration) and
 * the night of the multi-night computations (astronomical darkness, the
 * night the slot is counted from).
 */
export function multiNightDraftPlan({ project, target, row }) {
  const plan = multiNightNextNightPlan({
    project,
    target,
    date: row.date,
    durationMinutes: row.durationMinutes,
  });
  const durationMinutes = Math.max(5, Math.round(row.durationMinutes));
  return {
    ...plan,
    settings: { ...plan.settings, darkness: "astronomical" },
    items: plan.items.map((item) => ({
      ...item,
      ...(Number.isFinite(row.startMinute)
        ? {
            startMinute: row.startMinute,
            endMinute: row.startMinute + durationMinutes,
          }
        : {}),
      durationMinutes,
    })),
  };
}
