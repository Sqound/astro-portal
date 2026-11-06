import { debriefSummary } from "../debrief-summary.js";
import { passagesSeconds, storedPassages } from "../declared-passages.js";
import { parseJson } from "../persistence/planner-state-repository.js";
import { planItemsOfRow } from "../persistence/session-derived.js";
import { launchedAcquisitionByItem } from "../planner/plan-acquisition.js";

// "Session" here is always an OBSERVATION session; see the naming note at the
// top of persistence/observation-session-repository.js.

/**
 * The targets of a session as the Journal draws them
 * (`journal.schema.json`, `target`), and the figures of the session they
 * add up to. **Pure**: the repository hands it what it read.
 *
 * Where a target comes from, in the order of the night: the plan's items (in
 * the order of their slots), then the targets the field added (the events),
 * the ones the debriefing added, the ones Astro Sync's steps name and the
 * ones the night names itself; **a rework's list**, when there is one, then
 * fixes the set and the order of the targets and may set the figures of each.
 *
 * Where a figure comes from: the debriefing first (the minutes, the frames
 * and the times the person declared), then the events (the summary of the
 * night, `debrief-summary.js`), then Astro Sync's analysis (the acquisition
 * steps); `null` when nothing says. A rework entry that gives both the
 * number of frames and their exposure (what Astro Sync read in the frames)
 * sets the acquired time to frames x exposure, the first and last frame's
 * hours staying the target's `startedAt` / `finishedAt`. A target removed from the session
 * (« Retirée au débriefing », or by a rework) keeps its place with `state:
 * "removed"`, never erased, and has no acquired figure. A target the night
 * recorded without the plan (met in the field, added at the debriefing) and
 * taken out by a rework is kept the same way, `removed`; only a target the
 * rework itself added is dropped for good.
 *
 * Slot: a planned target's `slot` ({ start, end }, ISO) is its plan item's
 * slot on the clock inside the session's window (`debriefSummary`), `null`
 * without a plan slot or a night start.
 *
 * Times and exposure: a target's `startedAt` / `finishedAt` come from the
 * rework, else from the debriefing, else from the events (the first passage's
 * start and the last passage's end), each one apart, `null` when nothing
 * says. Its `exposureSeconds` comes from Astro Sync's analysis (the family of
 * exposures that gathered the most time), else from what the rework, else the
 * debriefing, declared; `exposureFamilies` counts the distinct exposures of
 * the analysis (1 for a declared one).
 *
 * Planned and measured shooting (« Prise de vue par cible »): a target of
 * the plan carries `planned`, the lines the launch froze for its plan item
 * (`launchedSchedule[].acquisition`, read as it was written, never
 * recomputed), and every target `measured`: the lines of Astro Sync's
 * analysis (`source: "astro-sync"`), else the figures the person declared
 * (the debriefing's or the rework's frames and exposure,
 * `source: "declared"`), else the night's hand-written or imported steps
 * (also declared). Both are omitted when there is nothing to say: a plan
 * launched before the freezing, a free execution, a visual night, a removed
 * target.
 */

const SKIP_REASON_ORDER = [
  "weather",
  "equipment",
  "time",
  "visibility",
  "other",
];

const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The key of a plan item's target: what `debriefSummary` calls its `targetId`. */
export function planItemKey(item) {
  return text(item.targetId) ?? item.id;
}

/** The identifiers a plan item's target answers to (its captures are found by them). */
function planItemAliases(item) {
  const keys = new Set();
  for (const value of [
    item.targetId,
    item.framingId,
    item.target?.id,
    item.target?.framingId,
    item.id,
  ])
    if (text(value)) keys.add(text(value));
  return keys;
}

/** A designation folded for comparison: « M 31 », « m31 », « NGC 0224 » = « NGC 224 ». */
function compactName(value) {
  const name = text(value);
  return name
    ? name
        .toUpperCase()
        .replace(/[\s._-]+/g, "")
        .replace(/([A-Z])0+(\d)/g, "$1$2")
    : null;
}

/**
 * Astro Sync's steps with their target key aligned on the plan's: a plan made
 * elsewhere may name a target by another identifier than the one the step
 * resolved to (`m31` against `openngc-ngc0224`). A step whose key is one the
 * plan answers to keeps the plan's key; a step the plan names by its
 * designation (the step's hint, the catalogue's designation of its key) takes
 * the plan item's key; any other step keeps its own, and is added as before.
 * Without this the same hours were counted twice, once under each key.
 */
function stepsAlignedOnPlan(steps, items, labels) {
  if (!steps.length || !items.length) return steps;
  const keyOfId = new Map();
  const keyOfName = new Map();
  for (const item of items) {
    const key = planItemKey(item);
    for (const id of planItemAliases(item))
      if (!keyOfId.has(id)) keyOfId.set(id, key);
    for (const name of [
      item.targetId,
      item.target?.designation,
      item.target?.name,
      item.name,
    ]) {
      const folded = compactName(name);
      if (folded && !keyOfName.has(folded)) keyOfName.set(folded, key);
    }
  }
  return steps.map((step) => {
    const own = text(step.target_id);
    const key =
      (own && keyOfId.get(own)) ??
      [step.target_hint, own && labels.get(own)]
        .map(compactName)
        .map((folded) => (folded ? keyOfName.get(folded) : undefined))
        .find((found) => found !== undefined) ??
      own;
    return key === own ? step : { ...step, target_id: key };
  });
}

/** A plan item's own duration in minutes: its slot, else its duration, else 0. */
function itemPlannedMinutes(item) {
  const start = finite(item?.startMinute);
  const end = finite(item?.endMinute);
  const duration = finite(item?.durationMinutes);
  if (start !== null && start >= 0) {
    if (end !== null && end >= start) return end - start;
    if (duration !== null && duration > 0) return duration;
    return 0;
  }
  return duration !== null && duration > 0 ? duration : 0;
}

function secondsBetween(start, end) {
  const from = Date.parse(start ?? "");
  const to = Date.parse(end ?? "");
  return Number.isFinite(from) && Number.isFinite(to) && to > from
    ? Math.round((to - from) / 1000)
    : null;
}

/** The seconds of pause (the `pause` / `resume` pairs of `events`) inside `[start, end]`. */
function pausedSecondsWithin(events, start, end) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const ordered = [...events]
    .filter((event) => event.type === "pause" || event.type === "resume")
    .map((event) => ({ type: event.type, at: Date.parse(event.recordedAt) }))
    .filter((event) => Number.isFinite(event.at))
    .sort((a, b) => a.at - b.at);
  let paused = 0;
  let open = null;
  const close = (stop) => {
    if (open === null) return;
    paused += Math.max(0, Math.min(stop, to) - Math.max(open, from));
    open = null;
  };
  for (const event of ordered) {
    if (event.type === "pause" && open === null) open = event.at;
    else if (event.type === "resume") close(event.at);
  }
  close(to);
  return Math.round(paused / 1000);
}

/** The steps of Astro Sync's analysis grouped by target key: seconds, frames, filter. */
function stepFigures(steps) {
  const figures = new Map();
  for (const step of steps) {
    const key = text(step.target_id);
    if (!key) continue;
    const entry = figures.get(key) ?? {
      seconds: 0,
      frames: 0,
      filters: new Map(),
      exposures: new Map(),
    };
    const seconds = Number(step.frame_count) * Number(step.exposure_seconds);
    entry.seconds += Number.isFinite(seconds) ? seconds : 0;
    entry.frames += Number(step.frame_count) || 0;
    const filter = text(step.filter);
    if (filter)
      entry.filters.set(filter, (entry.filters.get(filter) ?? 0) + seconds);
    // A family of exposures is one distinct exposure value (the filters
    // that share it make a single family); its weight is the time it gave.
    const exposure = Number(step.exposure_seconds);
    if (Number.isFinite(exposure) && exposure > 0)
      entry.exposures.set(
        exposure,
        (entry.exposures.get(exposure) ?? 0) +
          (Number.isFinite(seconds) ? seconds : 0),
      );
    figures.set(key, entry);
  }
  for (const entry of figures.values()) {
    entry.seconds = Math.round(entry.seconds * 1000) / 1000;
    // The filter that gathered the most light names the target's filter.
    entry.filter =
      [...entry.filters.entries()].sort(
        (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1),
      )[0]?.[0] ?? null;
    // The exposure that gathered the most time (the longer one on a tie)
    // names the target's exposure; the number of families says there are
    // others.
    entry.exposureSeconds =
      [...entry.exposures.entries()].sort(
        (a, b) => b[1] - a[1] || b[0] - a[0],
      )[0]?.[0] ?? null;
    entry.exposureFamilies = entry.exposures.size || null;
  }
  return figures;
}

/**
 * The plan item's slot as the plan made it, on the clock and **not** cut to
 * the session's window -- the promise the phone writes (« Prévu 21:09 → 21:30
 * · 21 min »). `null` without a night start or a slot.
 */
function promisedSlotOf(item, nightStartAt) {
  const origin = Date.parse(nightStartAt ?? "");
  const start = finite(item?.startMinute);
  if (!Number.isFinite(origin) || start === null || start < 0) return null;
  const end = finite(item?.endMinute);
  const duration = finite(item?.durationMinutes);
  const last =
    end !== null && end >= start
      ? end
      : start + (duration !== null && duration > 0 ? duration : 0);
  return {
    start: new Date(origin + start * 60_000).toISOString(),
    end: new Date(origin + last * 60_000).toISOString(),
  };
}

const outcomeOfAdjustment = (state) =>
  state === "partial" ? "partial" : state === "skipped" ? "skipped" : "done";

/** First start and last end of the passages of each target key. */
function passageTimes(perTarget) {
  const times = new Map();
  for (const entry of perTarget) {
    const held = times.get(entry.targetId) ?? {
      startedAt: null,
      finishedAt: null,
    };
    for (const passage of entry.passages ?? []) {
      const start = Date.parse(passage.start ?? "");
      const end = Date.parse(passage.end ?? "");
      if (
        Number.isFinite(start) &&
        (held.startedAt === null || start < Date.parse(held.startedAt))
      )
        held.startedAt = passage.start;
      if (
        Number.isFinite(end) &&
        (held.finishedAt === null || end > Date.parse(held.finishedAt))
      )
        held.finishedAt = passage.end;
    }
    times.set(entry.targetId, held);
  }
  return times;
}

const timestampOrNull = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;

/** An exposure a person declared: more than 0 s, a day at most. */
const exposureOrNull = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

/**
 * The time a rework entry's frames integrated: their number times their
 * exposure, in seconds, rounded to the second; `null` unless the entry gives
 * both (a person who sets hours by hand gives the frames' number alone).
 */
function integratedSeconds(entry) {
  const frames = entry?.frameCount;
  const exposure = exposureOrNull(entry?.exposureSeconds);
  return Number.isSafeInteger(frames) && frames > 0 && exposure !== null
    ? Math.round(frames * exposure)
    : null;
}

/**
 * The exposure of a target: the analysis's (the family that gathered the
 * most time, with the number of families), else what was declared.
 */
function exposureOf(stepsOf, ...declared) {
  if (stepsOf?.exposureSeconds)
    return {
      exposureSeconds: stepsOf.exposureSeconds,
      exposureFamilies: stepsOf.exposureFamilies,
    };
  const value = declared.map(exposureOrNull).find((entry) => entry !== null);
  return value
    ? { exposureSeconds: value, exposureFamilies: 1 }
    : { exposureSeconds: null, exposureFamilies: null };
}

/** One line of `planned` / `measured` (`journal.schema.json`, `acquisitionFigure`). */
const figureLine = (line) => ({
  filter: text(line.filter),
  exposureSeconds: exposureOrNull(line.exposureSeconds),
  gain: Number.isSafeInteger(line.gain) ? line.gain : null,
  frameCount: Number.isSafeInteger(line.frameCount) ? line.frameCount : null,
});

/**
 * What the launch froze for a plan item, as the Journal says it, or `null`
 * (a plan launched before the freezing, a free execution, a visual night).
 */
function plannedOf(frozenByItem, item) {
  const frozen = frozenByItem[item.id];
  if (!frozen?.lines?.length) return null;
  return {
    ruleVersion: frozen.ruleVersion ?? null,
    lines: frozen.lines.map(figureLine),
  };
}

/** Two plan items of one target add up into one card: their planned lines follow each other. */
function mergePlanned(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  return {
    ruleVersion: left.ruleVersion ?? right.ruleVersion,
    lines: [...left.lines, ...right.lines].slice(0, 8),
  };
}

/**
 * The rows of Astro Sync's steps (and the night's own) by target key, as
 * lines: the frames of the steps that share a filter, an exposure and a gain
 * add up. The `analysis` steps are Astro Sync's measure; the others were typed
 * or imported.
 */
function stepLinesByTarget(steps) {
  const byTarget = new Map();
  for (const step of steps) {
    const key = text(step.target_id);
    const exposure = exposureOrNull(Number(step.exposure_seconds));
    const frames = Number(step.frame_count);
    if (!key || exposure === null || !Number.isSafeInteger(frames)) continue;
    const held = byTarget.get(key) ?? { analysis: [], other: [] };
    const list = step.origin === "analysis" ? held.analysis : held.other;
    const filter = text(step.filter);
    const gain = Number.isSafeInteger(step.gain) ? step.gain : null;
    const same = list.find(
      (line) =>
        line.filter === filter &&
        line.exposureSeconds === exposure &&
        line.gain === gain,
    );
    if (same) same.frameCount += frames;
    else
      list.push({
        filter,
        exposureSeconds: exposure,
        gain,
        frameCount: frames,
      });
    byTarget.set(key, held);
  }
  return byTarget;
}

/**
 * The measured side of a target: Astro Sync's lines when its analysis has
 * some for the target and the night, else what the person declared (frames
 * and/or exposure, one line; the filter only when one was said), else the
 * night's other steps; `null` when nothing says.
 */
function measuredOf(stepLines, declared) {
  if (stepLines?.analysis.length)
    return { source: "astro-sync", lines: stepLines.analysis };
  if (
    declared &&
    (declared.frameCount !== null || declared.exposureSeconds !== null)
  )
    return {
      source: "declared",
      lines: [
        figureLine({
          filter: declared.filter,
          exposureSeconds: declared.exposureSeconds,
          gain: null,
          frameCount: declared.frameCount,
        }),
      ],
    };
  if (stepLines?.other.length)
    return { source: "declared", lines: stepLines.other };
  return null;
}

const targetOf = (fields) => ({
  targetId: fields.targetId,
  label: fields.label,
  planItemId: fields.planItemId ?? null,
  state: fields.state,
  outcome: fields.outcome ?? null,
  reason: fields.reason ?? null,
  plannedSeconds: fields.plannedSeconds ?? null,
  acquiredSeconds: fields.acquiredSeconds ?? null,
  frameCount: fields.frameCount ?? null,
  filter: fields.filter ?? null,
  startedAt: fields.startedAt ?? null,
  finishedAt: fields.finishedAt ?? null,
  slot: fields.slot ?? null,
  plannedSlot: fields.plannedSlot ?? null,
  exposureSeconds: fields.exposureSeconds ?? null,
  exposureFamilies: fields.exposureFamilies ?? null,
  captureId: fields.captureId ?? null,
  thumbnailUrl: fields.thumbnailUrl ?? null,
  // The passages declared one at a time (rework, else
  // debriefing); `null` when none was declared.
  passages: fields.passages ?? null,
  // Omitted while there is nothing to say.
  ...(fields.planned ? { planned: fields.planned } : {}),
  ...(fields.measured ? { measured: fields.measured } : {}),
});

/**
 * The frames Astro Sync measured for a target (the sum of its analysis lines),
 * `null` without a measurement. The measurement wins over any declared count:
 * the totals, the target's figure and the « Mesuré
 * (Astro Sync) » card say the same number, and a declared count only stands
 * when nothing was measured.
 */
const measuredFrames = (stepLines) =>
  stepLines?.analysis.length
    ? stepLines.analysis.reduce((sum, line) => sum + line.frameCount, 0)
    : null;

/** Adds two nullable figures: `null` only when both are. */
const plus = (left, right) =>
  left === null ? right : right === null ? left : left + right;

/**
 * -> { targets, sourceKeys, plannedSeconds, acquiredSeconds, frameCount,
 *      lostReason, summary }
 *
 * `sourceKeys` are the keys of the targets the sources bring (the plan, the
 * events, the debriefing, Astro Sync's steps, the night), before any rework:
 * the targets a rework cannot erase, only mark `removed`.
 *
 * `session` and `plan` are the rows; `debrief` the stored debriefing
 * (`debriefRecordForPlanRow`, with its `reason` and `addedTargets`); `events`
 * the **effective** events; `steps` the rows of `acquisition_steps`; `layer`
 * the rework; `guidingLosses` those of the analysis (or `null`); `labels` a
 * `Map(targetKey -> designation)`; `captures` a list of `{ id, hasImage,
 * keys }`.
 */
export function buildSessionTargets({
  session,
  plan = null,
  debrief: debriefed = null,
  events = [],
  steps = [],
  layer = null,
  guidingLosses = null,
  labels = new Map(),
  captures = [],
}) {
  // A night given up after it began (« Abandonner le plan » of « Terminer la
  // nuit ») is decided « Abandonné » by the write that closed the plan, with
  // its journal kept: its events are read as those of a night not debriefed,
  // never as targets removed by an abandonment that dropped them.
  const debrief =
    debriefed?.outcome === "abandoned" && events.length ? null : debriefed;
  const items = planItemsOfRow(plan).filter(
    (item) => typeof item.id === "string" && item.id,
  );
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const payload = parseJson(plan?.payload_json, {}) ?? {};
  // The plan a free execution (« Lancement rapide ») became promised
  // nothing; its items record what was met, with no planned time or slot.
  const blankExecution = payload.blankExecution === true;
  const finishedAt = session.finished_at || plan?.night_end_at || null;
  const summary = debriefSummary({
    nightStartAt: plan?.night_start_at || null,
    window: finishedAt ? { start: session.started_at, end: finishedAt } : null,
    planItems: items,
    events,
    adjustments: debrief ? debrief.targets : null,
    outcome: debrief ? debrief.outcome : null,
    guidingLosses,
    launchedSchedule: Array.isArray(payload?.launchedSchedule)
      ? payload.launchedSchedule
      : null,
    kind:
      !session.plan_id || payload?.equipment?.mode === "visual"
        ? "visual"
        : "imaging",
  });
  const adjustmentByItem = new Map(
    (debrief?.targets ?? []).map((entry) => [entry.targetId, entry]),
  );
  const alignedSteps = stepsAlignedOnPlan(steps, items, labels);
  const figuresOfSteps = stepFigures(alignedSteps);
  const linesOfSteps = stepLinesByTarget(alignedSteps);
  // What the launch froze of each item's shooting. A free execution
  // promised nothing and a night at the eyepiece takes no frames.
  const visualNight = payload?.equipment?.mode === "visual";
  const frozenByItem =
    blankExecution || visualNight ? {} : launchedAcquisitionByItem(payload);
  // The figures the person declared for a target (the debriefing's or the
  // rework's), apart from the targets: `measured` reads them.
  const declaredOf = new Map();
  const noteDeclared = (key, fields) =>
    declaredOf.set(key, {
      frameCount: fields.frameCount ?? declaredOf.get(key)?.frameCount ?? null,
      exposureSeconds:
        exposureOrNull(fields.exposureSeconds) ??
        declaredOf.get(key)?.exposureSeconds ??
        null,
      filter: text(fields.filter) ?? declaredOf.get(key)?.filter ?? null,
    });
  const timesOfEvents = passageTimes(summary.perTarget);
  const abandoned = debrief?.outcome === "abandoned";
  const labelOf = (key, item = null) =>
    text(item?.target?.name) ??
    text(item?.name) ??
    text(item?.target?.designation) ??
    labels.get(key) ??
    key;
  const aliasesOf = new Map();

  const byKey = new Map();
  const add = (fields) => {
    const held = byKey.get(fields.targetId);
    if (!held) {
      byKey.set(fields.targetId, targetOf(fields));
      return;
    }
    // Two plan items of the same target add up into one card.
    held.plannedSeconds = plus(
      held.plannedSeconds,
      fields.plannedSeconds ?? null,
    );
    held.acquiredSeconds = plus(
      held.acquiredSeconds,
      fields.acquiredSeconds ?? null,
    );
    held.frameCount = plus(held.frameCount, fields.frameCount ?? null);
    const planned = mergePlanned(held.planned, fields.planned);
    if (planned) held.planned = planned;
  };

  // 1. The plan's items, in the order of their slots.
  for (const entry of summary.perTarget) {
    if (entry.planItemId === null) continue;
    const item = itemsById.get(entry.planItemId);
    if (!item) continue;
    const key = entry.targetId;
    aliasesOf.set(key, planItemAliases(item));
    const adjustment = adjustmentByItem.get(item.id) ?? null;
    const removed = abandoned || adjustment?.removed === true;
    const declaredPassages =
      adjustment && adjustment.state !== "skipped" && !removed
        ? storedPassages(adjustment.passages)
        : null;
    const declared =
      adjustment && adjustment.state !== "skipped" && !removed
        ? Number.isSafeInteger(adjustment.acquiredMinutes)
          ? adjustment.acquiredMinutes * 60
          : declaredPassages
            ? passagesSeconds(declaredPassages)
            : secondsBetween(adjustment.startedAt, adjustment.finishedAt)
        : null;
    const stepsOf = figuresOfSteps.get(key) ?? null;
    let acquiredSeconds = null;
    if (!removed) {
      if (declared !== null) acquiredSeconds = declared;
      else if (entry.acquiredMinutes > 0)
        acquiredSeconds = entry.acquiredMinutes * 60;
      else if (stepsOf?.seconds > 0) acquiredSeconds = stepsOf.seconds;
      else if (debrief || entry.passages.length) acquiredSeconds = 0;
    }
    const outcome = removed
      ? "skipped"
      : debrief
        ? debrief.outcome === "executed"
          ? "done"
          : outcomeOfAdjustment(adjustment?.state ?? "skipped")
        : null;
    const planned = itemPlannedMinutes(item) || entry.plannedMinutes;
    if (!removed && adjustment && adjustment.state !== "skipped")
      noteDeclared(key, {
        frameCount: Number.isSafeInteger(adjustment.frameCount)
          ? adjustment.frameCount
          : null,
        exposureSeconds: adjustment.exposureSeconds,
      });
    add({
      targetId: key,
      label: labelOf(key, item),
      planItemId: item.id,
      state: removed ? "removed" : "planned",
      outcome,
      reason:
        outcome === "skipped"
          ? abandoned
            ? (debrief.reason ?? null)
            : (adjustment?.reason ?? entry.skipReason ?? null)
          : null,
      plannedSeconds: planned > 0 && !blankExecution ? planned * 60 : null,
      planned: removed ? null : plannedOf(frozenByItem, item),
      acquiredSeconds,
      frameCount: removed
        ? null
        : (measuredFrames(linesOfSteps.get(key)) ??
          adjustment?.frameCount ??
          stepsOf?.frames ??
          null),
      filter: stepsOf?.filter ?? text(item.filter),
      // The planned slot on the clock, for a reader that checks whether
      // another target's time is free (Astro Sync's import).
      slot: removed || blankExecution ? null : (entry.slot ?? null),
      plannedSlot:
        removed || blankExecution
          ? null
          : promisedSlotOf(item, plan?.night_start_at),
      ...(removed
        ? {}
        : {
            passages: declaredPassages,
            startedAt:
              declaredPassages?.[0]?.start ??
              timestampOrNull(adjustment?.startedAt) ??
              timesOfEvents.get(key)?.startedAt ??
              null,
            finishedAt:
              declaredPassages?.[declaredPassages.length - 1]?.end ??
              timestampOrNull(adjustment?.finishedAt) ??
              timesOfEvents.get(key)?.finishedAt ??
              null,
            ...exposureOf(stepsOf, adjustment?.exposureSeconds),
          }),
    });
  }

  // 2. The targets the field added (their events), the ones the debriefing
  // added, the ones Astro Sync's steps name, the ones the night names.
  for (const entry of summary.perTarget) {
    if (entry.planItemId !== null || byKey.has(entry.targetId)) continue;
    const stepsOf = figuresOfSteps.get(entry.targetId) ?? null;
    add({
      targetId: entry.targetId,
      label: labelOf(entry.targetId),
      state: "added",
      acquiredSeconds:
        entry.acquiredMinutes > 0
          ? entry.acquiredMinutes * 60
          : stepsOf?.seconds > 0
            ? stepsOf.seconds
            : entry.passages.length
              ? 0
              : null,
      frameCount: stepsOf?.frames ?? null,
      filter: stepsOf?.filter ?? null,
      startedAt: timesOfEvents.get(entry.targetId)?.startedAt ?? null,
      finishedAt: timesOfEvents.get(entry.targetId)?.finishedAt ?? null,
      ...exposureOf(stepsOf),
    });
  }
  for (const added of debrief?.addedTargets ?? []) {
    const stepsOf = figuresOfSteps.get(added.targetId) ?? null;
    const existing = byKey.get(added.targetId);
    const addedPassages = storedPassages(added.passages);
    noteDeclared(added.targetId, {
      frameCount: Number.isSafeInteger(added.frameCount)
        ? added.frameCount
        : null,
      exposureSeconds: added.exposureSeconds,
      filter: added.filter,
    });
    const declared = Number.isSafeInteger(added.acquiredMinutes)
      ? added.acquiredMinutes * 60
      : addedPassages
        ? passagesSeconds(addedPassages)
        : secondsBetween(added.startedAt, added.finishedAt);
    const fields = {
      targetId: added.targetId,
      label: labelOf(added.targetId),
      state: "added",
      acquiredSeconds:
        declared ?? stepsOf?.seconds ?? existing?.acquiredSeconds ?? null,
      frameCount:
        measuredFrames(linesOfSteps.get(added.targetId)) ??
        added.frameCount ??
        stepsOf?.frames ??
        existing?.frameCount ??
        null,
      filter: added.filter ?? stepsOf?.filter ?? null,
      passages: addedPassages,
      startedAt:
        addedPassages?.[0]?.start ??
        timestampOrNull(added.startedAt) ??
        timesOfEvents.get(added.targetId)?.startedAt ??
        null,
      finishedAt:
        addedPassages?.[addedPassages.length - 1]?.end ??
        timestampOrNull(added.finishedAt) ??
        timesOfEvents.get(added.targetId)?.finishedAt ??
        null,
      ...exposureOf(stepsOf, added.exposureSeconds),
    };
    // The declared figures replace those the events gave for the same target.
    byKey.set(added.targetId, targetOf(fields));
  }
  for (const [key, stepsOf] of figuresOfSteps) {
    if (byKey.has(key)) continue;
    add({
      targetId: key,
      label: labelOf(key),
      state: "added",
      acquiredSeconds: stepsOf.seconds > 0 ? stepsOf.seconds : null,
      frameCount: stepsOf.frames || null,
      filter: stepsOf.filter,
      ...exposureOf(stepsOf),
    });
  }
  const parsedNight = parseJson(session.target_ids_json, null);
  const namedByNight = Array.isArray(parsedNight) ? parsedNight : [];
  for (const key of namedByNight.map(text).filter(Boolean))
    if (!byKey.has(key))
      add({ targetId: key, label: labelOf(key), state: "added" });

  const sourceKeys = [...byKey.keys()];

  // 3. A rework fixes the set and the order, and may set the figures.
  let ordered = [...byKey.values()];
  if (layer?.targets) {
    const base = new Map(byKey);
    ordered = [];
    for (const entry of layer.targets) {
      const held = base.get(entry.targetId);
      const isPlanned = held?.planItemId != null;
      // A target the night never recorded (a rework's own addition) leaves for
      // good; one the plan, the field or the debriefing brought stays,
      // `removed`.
      if (entry.state === "removed" && !held) continue;
      const target = held
        ? { ...held }
        : targetOf({
            targetId: entry.targetId,
            label: labelOf(entry.targetId),
            state: "added",
          });
      if (entry.state === "removed") {
        target.state = "removed";
        target.outcome = "skipped";
        target.reason = entry.reason ?? held?.reason ?? null;
        target.acquiredSeconds = null;
        target.frameCount = null;
        target.startedAt = null;
        target.finishedAt = null;
        target.passages = null;
        target.exposureSeconds = null;
        target.exposureFamilies = null;
        delete target.planned;
        declaredOf.delete(target.targetId);
      } else {
        target.state = isPlanned ? "planned" : "added";
        if (
          isPlanned &&
          target.outcome === "skipped" &&
          held.state === "removed"
        )
          target.outcome = null;
        if (entry.reason) target.reason = entry.reason;
        if (
          Number.isSafeInteger(entry.frameCount) &&
          measuredFrames(linesOfSteps.get(target.targetId)) === null
        )
          target.frameCount = entry.frameCount;
        if (entry.filter) target.filter = entry.filter;
        noteDeclared(target.targetId, {
          frameCount: Number.isSafeInteger(entry.frameCount)
            ? entry.frameCount
            : null,
          exposureSeconds: entry.exposureSeconds,
          filter: entry.filter,
        });
        // The times the person set replace those the debriefing or the
        // events gave, each one apart; the analysis's exposure stays above a
        // declared one.
        if (timestampOrNull(entry.startedAt))
          target.startedAt = entry.startedAt;
        if (timestampOrNull(entry.finishedAt))
          target.finishedAt = entry.finishedAt;
        const declaredExposure = exposureOrNull(entry.exposureSeconds);
        if (
          declaredExposure !== null &&
          !figuresOfSteps.get(target.targetId)?.exposureSeconds
        ) {
          target.exposureSeconds = declaredExposure;
          target.exposureFamilies = 1;
        }
        // The passages set one at a time — each one's time,
        // the pauses inside it deducted.
        const reworkPassages = storedPassages(entry.passages);
        if (reworkPassages) {
          target.passages = reworkPassages;
          target.startedAt = reworkPassages[0].start;
          target.finishedAt = reworkPassages[reworkPassages.length - 1].end;
          target.acquiredSeconds = reworkPassages.reduce(
            (sum, passage) =>
              sum +
              Math.max(
                0,
                (secondsBetween(passage.start, passage.end) ?? 0) -
                  pausedSecondsWithin(events, passage.start, passage.end),
              ),
            0,
          );
        } else {
          const declared = secondsBetween(entry.startedAt, entry.finishedAt);
          const integrated = integratedSeconds(entry);
          // The frames' own figures (what Astro Sync read in the headers)
          // give the time the sensor integrated; the hours between the first
          // and the last frame stay the target's `startedAt` / `finishedAt`
          // and are not an acquisition time (dithers, flips and waits fill
          // them).
          if (integrated !== null) target.acquiredSeconds = integrated;
          else if (declared !== null)
            target.acquiredSeconds = Math.max(
              0,
              declared -
                pausedSecondsWithin(events, entry.startedAt, entry.finishedAt),
            );
        }
      }
      ordered.push(target);
    }
    // A target the sources brought since the rework (Astro Sync analysed the
    // night later, say) is not hidden: it joins the end of the list, unless
    // the rework dropped it.
    const listed = new Set(layer.targets.map((entry) => entry.targetId));
    const dropped = new Set(layer.dropped ?? []);
    for (const target of base.values())
      if (!listed.has(target.targetId) && !dropped.has(target.targetId))
        ordered.push(target);
  }

  // 3 bis. The measured side of each target that is still held.
  for (const target of ordered) {
    const measured =
      target.state === "removed"
        ? null
        : measuredOf(
            linesOfSteps.get(target.targetId),
            declaredOf.get(target.targetId),
          );
    if (measured) target.measured = measured;
    else delete target.measured;
  }

  // 4. The captures of the session found by their target.
  const usable = [...captures].sort(
    (a, b) => Number(b.hasImage) - Number(a.hasImage),
  );
  for (const target of ordered) {
    const aliases = new Set([
      target.targetId,
      ...(aliasesOf.get(target.targetId) ?? []),
    ]);
    const capture = usable.find((candidate) =>
      [...candidate.keys].some((key) => aliases.has(key)),
    );
    if (capture) {
      target.captureId = capture.id;
      target.thumbnailUrl = capture.hasImage
        ? `/v1/captures/${capture.id}/media?variant=thumbnail`
        : null;
    }
  }

  // 5. The figures of the session.
  const held = ordered.filter((target) => target.state !== "removed");
  const sum = (key, list) =>
    list.reduce((total, target) => plus(total, target[key]), null);
  const reasons = new Map();
  for (const target of ordered)
    if (
      target.reason &&
      (target.outcome === "skipped" || target.state === "removed")
    )
      reasons.set(target.reason, (reasons.get(target.reason) ?? 0) + 1);
  const lostReason =
    abandoned && debrief.reason
      ? debrief.reason
      : ([...reasons.entries()].sort(
          (a, b) =>
            b[1] - a[1] ||
            SKIP_REASON_ORDER.indexOf(a[0]) - SKIP_REASON_ORDER.indexOf(b[0]),
        )[0]?.[0] ?? null);
  return {
    targets: ordered,
    sourceKeys,
    plannedSeconds: plan
      ? sum(
          "plannedSeconds",
          ordered.filter((target) => target.planItemId !== null),
        )
      : null,
    acquiredSeconds: sum("acquiredSeconds", held),
    frameCount: sum("frameCount", held),
    lostReason,
    summary,
  };
}
