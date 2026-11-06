import { plannedItemPlacement } from "../item-placement.js";
import { seasonDefaultMinimumMinutes } from "../season-window.js";

// The assisted allocation of the remaining hours of the multi-night plans
// ("plans multi-nuits", sold with `planner.mosaic`): from the nights the
// observer declared available, or without any the clearest workable nights,
// where to put what is still to acquire. Nothing is stored: the proposals
// are recomputed from the plans, their progress and the calendar every time
// they are read, and nothing becomes a plan until the observer asks for it.
// Every placement says why it is where it is. Pure, offline and
// deterministic.

/** Every share, start and end falls on five minutes of the clock. */
export const allocationStepMinutes = 5;

/** Without a declared night, a night must hold at least this much ("au moins 3 h"). */
export const allocationClearestMinimumMinutes = seasonDefaultMinimumMinutes;

/** A declared night shorter than this for a plan is not proposed, and a remainder is never cut into shares smaller than this. */
export const allocationMinimumShareMinutes = 30;

const MINUTE_MS = 60000;
const STEP = allocationStepMinutes;
const PENDING_STATUSES = new Set(["pending", "active"]);
const NO_SEASON_END = "9999-12-31";

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Ordinal comparison (UTF-16 code units).
function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const validDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** An instant as whole minutes since the epoch, `null` when it is not one. */
function epochMinute(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.round(ms / MINUTE_MS) : null;
}

const instantOf = (minute) => new Date(minute * MINUTE_MS).toISOString();
const floorStep = (minute) => Math.floor(minute / STEP) * STEP;
const ceilStep = (minute) => Math.ceil(minute / STEP) * STEP;

/** An item's slot in minutes from its night's start, `[start, end]` or null (as `projectProgress`). */
function itemSlot(item) {
  const start = finiteNumber(item?.startMinute);
  const end = finiteNumber(item?.endMinute);
  const duration = finiteNumber(item?.durationMinutes);
  if (start !== null && start >= 0) {
    if (end !== null && end >= start) return [start, end];
    if (duration !== null && duration > 0) return [start, start + duration];
    return [start, start];
  }
  return null;
}

function itemPlannedMinutes(item) {
  const slot = itemSlot(item);
  if (slot) return Math.round(slot[1] - slot[0]);
  const duration = finiteNumber(item?.durationMinutes);
  return duration !== null && duration > 0 ? Math.round(duration) : 0;
}

function intervals(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => ({
      start: epochMinute(entry?.start),
      end: epochMinute(entry?.end),
    }))
    .filter(
      (entry) =>
        entry.start !== null && entry.end !== null && entry.end > entry.start,
    );
}

function readNights(nights) {
  const byDate = new Map();
  for (const night of Array.isArray(nights) ? nights : []) {
    if (!validDate(night?.date) || byDate.has(night.date)) continue;
    const start = epochMinute(night.start);
    const end = epochMinute(night.end);
    if (start === null || end === null || end <= start) continue;
    const projects = new Map();
    for (const entry of Array.isArray(night.projects) ? night.projects : []) {
      if (typeof entry?.projectId !== "string" || projects.has(entry.projectId))
        continue;
      projects.set(entry.projectId, {
        windows: intervals(entry.windows),
        peak: epochMinute(entry.peak),
      });
    }
    byDate.set(night.date, {
      date: night.date,
      start,
      end,
      moonIllumination: finiteNumber(night.moonIllumination),
      moonUp: intervals(night.moonUp),
      available: night.available === true,
      forecast: typeof night.forecast === "string" ? night.forecast : null,
      projects,
    });
  }
  return [...byDate.values()].sort((left, right) =>
    compareText(left.date, right.date),
  );
}

function readPlans(plans, nightByDate) {
  const result = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    if (typeof plan?.id !== "string" || !validDate(plan.date)) continue;
    const status = typeof plan.status === "string" ? plan.status : "pending";
    if (!PENDING_STATUSES.has(status)) continue;
    const base =
      epochMinute(plan.nightStartAt) ??
      nightByDate.get(plan.date)?.start ??
      null;
    const items = [];
    for (const item of Array.isArray(plan.items) ? plan.items : []) {
      if (!item || typeof item !== "object") continue;
      const slot = itemSlot(item);
      items.push({
        projectId: typeof item.projectId === "string" ? item.projectId : null,
        minutes: itemPlannedMinutes(item),
        interval:
          base !== null && slot && slot[1] > slot[0]
            ? {
                start: Math.floor(base + slot[0]),
                end: Math.ceil(base + slot[1]),
              }
            : null,
      });
    }
    result.push({ id: plan.id, date: plan.date, items });
  }
  return result.sort(
    (left, right) =>
      compareText(left.date, right.date) || compareText(left.id, right.id),
  );
}

function readProjects(projects) {
  const seen = new Set();
  const result = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    if (typeof project?.id !== "string" || !project.id || seen.has(project.id))
      continue;
    seen.add(project.id);
    const state = project.season?.state;
    const workableUntil = validDate(project.season?.workableUntil)
      ? project.season.workableUntil
      : null;
    result.push({
      id: project.id,
      remainingMinutes: Math.max(
        0,
        Math.round(finiteNumber(project.remainingMinutes) ?? 0),
      ),
      outOfSeason: state === "none",
      seasonEnd: state === "ends" ? workableUntil : null,
    });
  }
  return result;
}

/**
 * The night as the single-night cascade reads it, every edge on five
 * minutes of the clock: the night widened to them, the usable windows
 * narrowed to them, what is already taken widened to them — so that every
 * start, end and duration the cascade gives is on five minutes too.
 */
function cascadeNight(night, entry, busy) {
  const start = floorStep(night.start);
  const end = ceilStep(night.end);
  const windows = entry.windows
    .map((window) => ({
      start: ceilStep(window.start),
      end: floorStep(window.end),
    }))
    .filter((window) => window.end > window.start);
  // The target's altitude drawn as a peak at its culmination: the interval
  // of highest mean altitude is the one centred on it, pushed inwards by
  // the window's edges — the cascade's `ideal`.
  const series =
    entry.peak === null
      ? []
      : [
          { time: instantOf(entry.peak - 720), altitude: 0 },
          { time: instantOf(entry.peak), altitude: 90 },
          { time: instantOf(entry.peak + 720), altitude: 0 },
        ];
  return {
    start,
    end,
    card: {
      target: { id: "allocation" },
      visibilityWindows: windows.map((window) => ({
        start: instantOf(window.start),
        end: instantOf(window.end),
      })),
      series,
    },
    night: { start: instantOf(start), end: instantOf(end) },
    items: busy.map((interval, index) => ({
      id: `taken-${index}`,
      startMinute: floorStep(interval.start) - start,
      endMinute: ceilStep(interval.end) - start,
    })),
  };
}

function place(context, minutes) {
  const result = plannedItemPlacement({
    card: context.card,
    night: context.night,
    items: context.items,
    gridMinutes: STEP,
    recommendedMinutes: minutes,
    minimumMinutes: STEP,
  });
  if (result.reason === "overlap-fallback") return null;
  return {
    start: context.start + Math.round(result.startMinute),
    durationMinutes: Math.round(result.durationMinutes),
    reason: result.reason,
  };
}

/**
 * The remaining units (of five minutes) spread evenly over `nights` (in
 * date order), the earliest nights taking the rounding; a night that cannot
 * hold its share keeps what it can (`wanted` remembers the share it was
 * asked for) and the rest is spread again over the others.
 */
function spread(units, nights) {
  const shares = new Map();
  let open = nights.slice();
  let left = units;
  while (open.length && left > 0) {
    const base = Math.floor(left / open.length);
    const extra = left % open.length;
    const asked = open.map((night, index) => base + (index < extra ? 1 : 0));
    const over = open.filter((night, index) => asked[index] > night.units);
    if (!over.length) {
      open.forEach((night, index) =>
        shares.set(night.date, { units: asked[index], wanted: asked[index] }),
      );
      left = 0;
      break;
    }
    open.forEach((night, index) => {
      if (asked[index] <= night.units) return;
      shares.set(night.date, { units: night.units, wanted: asked[index] });
      left -= night.units;
    });
    open = open.filter((night) => !over.includes(night));
  }
  return { shares, short: left };
}

function moonOf(night, start, end) {
  if (!night || start === null || end === null)
    return { up: null, illumination: null, setsAt: null };
  const up = night.moonUp.find(
    (interval) => interval.start < end && interval.end > start,
  );
  return {
    up: Boolean(up),
    illumination: night.moonIllumination,
    setsAt: up && up.end < night.end ? instantOf(up.end) : null,
  };
}

/**
 * Arguments:
 *
 * - `projects`: the multi-night plans followed at one place, `[{ id,
 *   remainingMinutes, season: { state, workableUntil } }]` —
 *   `remainingMinutes` the goal less what was acquired (`projectProgress`),
 *   `season` what `seasonWindow` says of its season;
 * - `nights`: the coming nights at that place as `multiNightCalendar` gives
 *   them (`date`, `start`, `end`, `moonIllumination`, `moonUp`, `projects:
 *   [{ projectId, windows, peak }]`), each with `available` (declared
 *   "Disponible" by the observer) and `forecast` (`clear`, `uncertain`,
 *   `overcast`, or `null` beyond the forecast);
 * - `plans`: the night plans still to come (`pending`/`active`, not yet
 *   debriefed: the nights `projectProgress` calls planned), `[{ id, date,
 *   status, nightStartAt?, items }]`, whatever plan they follow — every
 *   item with a slot is time already taken that night;
 * - `now`: the instant of the computation (ISO-8601); a night whose dark
 *   night has begun is not proposed.
 *
 * The rule, every step stated by a reason:
 *
 * - **to place** = remaining − the minutes of the plan's nights still to
 *   come; a night that already holds one of them ("Brouillon existant")
 *   is counted and never touched;
 * - **order**: the plan that leaves its season first is placed first (then
 *   the larger remainder, then the id); later plans see the time the
 *   earlier ones took;
 * - **candidate nights**: the nights declared available, before the plan's
 *   season end, holding at least `allocationMinimumShareMinutes` for it;
 *   with no night declared at all, the nights not forecast `overcast`
 *   holding at least `allocationClearestMinimumMinutes`, the largest first,
 *   as few as can take the remainder;
 * - **spread**: evenly over the candidates, on five minutes, the earliest
 *   nights taking the rounding, each share bounded by the longest free
 *   stretch of the plan's usable windows that night; what a night cannot
 *   hold goes to the others; a remainder is never cut into shares under
 *   `allocationMinimumShareMinutes` (fewer nights then);
 * - **placement**: the single-night cascade `plannedItemPlacement` —
 *   around the culmination (`ideal`), else the free slot nearest to it
 *   (`free-slot`), shortened when the night holds less than its share
 *   (`shortened`); never an overlap;
 * - **short**: what the nights cannot hold.
 *
 * Returns `{ proposals, projects, remainingMinutes, shortMinutes }`:
 *
 * - `proposals`: the rows, by plan (in the order above) then date then
 *   start: `{ projectId, date, status: "existing" | "proposed", planId,
 *   start, end, startMinute, durationMinutes, reason: { placement:
 *   "existing" | "ideal" | "free-slot" | "shortened", wantedMinutes,
 *   moonUp, moonIllumination, moonSetsAt, nextProjectId } }` — `startMinute`
 *   from the night's start (`null` with no slot or no night), `wantedMinutes`
 *   the share a shortened night was asked for, the Moon during the slot
 *   (`moonSetsAt` when it sets during the night), `nextProjectId` the plan
 *   whose slot follows this one that night;
 * - `projects`: per plan, `{ projectId, mode: "declared" | "clearest",
 *   state: "proposals" | "short" | "nothing-to-place" | "no-nights",
 *   remainingMinutes, plannedMinutes, toPlaceMinutes, proposedMinutes,
 *   shortMinutes, seasonEnd }`;
 * - `remainingMinutes`/`shortMinutes`: the sums of `toPlaceMinutes` and
 *   `shortMinutes`.
 */
export function allocateRemainingHours({
  projects = [],
  nights = [],
  plans = [],
  now,
} = {}) {
  const nowMs = typeof now === "string" ? Date.parse(now) : Number.NaN;
  const nowMinute = Number.isFinite(nowMs) ? nowMs / MINUTE_MS : null;
  const calendar = readNights(nights);
  const nightByDate = new Map(calendar.map((night) => [night.date, night]));
  const pending = readPlans(plans, nightByDate);
  const declared = calendar.some((night) => night.available);
  const today =
    calendar.find((night) => nowMinute === null || night.end > nowMinute)
      ?.date ?? null;
  const begun = (night) => nowMinute !== null && night.start <= nowMinute;

  const taken = new Map();
  const takeTime = (date, interval) => {
    if (!taken.has(date)) taken.set(date, []);
    taken.get(date).push(interval);
  };
  for (const plan of pending)
    for (const item of plan.items)
      if (item.interval) takeTime(plan.date, item.interval);

  const entries = readProjects(projects).map((project) => {
    const planned = pending.reduce(
      (sum, plan) =>
        sum +
        plan.items
          .filter((item) => item.projectId === project.id)
          .reduce((total, item) => total + item.minutes, 0),
      0,
    );
    return {
      ...project,
      plannedMinutes: planned,
      toPlaceMinutes: Math.max(0, project.remainingMinutes - planned),
      dates: new Set(
        pending
          .filter((plan) =>
            plan.items.some((item) => item.projectId === project.id),
          )
          .map((plan) => plan.date),
      ),
    };
  });
  entries.sort(
    (left, right) =>
      compareText(
        left.outOfSeason ? NO_SEASON_END : (left.seasonEnd ?? NO_SEASON_END),
        right.outOfSeason ? NO_SEASON_END : (right.seasonEnd ?? NO_SEASON_END),
      ) ||
      right.toPlaceMinutes - left.toPlaceMinutes ||
      compareText(left.id, right.id),
  );

  const rows = [];
  const summaries = [];
  for (const project of entries) {
    const minimum = declared
      ? allocationMinimumShareMinutes
      : allocationClearestMinimumMinutes;
    const candidates = [];
    if (!project.outOfSeason)
      for (const night of calendar) {
        if (begun(night) || project.dates.has(night.date)) continue;
        if (project.seasonEnd !== null && night.date > project.seasonEnd)
          continue;
        if (declared ? !night.available : night.forecast === "overcast")
          continue;
        const entry = night.projects.get(project.id);
        if (!entry || !entry.windows.length) continue;
        const context = cascadeNight(night, entry, taken.get(night.date) ?? []);
        const capacity =
          place(context, context.end - context.start)?.durationMinutes ?? 0;
        if (capacity < minimum) continue;
        candidates.push({
          date: night.date,
          night,
          context,
          capacity,
          units: Math.floor(capacity / STEP),
        });
      }

    const units = Math.ceil(project.toPlaceMinutes / STEP);
    let chosen = { shares: new Map(), short: units };
    if (units > 0 && candidates.length) {
      const pool = declared
        ? candidates
        : candidates
            .slice()
            .sort(
              (left, right) =>
                right.capacity - left.capacity ||
                compareText(left.date, right.date),
            );
      // Declared nights: all of them, unless the remainder would be cut
      // into shares under the minimum. Clearest nights: as few as can take
      // the remainder. More nights only when those cannot hold it all.
      const widest = Math.max(
        1,
        Math.min(
          pool.length,
          Math.floor(units / (allocationMinimumShareMinutes / STEP)),
        ),
      );
      for (
        let count = declared ? widest : 1;
        count <= pool.length;
        count += 1
      ) {
        chosen = spread(
          units,
          pool
            .slice(0, count)
            .sort((left, right) => compareText(left.date, right.date)),
        );
        if (!chosen.short) break;
      }
    }

    let proposedMinutes = 0;
    for (const candidate of candidates) {
      const share = chosen.shares.get(candidate.date);
      if (!share || share.units <= 0) continue;
      const placed = place(candidate.context, share.wanted * STEP);
      if (!placed) continue;
      const duration = Math.min(placed.durationMinutes, share.units * STEP);
      const start = placed.start;
      takeTime(candidate.date, { start, end: start + duration });
      proposedMinutes += duration;
      rows.push({
        projectId: project.id,
        date: candidate.date,
        status: "proposed",
        planId: null,
        start,
        end: start + duration,
        night: candidate.night,
        durationMinutes: duration,
        placement: placed.reason,
        wantedMinutes:
          placed.reason === "shortened" ? share.wanted * STEP : null,
      });
    }

    for (const plan of pending) {
      if (today !== null && plan.date < today) continue;
      const own = plan.items.filter((item) => item.projectId === project.id);
      if (!own.length) continue;
      const slots = own.map((item) => item.interval).filter(Boolean);
      rows.push({
        projectId: project.id,
        date: plan.date,
        status: "existing",
        planId: plan.id,
        start: slots.length
          ? Math.min(...slots.map((slot) => slot.start))
          : null,
        end: slots.length ? Math.max(...slots.map((slot) => slot.end)) : null,
        night: nightByDate.get(plan.date) ?? null,
        durationMinutes: own.reduce((sum, item) => sum + item.minutes, 0),
        placement: "existing",
        wantedMinutes: null,
      });
    }

    const shortMinutes = Math.max(0, project.toPlaceMinutes - proposedMinutes);
    const anyProposal = proposedMinutes > 0;
    summaries.push({
      projectId: project.id,
      mode: declared ? "declared" : "clearest",
      state: !project.toPlaceMinutes
        ? "nothing-to-place"
        : !anyProposal
          ? "no-nights"
          : shortMinutes
            ? "short"
            : "proposals",
      remainingMinutes: project.remainingMinutes,
      plannedMinutes: project.plannedMinutes,
      toPlaceMinutes: project.toPlaceMinutes,
      proposedMinutes,
      shortMinutes,
      seasonEnd: project.seasonEnd,
    });
  }

  const order = new Map(entries.map((project, index) => [project.id, index]));
  rows.sort(
    (left, right) =>
      order.get(left.projectId) - order.get(right.projectId) ||
      compareText(left.date, right.date) ||
      (left.start ?? -1) - (right.start ?? -1) ||
      compareText(left.planId ?? "", right.planId ?? ""),
  );
  const proposals = rows.map((row) => {
    let next = null;
    if (row.end !== null)
      for (const other of rows) {
        if (
          other.date !== row.date ||
          other.projectId === row.projectId ||
          other.start === null ||
          other.start < row.end
        )
          continue;
        if (next === null || other.start < next.start) next = other;
      }
    const moon = moonOf(row.night, row.start, row.end);
    return {
      projectId: row.projectId,
      date: row.date,
      status: row.status,
      planId: row.planId,
      start: row.start === null ? null : instantOf(row.start),
      end: row.end === null ? null : instantOf(row.end),
      startMinute:
        row.start === null || !row.night ? null : row.start - row.night.start,
      durationMinutes: row.durationMinutes,
      reason: {
        placement: row.placement,
        wantedMinutes: row.wantedMinutes,
        moonUp: moon.up,
        moonIllumination: moon.illumination,
        moonSetsAt: moon.setsAt,
        nextProjectId: next ? next.projectId : null,
      },
    };
  });
  return {
    proposals,
    projects: summaries,
    remainingMinutes: summaries.reduce(
      (sum, project) => sum + project.toPlaceMinutes,
      0,
    ),
    shortMinutes: summaries.reduce(
      (sum, project) => sum + project.shortMinutes,
      0,
    ),
  };
}
