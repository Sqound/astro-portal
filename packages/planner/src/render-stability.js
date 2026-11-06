// Folding stage 1 (or 2, 3) writes a view key into the active plan, so the
// whole planner re-renders -- and, 700 ms later, once more when the autosave
// stamps the document. Every render rebuilds the recommendation arrays
// (`recommendationVisibleCards` filters and sorts afresh) and the `selectedIds`
// set, although the cards they hold are the very same objects the memoised
// night produced. Comparing those props by content lets the ~100 target cards
// skip both renders when nothing they show has changed.

function sameArrayItems(previous, next) {
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1)
    if (!Object.is(previous[index], next[index])) return false;
  return true;
}

function sameSetMembers(previous, next) {
  if (!(previous instanceof Set) || !(next instanceof Set)) return false;
  if (previous.size !== next.size) return false;
  for (const value of previous) if (!next.has(value)) return false;
  return true;
}

// `React.memo` comparator: arrays compare item by item, sets member by member,
// everything else by identity (callbacks must therefore be stable).
export function sameShallowContentProps(previous, next) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const before = previous[key];
    const after = next[key];
    if (Object.is(before, after)) continue;
    if (Array.isArray(before) && sameArrayItems(before, after)) continue;
    if (before instanceof Set && sameSetMembers(before, after)) continue;
    return false;
  }
  return true;
}
