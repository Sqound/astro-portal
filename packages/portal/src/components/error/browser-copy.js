/**
 * What the browser keeps for the planner, and the reset of it: the plans only
 * this browser holds (a visit with no space), the copy of the space's
 * document, the view settings, the places' preferences. The keys of the
 * planner start with one of these prefixes; the identifier of the browser
 * (the planner's device id) stays, it holds nothing a page can die on and the
 * service already knows it.
 */
export const plannerBrowserKeyPrefixes = [
  "astro-portal:planner:",
  "astro-portal:plans:",
  "astro-portal:tonight:",
  "astro-portal:places:",
  "planner.",
];
const keptKeys = new Set(["astro-portal:planner:device-id:v1"]);

/** Removes the planner's keys from `storage`; returns how many were removed. */
export function resetPlannerBrowserCopy(storage) {
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key &&
        !keptKeys.has(key) &&
        plannerBrowserKeyPrefixes.some((prefix) => key.startsWith(prefix))
      )
        keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    // A browser that refuses its storage holds nothing to reset.
    return 0;
  }
}
