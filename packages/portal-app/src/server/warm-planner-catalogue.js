/**
 * Asks this very service for what the web planner reads of the target
 * catalogue -- the list of the targets, the library's featured page and the
 * planner's pool -- once it listens, so that the first person to open the
 * planner after a rollout or a wake-up does not wait for the service to load
 * its catalogue (13 to 20 s on a fresh browser, three requests of 18 s each,
 * the sign-in and the plans queued behind them).
 *
 * Like the offline pack's warm-up it is a request to the routes themselves,
 * not a call to the modules: a custom server and the Next.js bundle of a route
 * do not share module state, and only the route's own copy keeps what it
 * loaded. The requests go one after the other -- the first loads the catalogue
 * the others share -- and each is asked with the planner's own parameters.
 * Nothing here ever throws or keeps the process alive.
 */

/** The reads of the planner, for a language (the planner's own URLs). */
export function plannerCatalogueReads(locale) {
  const language = encodeURIComponent(locale);
  return [
    `/api/planner-targets?locale=${language}&latitude=&minimumAltitude=30&selection=best`,
    `/api/catalog?locale=${language}&all=1&summary=1`,
    `/api/target-library?locale=${language}&featured=1&limit=96`,
  ];
}

/**
 * Returns `{ answered, failed }`: how many of the reads were answered (any
 * status) and how many could not be reached or were cut short.
 */
export async function warmPlannerCatalogue({
  origin,
  locales = ["en"],
  fetchImplementation = globalThis.fetch,
  timeoutMs = 120_000,
  // Added to every read (the start's own, which the gate before readiness
  // lets through: `warmUpHeader` in startup-warm-up.js).
  headers = {},
  log = () => {},
} = {}) {
  let answered = 0;
  let failed = 0;
  for (const locale of locales) {
    for (const path of plannerCatalogueReads(locale)) {
      const started = performance.now();
      try {
        const response = await fetchImplementation(new URL(path, origin), {
          headers: { Accept: "application/json", ...headers },
          signal: AbortSignal.timeout(timeoutMs),
        });
        // The body is of no use here; free the socket.
        await response.body?.cancel?.().catch(() => {});
        answered += 1;
        log(
          "warm-up.planner-read",
          `${path.split("?")[0]} answered ${response.status} in ${Math.round(performance.now() - started)} ms.`,
        );
      } catch (error) {
        failed += 1;
        log("warm-up.planner-unreachable", error?.message || String(error));
      }
    }
  }
  log(
    "warm-up.planner-done",
    `The planner's catalogue reads: ${answered} answered, ${failed} failed.`,
  );
  return { answered, failed };
}
