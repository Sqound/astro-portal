import { recommendationTypeFor } from "./recommendations.js";
import { createSuggestionRandom } from "./suggestion-seed.js";

// Where two candidates tie on their score: the earlier culmination, then the
// id.
function tieBreak(left, right) {
  if (left.culmination !== right.culmination)
    return left.culmination < right.culmination ? -1 : 1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function compareCandidates(left, right) {
  const leftScored = Boolean(left.score && left.score.max > 0);
  const rightScored = Boolean(right.score && right.score.max > 0);
  if (leftScored !== rightScored) return leftScored ? -1 : 1;
  if (leftScored) {
    const difference =
      right.score.total * left.score.max - left.score.total * right.score.max;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return tieBreak(left, right);
}

// A scored candidate's percentage of tonight's suitability, its malus taken
// off, never under 0; `null` for a candidate without a score.
function rankedPercentage(candidate) {
  if (!(candidate.score && candidate.score.max > 0)) return null;
  return Math.max(
    0,
    (100 * candidate.score.total) / candidate.score.max -
      (candidate.malus || 0),
  );
}

// The order of the ranking: the exact cross-product of
// `compareCandidates` while neither candidate pays a malus, so that every
// existing order is unchanged; the percentage minus the malus otherwise.
export function compareRanked(left, right) {
  if (!left.malus && !right.malus) return compareCandidates(left, right);
  const leftPercentage = rankedPercentage(left);
  const rightPercentage = rankedPercentage(right);
  if ((leftPercentage === null) !== (rightPercentage === null))
    return leftPercentage === null ? 1 : -1;
  if (leftPercentage !== null) {
    const difference = rightPercentage - leftPercentage;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return tieBreak(left, right);
}

export const suggestionRule = Object.freeze({
  tierSize: 10,
  maximumPerType: 3,
  scoreOffset: 3,
  visualMinutes: 20,
});

// A target already done is no longer left out of the suggestions, it
// pays a malus (in points of the target's percentage of tonight's
// suitability) that grows with what was done and falls with the age of the
// last time and with what tonight brings over that time. Every constant of
// the rule is in this table.
export const suggestionMalusRule = Object.freeze({
  // The malus of a target done in full, just now, under a sky as good as
  // tonight's: the most a target can pay.
  maximum: 40,
  // A visual observation counts as complete from this many minutes.
  visualMinutes: suggestionRule.visualMinutes,
  // The age halves the malus every so many days: a photograph is forgotten
  // slowly, a visual target faster (one gladly looks again after a few months).
  halfLifeDays: Object.freeze({ photo: 270, visual: 45 }),
  // Under this share of the malus left, the time is forgotten.
  forgottenBelow: 0.05,
  // Points of note that lift the malus altogether.
  liftSpan: 30,
  // A time done in a sky at least this good (the favourable bound of the
  // note) never gets more than this share of its malus lifted.
  goodNote: 64,
  liftCapInGoodSky: 0.5,
  // The line of a target already done: the skies are comparable within this
  // many points of note.
  comparableGap: 8,
});

// What a visual target pays in the suggestions for what the eyepiece will
// make of it (`visualSuitability`, `planner.js`), in points of its
// percentage of tonight's suitability, like the malus of a target already
// done (VISUAL-SUGGESTIONS-PRECISION-01):
// - a « difficult » target (under the limit of the place's sky, or at an
//   exit pupil out of the comfortable range) pays `difficult`, plus
//   `difficultPerMagnitude` per magnitude under the limit, up to
//   `difficultDeficitMaximum` magnitudes (« unlikely » ones never reach the
//   suggestions);
// - a target too small for the eyepiece's magnification or too large for its
//   true field pays `size` times its share (`sizeShare`, 0 to 1).
// - a target that only a generic pair shows (an eyepiece or a filter not in
//   « Mon matériel », `visual.pair.generic`, VISUAL-SIM-02a) pays
//   `genericPair`: it stays, and says what it asks for.
// A « suitable » target of the right size pays nothing, so the order of the
// suitable targets is the one of before; a target is lowered, never left out.
export const visualSuggestionRule = Object.freeze({
  difficult: 10,
  difficultPerMagnitude: 5,
  difficultDeficitMaximum: 2,
  size: 15,
  genericPair: 8,
});

/**
 * The malus of a visual card (`card.visual`): `{ malus, difficult, size }`,
 * in points, to a tenth (`malus` holds the generic pair's); 0 for a card out
 * of visual mode or without facts.
 */
export function visualSuggestionMalus(visual) {
  const rule = visualSuggestionRule;
  const margin = Number(visual?.magnitudeMargin);
  const difficult =
    visual?.status === "difficult"
      ? rule.difficult +
        rule.difficultPerMagnitude *
          Math.min(
            rule.difficultDeficitMaximum,
            Math.max(0, Number.isFinite(margin) ? -margin : 0),
          )
      : 0;
  const share = Number(visual?.sizeShare);
  const size =
    visual?.status && visual.status !== "not-applicable" && share > 0
      ? rule.size * Math.min(1, share)
      : 0;
  const generic = visual?.pair?.generic === true ? rule.genericPair : 0;
  const tenth = (value) => Math.round(value * 10) / 10;
  return {
    malus: tenth(difficult + size + generic),
    difficult: tenth(difficult),
    size: tenth(size),
  };
}

const dayMs = 24 * 60 * 60 * 1000;
const finiteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);
const civilDay = (value) => {
  const moment = Date.parse(String(value ?? "").slice(0, 10));
  return Number.isNaN(moment) ? null : moment;
};

// The sky of the last time against tonight's, by `noteNow − noteThen` (the
// line of a target already done): `worse` when the sky then was worse than
// tonight's by `comparableGap` points or more, `better` when it was better by
// as much, else `same`; `null` when a note is unknown.
export function previousSky(previous) {
  if (!finiteNumber(previous?.noteThen) || !finiteNumber(previous?.noteNow))
    return null;
  const gap = previous.noteNow - previous.noteThen;
  return gap >= suggestionMalusRule.comparableGap
    ? "worse"
    : gap <= -suggestionMalusRule.comparableGap
      ? "better"
      : "same";
}

// The malus of one target for the night of `date`:
// `40 × done × age × (1 − lift)`, in points, to a tenth.
// - `row`: the last time, `{date, outcome, mode?, acquiredMinutes?,
//   plannedMinutes?, noteThen?}`; `mode` and `date` read the way the row
//   was measured and aged;
// - `mode`: the mode of the night suggested (the age's half-life);
// - `recommendedMinutes`: the target's recommended integration (the photo's
//   reference), else the row's `plannedMinutes`, else the time is counted
//   complete;
// - `noteNow`: tonight's note; with an unknown note on either side nothing
//   is lifted.
// Returns `{malus, done, age, lift, sky, previous}`: `previous` is what the
// proposal's item carries (`{date, outcome, noteThen, noteNow, malus}`) and
// `sky` the form of its line (`previousSky`).
export function suggestionMalus({
  row,
  mode = "photo",
  date,
  recommendedMinutes = null,
  noteNow = null,
} = {}) {
  const rule = suggestionMalusRule;
  const kind = mode === "visual" ? "visual" : "photo";
  const rowKind =
    row?.mode === "visual" || row?.mode === "photo" ? row.mode : kind;
  let done = 1;
  if (finiteNumber(row?.acquiredMinutes)) {
    const reference =
      rowKind === "visual"
        ? rule.visualMinutes
        : [recommendedMinutes, row?.plannedMinutes].find(
            (value) => finiteNumber(value) && value > 0,
          );
    done = reference
      ? Math.min(1, Math.max(0, row.acquiredMinutes / reference))
      : 1;
  }
  const then = civilDay(row?.date);
  const now = civilDay(date);
  const days =
    then === null || now === null ? 0 : Math.max(0, (now - then) / dayMs);
  const age = 0.5 ** (days / rule.halfLifeDays[kind]);
  let lift = 0;
  if (finiteNumber(row?.noteThen) && finiteNumber(noteNow)) {
    lift = Math.min(1, Math.max(0, (noteNow - row.noteThen) / rule.liftSpan));
    if (row.noteThen >= rule.goodNote)
      lift = Math.min(lift, rule.liftCapInGoodSky);
  }
  const malus =
    age < rule.forgottenBelow
      ? 0
      : Math.round(rule.maximum * done * age * (1 - lift) * 10) / 10;
  const previous = {
    date: row?.date ?? null,
    outcome: row?.outcome ?? null,
    noteThen: finiteNumber(row?.noteThen) ? row.noteThen : null,
    noteNow: finiteNumber(noteNow) ? noteNow : null,
    malus,
  };
  return { malus, done, age, lift, sky: previousSky(previous), previous };
}

// Prepared candidates come from autoFillNight, so its score and culmination
// comparison is also used by the suggestion extension.
export function rankSuggestionCandidates(
  pool,
  {
    items = [],
    kept = [],
    excluded = [],
    history = [],
    continuing = [],
    mode,
    excludeCaptured = false,
    // Tonight's note (the night, place and slot the suggestion is for),
    // the date of that night, and whether the malus orders the pool (a
    // request over the ticked targets, `only`, keeps its order).
    noteNow = null,
    date,
    penalise = true,
    tier = 1,
    seed,
  } = {},
) {
  const blocked = new Set([
    ...items.map((item) => String(item.id)),
    ...kept.map((item) => String(item.id ?? item.target?.id)),
    ...excluded.map(String),
  ]);
  const captures = new Map();
  for (const row of history) {
    if (
      row.outcome !== "done" &&
      !(mode === "visual" && row.outcome === "observed")
    )
      continue;
    const id = String(row.id);
    const previous = captures.get(id);
    if (!previous || String(row.date) > String(previous.date))
      captures.set(id, row);
  }
  // The last time of each target, the one the malus reads: a target done or
  // partly done and, in visual, observed. An abandoned one never.
  const priors = new Map();
  for (const row of history) {
    if (
      row.outcome !== "done" &&
      row.outcome !== "partial" &&
      !(mode === "visual" && row.outcome === "observed")
    )
      continue;
    const id = String(row.id);
    const previous = priors.get(id);
    if (!previous || String(row.date) > String(previous.date))
      priors.set(id, row);
  }
  const progresses = new Map(
    continuing
      .filter(
        (row) =>
          Number.isFinite(row.acquiredMinutes) &&
          Number.isFinite(row.goalMinutes) &&
          row.acquiredMinutes < row.goalMinutes,
      )
      .map((row) => [String(row.id), row]),
  );
  const captured = [];
  const ranked = [];
  for (const candidate of pool) {
    if (blocked.has(candidate.id)) continue;
    const capture = captures.get(candidate.id);
    if (capture) {
      captured.push({
        target: {
          id: candidate.id,
          designation: candidate.card.target.designation ?? "",
          title: candidate.card.target.title ?? "",
        },
        date: capture.date,
        outcome: capture.outcome,
      });
      if (excludeCaptured) continue;
    }
    const progress = progresses.get(candidate.id);
    const prior = excludeCaptured ? null : priors.get(candidate.id);
    const integration = candidate.card.integration;
    const previous = prior
      ? suggestionMalus({
          row: prior,
          mode,
          date,
          recommendedMinutes: integration?.available
            ? Number(integration.recommendedMinutes)
            : null,
          noteNow,
        }).previous
      : null;
    // What the eyepiece makes of the target, in visual mode only.
    const visualMalus =
      mode === "visual" && !progress && penalise
        ? visualSuggestionMalus(candidate.card.visual).malus
        : 0;
    ranked.push({
      ...candidate,
      previous,
      // The continuing group and the ticked targets are exempt.
      malus:
        (previous && !progress && penalise ? previous.malus : 0) + visualMalus,
      visualMalus,
      type: recommendationTypeFor(candidate.card.target) || null,
      group: progress ? "continue" : "night",
      progress: progress
        ? {
            acquiredMinutes: progress.acquiredMinutes,
            goalMinutes: progress.goalMinutes,
            projectName: progress.projectName ?? "",
          }
        : null,
    });
  }
  // « Observation confortable » (`comfortable`, set by `autoFillNight` when
  // the switch is on): the targets in the comfortable range tonight first,
  // after the continuing group; the others keep their order behind them.
  const ease = (left, right) =>
    (left.comfortable ? 0 : 1) - (right.comfortable ? 0 : 1);
  const compare = (left, right) =>
    (left.group === "continue" ? 0 : 1) -
      (right.group === "continue" ? 0 : 1) ||
    ease(left, right) ||
    compareRanked(left, right);
  ranked.sort(compare);
  // Deferred targets keep their strict order in the following decade. A
  // sparse decade stays sparse rather than breaking its type cap.
  const tiers = [];
  let pending = ranked;
  while (pending.length) {
    const batch = [],
      deferred = [],
      types = new Map();
    for (const candidate of pending) {
      const used = candidate.type ? types.get(candidate.type) || 0 : 0;
      if (
        batch.length >= suggestionRule.tierSize ||
        (candidate.type && used >= suggestionRule.maximumPerType)
      ) {
        deferred.push(candidate);
      } else {
        batch.push({
          ...candidate,
          tier: tiers.length + 1,
          lowered: tiers.length > 0,
        });
        if (candidate.type) types.set(candidate.type, used + 1);
      }
    }
    tiers.push(batch);
    pending = deferred;
  }
  const tierById = new Map(
    tiers.flat().map((candidate) => [candidate.id, candidate]),
  );
  const strict = ranked.map((candidate) => tierById.get(candidate.id));
  if (seed !== undefined && seed !== null) {
    const random = createSuggestionRandom(seed);
    for (const batch of tiers) {
      const offsets = new Map(
        batch.map((candidate) => [
          candidate.id,
          (random() * 2 - 1) * suggestionRule.scoreOffset,
        ]),
      );
      batch.sort((left, right) => {
        const group =
          (left.group === "continue" ? 0 : 1) -
          (right.group === "continue" ? 0 : 1);
        if (group) return group;
        if (ease(left, right)) return ease(left, right);
        const a = left.score?.max > 0,
          b = right.score?.max > 0;
        if (a !== b) return a ? -1 : 1;
        if (a) {
          const difference =
            rankedPercentage(right) +
            offsets.get(right.id) -
            (rankedPercentage(left) + offsets.get(left.id));
          if (difference) return difference;
        }
        return compareRanked(left, right);
      });
    }
  }
  const selectedTier = Number.isInteger(tier) && tier > 0 ? tier : 1;
  return {
    pool: tiers.slice(selectedTier - 1).flat(),
    strict,
    captured,
    position: { from: 10 * (selectedTier - 1) + 1, to: 10 * selectedTier },
  };
}
