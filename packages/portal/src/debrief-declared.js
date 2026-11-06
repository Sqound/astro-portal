/**
 * What a night's debriefing declares of one target: the time, the number of
 * frames and the filter, when they are known. It feeds the **declared**
 * lines — the integration lines of a night attached to a multi-night plan,
 * and the lines « Synchroniser avec la session » writes on a capture — which
 * Astro Sync's measured lines then replace.
 *
 * Pure. Input: `{ debrief, summary }` as `createSessionDebriefService().read`
 * answers (`debrief` the plan's debriefing record or `null`, `summary` the
 * night's `debriefSummary`), and the target's key.
 *
 * - the time is the sum of the `acquiredMinutes` of the target's entries of
 *   the summary that were observed (`done`, `partial`), in seconds;
 * - the frames are the debriefing's `frameCount` of those entries (the
 *   adjustment of the plan item, or the target added at the debriefing),
 *   0 while none is known;
 * - the filter is the one a target added at the debriefing names, else `null`.
 *
 * `null` when the target was not observed or no time is known.
 */

const known = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

export function declaredFiguresOfTarget({ debrief, summary }, targetId) {
  const entries = (summary?.perTarget ?? []).filter(
    (entry) =>
      entry.targetId === targetId &&
      ["done", "partial"].includes(entry.outcome) &&
      Number.isFinite(entry.acquiredMinutes) &&
      entry.acquiredMinutes > 0,
  );
  if (!entries.length) return null;
  let minutes = 0;
  let frameCount = 0;
  let filter = null;
  for (const entry of entries) {
    minutes += entry.acquiredMinutes;
    const adjustment = (debrief?.targets ?? []).find(
      (candidate) => candidate.targetId === entry.planItemId,
    );
    const added = (debrief?.addedTargets ?? []).find(
      (candidate) => candidate.targetId === entry.targetId,
    );
    frameCount +=
      known(adjustment?.frameCount) ?? known(added?.frameCount) ?? 0;
    if (!filter && typeof added?.filter === "string" && added.filter.trim())
      filter = added.filter.trim().slice(0, 40);
  }
  const seconds = minutes * 60;
  return {
    seconds,
    frameCount,
    // A line with frames reads « frames × exposure »; one without keeps only
    // the declared time (exposure 0).
    exposureSeconds:
      frameCount > 0 ? Math.round((seconds / frameCount) * 1000) / 1000 : 0,
    filter,
  };
}
