/**
 * The runs of the service's own tasks (the hourly maintenance, the erasure of
 * the trash, the pending captures): `start.js` runs each through the tracker
 * below, which measures it and hands `{ name, phase, startedAt, durationMs,
 * outcome, count, message }` to the composition when it keeps them
 * (`composition.recordTaskRun`). The same tracker is given to the
 * composition's own work (`composition.maintain({ track })`).
 *
 * A task says it failed by throwing (after logging what it must); the
 * tracker records `failed` with the error's message (300 characters at most)
 * and returns `undefined`, unless asked to throw it again (`rethrow`). What a
 * task returns is its count when it is a number, an array (its length) or an
 * object with a numeric `count`.
 */

const MAX_MESSAGE = 300;

export function countOf(result) {
  if (typeof result === "number" && Number.isFinite(result))
    return Math.round(result);
  if (Array.isArray(result)) return result.length;
  if (
    result &&
    typeof result.count === "number" &&
    Number.isFinite(result.count)
  )
    return Math.round(result.count);
  return null;
}

export function createTaskTracker({
  record = null,
  now = () => new Date(),
  elapsed = () => performance.now(),
  log = null,
} = {}) {
  return async function track(
    name,
    run,
    { phase = "periodic", rethrow = false } = {},
  ) {
    const startedAt = now();
    const from = elapsed();
    let outcome = "ok";
    let message = null;
    let result;
    let failure = null;
    try {
      result = await run();
    } catch (error) {
      outcome = "failed";
      failure = error;
      message = String(error?.message || error || "failed").slice(
        0,
        MAX_MESSAGE,
      );
    }
    if (record) {
      try {
        await record({
          name,
          phase,
          startedAt: startedAt.toISOString(),
          durationMs: Math.max(0, Math.round(elapsed() - from)),
          outcome,
          count: outcome === "ok" ? countOf(result) : null,
          message,
        });
      } catch (error) {
        log?.warn?.(
          "tasks.recorded",
          `The run of ${name} was not recorded (${error.message}).`,
        );
      }
    }
    if (failure && rethrow) throw failure;
    return result;
  };
}
