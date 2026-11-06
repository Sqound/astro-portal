// Two plans of one night never carry the same name, so that a tab, a sheet,
// a card and the Journal tell them apart.

/**
 * `desired` when no plan of the night carries that name, else
 * "`desired` (2)", "(3)"… -- the first free number. `taken` are the names
 * of the night's plans. Only a new default name is numbered: a name the
 * person typed is theirs and is never rewritten.
 */
export function uniquePlanNameOnNight(desired, taken = []) {
  const used = new Set([...taken].map((name) => String(name).trim()));
  const base = String(desired).trim();
  if (!used.has(base)) return desired;
  for (let number = 2; ; number += 1) {
    const candidate = `${base} (${number})`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * "`noun` 1", "`noun` 2"… the first number no name of `taken` carries
 * (the planner's "Plan 2" added beside a "Plan 2" left by a deleted
 * "Plan 1" would otherwise name two plans alike).
 */
export function nextNumberedPlanName(noun, taken = []) {
  const used = new Set([...taken].map((name) => String(name).trim()));
  let number = used.size + 1;
  while (used.has(`${noun} ${number}`)) number += 1;
  return `${noun} ${number}`;
}
