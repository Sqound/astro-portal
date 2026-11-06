/**
 * A small in-process sliding-window limiter: at most `max` recorded events
 * per `windowMs` for one key (a network origin, or a single shared key for
 * a process-wide ceiling). It keeps at most `maxKeys` keys, forgetting the
 * least recently seen first, so a flood of distinct origins cannot grow it
 * without bound. No timer: expired events are dropped when a key is next
 * seen. One process only: each instance counts for itself.
 */
export function createRateLimiter({
  windowMs,
  max,
  maxKeys = 5_000,
  now = () => Date.now(),
}) {
  const events = new Map();
  const keyOf = (key) => String(key || "unknown").slice(0, 120);

  function recent(name, timestamp) {
    return (events.get(name) || []).filter(
      (entry) => entry > timestamp - windowMs,
    );
  }

  function verdict(entries, timestamp) {
    return entries.length >= max
      ? {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((entries[0] + windowMs - timestamp) / 1000),
          ),
        }
      : { allowed: true, retryAfterSeconds: 0 };
  }

  function remember(name, entries) {
    // Re-inserted last: the map's order is the order keys were last seen.
    events.delete(name);
    if (entries.length) events.set(name, entries);
    while (events.size > maxKeys) events.delete(events.keys().next().value);
  }

  return {
    /** Whether `key` is still allowed, without recording anything. */
    check(key) {
      const timestamp = now();
      const name = keyOf(key);
      const entries = recent(name, timestamp);
      remember(name, entries);
      return verdict(entries, timestamp);
    },
    /** Records one event for `key` (a failed attempt, a log entry…). */
    record(key) {
      const timestamp = now();
      const name = keyOf(key);
      const entries = recent(name, timestamp);
      entries.push(timestamp);
      remember(name, entries);
    },
    /** Checks, then records when allowed: `{ allowed, retryAfterSeconds }`. */
    attempt(key) {
      const result = this.check(key);
      if (result.allowed) this.record(key);
      return result;
    },
  };
}

/**
 * The network origin every limit of the service counts against: the one
 * function of the core (`portal/api/client-origin.js`), read by every route
 * that limits a visitor. A route never reads an address header of its own.
 */
export { requestOrigin } from "portal/api/client-origin.js";
