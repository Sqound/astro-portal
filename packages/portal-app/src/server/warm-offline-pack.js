/**
 * Asks this very service for its offline-pack manifest once it listens
 * (`GET /api/v1/offline-pack`), so that the first phone to ask after a
 * rollout, a wake-up or a catalogue change finds it kept, or at worst already
 * being computed — instead of being the request that makes the service
 * compute its first manifest and answer `503`.
 *
 * It is a request to the route itself, not a call to the module that builds
 * the manifest: a custom server and the Next.js bundle of a route do not
 * share module state, and only the route's own copy keeps what it computed
 * for the requests that follow.
 *
 * A `503` carrying `Retry-After` is the service saying it is computing: it is
 * asked again after that long (at least [minimumPauseMs], at most
 * [maximumPauseMs]), at most [maximumAttempts] times. Any other answer ends
 * it, and nothing here ever throws or keeps the process alive.
 */

export const warmMinimumPauseMs = 2_000;
export const warmMaximumPauseMs = 60_000;
export const warmMaximumAttempts = 20;

function retryAfterMilliseconds(response) {
  const seconds = Number(response.headers.get("retry-after"));
  const requested =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
  return Math.min(warmMaximumPauseMs, Math.max(warmMinimumPauseMs, requested));
}

/**
 * Returns what ended the warm-up: `{ status, attempts }` of the last answer,
 * or `{ status: null, attempts, error }` when the service could not be
 * reached.
 */
export async function warmOfflinePack({
  origin,
  fetchImplementation = globalThis.fetch,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds).unref?.()),
  attempts = warmMaximumAttempts,
  // Added to every request (the start's own, which the gate before
  // readiness lets through: `warmUpHeader` in startup-warm-up.js).
  headers = {},
  log = () => {},
} = {}) {
  const url = new URL("/api/v1/offline-pack", origin);
  const started = performance.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let response;
    try {
      response = await fetchImplementation(url, {
        headers: { Accept: "application/json", ...headers },
      });
    } catch (error) {
      log("warm-up.unreachable", error?.message || String(error));
      return { status: null, attempts: attempt, error };
    }
    // The body is of no use here; free the socket.
    await response.body?.cancel?.().catch(() => {});
    if (response.status !== 503 || attempt >= attempts) {
      log(
        "warm-up.done",
        `The offline-pack manifest answered ${response.status} after ${attempt} attempt(s), ${Math.round(performance.now() - started)} ms.`,
      );
      return { status: response.status, attempts: attempt };
    }
    const pause = retryAfterMilliseconds(response);
    log(
      "warm-up.waiting",
      `The offline-pack manifest answered ${response.status} (attempt ${attempt} of ${attempts}, ${Math.round(performance.now() - started)} ms): the service is computing it, asking again in ${Math.round(pause / 1000)} s.`,
    );
    await sleep(pause);
  }
}
