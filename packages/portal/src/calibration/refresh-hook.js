/**
 * The seam between the writes of a space's sky-background values and the
 * project's calibration set (docs/CONTRIBUTION_RULES.md): every write that
 * may store, change or remove such a value — a night measured by Astro Sync
 * (`place-sky-measure-repository.js`), a place or a plan written with its
 * `skyEntered` (`planner-state-repository.js`) — calls
 * `calibrationValuesChanged(tenantId)` once its own transaction has
 * committed.
 *
 * A refresher is registered only by an extension
 * (`registerCalibrationRefresher`): on a private server nothing is
 * registered, and these calls do nothing — a private server never
 * contributes. The refresher itself keeps nothing unless the space
 * consented. A failure is logged and never fails the write that called it:
 * the observer's value is stored either way, and the next write (or the
 * next switch of the consent) brings the set up to date.
 *
 * The registry lives on `globalThis` under a registered symbol, like the
 * service extensions: Next.js loads a module once per compilation layer.
 */
const registryKey = Symbol.for("astro-portal.calibration-refresher");

/** Registers (or, with `null`, removes) the refresher of the set. */
export function registerCalibrationRefresher(refresher) {
  if (refresher !== null && typeof refresher !== "function")
    throw new Error("A calibration refresher is a function or null.");
  globalThis[registryKey] = refresher;
}

/** Whether a refresher is registered (only an extension registers one). */
export function calibrationRefresherRegistered() {
  return typeof globalThis[registryKey] === "function";
}

/**
 * Brings the space's records up to date with what it holds now. Never
 * throws.
 */
export async function calibrationValuesChanged(tenantId) {
  const refresher = globalThis[registryKey];
  if (typeof refresher !== "function" || !tenantId) return;
  try {
    await refresher(String(tenantId));
  } catch (error) {
    console.warn(
      `The calibration set could not be brought up to date: ${error?.message || error}`,
    );
  }
}
