// The one choice of how the plans show their targets on the web:
// `compact` (the labels, the default), `details` (one row per target) or
// `frise` (the night of the plan). A preference of this browser: never sent to a server, never
// part of a space or of a plan, the same for a visitor and for a signed-in
// person. "Cette nuit", Planifier and "Tous les plans" carry the same
// three-icon control. Every read and write fails soft: a store that cannot be
// read means compact, a store that cannot be written answers `false` and
// changes nothing.
export const targetViewStorageKey = "astro-portal:plans:target-view:v1";

export const planTargetViews = ["compact", "details", "frise"];

const store = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const listeners = new Set();

/** `compact` (the default), `details` or `frise`. */
export function readTargetView(storage = store()) {
  try {
    const value = storage?.getItem(targetViewStorageKey);
    return planTargetViews.includes(value) ? value : "compact";
  } catch {
    return "compact";
  }
}

/**
 * Keeps the choice. Answers whether it could be kept; the components of this
 * page that follow the choice are told when it was.
 */
export function writeTargetView(value, storage = store()) {
  if (!planTargetViews.includes(value)) return false;
  try {
    storage.setItem(targetViewStorageKey, value);
  } catch {
    return false;
  }
  for (const listener of [...listeners]) listener();
  return true;
}

/**
 * Calls `listener` when the choice changes, in this page (`writeTargetView`)
 * or in another tab (the `storage` event); answers the function that stops it.
 */
export function subscribeTargetView(
  listener,
  target = typeof window !== "undefined" ? window : null,
) {
  const onStorage = (event) => {
    if (event?.key === null || event?.key === targetViewStorageKey) listener();
  };
  listeners.add(listener);
  target?.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(listener);
    target?.removeEventListener?.("storage", onStorage);
  };
}
