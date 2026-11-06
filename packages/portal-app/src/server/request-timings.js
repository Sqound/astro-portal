/**
 * How long the service takes to answer, by route: the measure `start.js`
 * takes around every request when its composition keeps the results
 * (`composition.storeRequestRollups`). Kept in memory, a window at a time
 * (five minutes), then handed over as one row per method, route template and
 * class of status — the count, the 50th and 95th percentiles and the
 * maximum, in milliseconds. A server whose composition keeps nothing measures
 * nothing.
 *
 * A route template never holds what identifies something: every segment of
 * the path that carries a digit, an `@`, an escape or more than 40
 * characters is replaced by `:id` (`/api/v1/plans/:id`), the query is
 * dropped, the files of Next.js are one route. The number of routes in a
 * window is bounded: past it, the rest are counted under `(other)`.
 */

export const REQUEST_WINDOW_MS = 5 * 60_000;
const MAX_ROUTES = 500;
const MAX_SAMPLES = 512;
const OTHER_ROUTE = "(other)";
const METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);

function identifying(segment) {
  if (/^v\d{1,2}$/.test(segment)) return false;
  return (
    /\d/.test(segment) ||
    /[@%]/.test(segment) ||
    segment.length > 40 ||
    /[^A-Za-z0-9._~\-[\]]/.test(segment)
  );
}

/** The route template of a request's address (see above). */
export function routeTemplate(url) {
  const path = String(url || "/").split(/[?#]/)[0] || "/";
  if (path.startsWith("/_next/")) return "/_next/*";
  const template = path
    .split("/")
    .map((segment) => (segment && identifying(segment) ? ":id" : segment))
    .join("/");
  return template.length > 200 ? OTHER_ROUTE : template;
}

/** `2xx` for 204; a status outside 100–599 counts as a failure of the server. */
export function statusClass(status) {
  const code = Number(status);
  if (!Number.isInteger(code) || code < 100 || code > 599) return "5xx";
  return `${Math.floor(code / 100)}xx`;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}

/**
 * The measures of the current window: `record` one answered request,
 * `drain` the window's rows (and start a new window).
 */
export function createRequestTimings({
  now = () => Date.now(),
  random = Math.random,
} = {}) {
  let windowStart = now();
  let entries = new Map();

  return {
    record({ method, url, status, durationMs }) {
      const verb = METHODS.has(String(method).toUpperCase())
        ? String(method).toUpperCase()
        : "OTHER";
      let route = routeTemplate(url);
      const kind = statusClass(status);
      let key = `${verb} ${kind} ${route}`;
      if (!entries.has(key) && entries.size >= MAX_ROUTES) {
        route = OTHER_ROUTE;
        key = `${verb} ${kind} ${route}`;
      }
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          method: verb,
          route,
          statusClass: kind,
          count: 0,
          max: 0,
          samples: [],
        };
        entries.set(key, entry);
      }
      const duration = Math.max(0, Number(durationMs) || 0);
      entry.count += 1;
      entry.max = Math.max(entry.max, duration);
      // A uniform sample of the window's durations once it is full.
      if (entry.samples.length < MAX_SAMPLES) entry.samples.push(duration);
      else {
        const slot = Math.floor(random() * entry.count);
        if (slot < MAX_SAMPLES) entry.samples[slot] = duration;
      }
    },

    drain() {
      const windowEnd = now();
      const rows = [...entries.values()].map((entry) => {
        const sorted = entry.samples.toSorted((a, b) => a - b);
        return {
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          method: entry.method,
          route: entry.route,
          statusClass: entry.statusClass,
          count: entry.count,
          p50Ms: Math.round(percentile(sorted, 0.5)),
          p95Ms: Math.round(percentile(sorted, 0.95)),
          maxMs: Math.round(entry.max),
        };
      });
      entries = new Map();
      windowStart = windowEnd;
      return rows;
    },
  };
}
