// Freshness windows shared by the planner's public reference reads. The
// server caches enforce them for every caller; an offline-first client mirrors
// the same windows so a cached estimate is labelled identically on both sides.

export const plannerReferenceCacheWindows = {
  weather: {
    freshMs: 20 * 60_000,
    fallbackFreshMs: 30 * 60_000,
    // What an offline-first client keeps showing from its own copy.
    staleMs: 3 * 3600_000,
    // What the service keeps per place and serves stale (`stale: true`) when
    // both providers fail: a forecast reaches twelve days ahead, so one a few
    // days old still covers the coming nights.
    retainedMs: 7 * 86400_000,
  },
  skyQuality: {
    freshMs: 30 * 86400_000,
    staleMs: 370 * 86400_000,
    retryMs: 5 * 60_000,
  },
};

// An absent instant is never zero: a missing entry must not read as the epoch.
const instant = (value) =>
  value === null || value === undefined || value === "" ? NaN : Number(value);

// `mayRequest` is false only while a provider cooldown is still running;
// `servable` says whether the cached value may still be shown, with `state`
// carrying the notice the surface renders.
export function plannerReferenceCacheState(value) {
  const windows = plannerReferenceCacheWindows[value?.kind];
  if (!windows)
    throw new Error(`Unknown planner reference cache "${value?.kind}".`);
  const stamp = instant(value?.now);
  if (!Number.isFinite(stamp))
    throw new Error("A reference cache state needs the current instant.");
  const cooldownUntil = instant(value?.cooldownUntil);
  const cooling = Number.isFinite(cooldownUntil) && cooldownUntil > stamp;
  const fetchedAt = instant(value?.fetchedAt);
  if (!Number.isFinite(fetchedAt))
    return { state: "missing", servable: false, mayRequest: !cooling };
  const age = stamp - fetchedAt;
  // A clock moved backwards must not expire an entry that was just written.
  if (age < windows.freshMs)
    return { state: "fresh", servable: true, mayRequest: false };
  if (age < windows.staleMs)
    return { state: "stale", servable: true, mayRequest: !cooling };
  return { state: "expired", servable: false, mayRequest: !cooling };
}
