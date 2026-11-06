/**
 * The warm-up the service does before it says it is ready: the steps that
 * make the first requests after a start as fast as the later ones (the
 * catalogue written to its database and loaded, what the web planner reads of
 * it, the offline pack's manifest). They run one after the other, each told to
 * the log when it starts and when it ends, with its duration, so that a start
 * that took minutes shows which step it was.
 *
 * A step never stops the start: one that throws is told as a warning and the
 * next runs. A start has a time [budgetMs] for all of them: past it the
 * service is told ready all the same — slow routes are better than a service
 * the platform never routes to — and the steps still running finish in the
 * background. Nothing here ever throws.
 *
 * What takes minutes on the production data does not belong before ready, and
 * no size of the catalogue may decide whether a revision is routed to: the
 * media check of the catalogue and the offline pack's first manifest (which
 * waits for the import of every stored text, some 350 MB) run after ready, in
 * the background (`runBackgroundWarmUp`), each told to the log the same way.
 * The routes they warm answer correctly meanwhile, only slower the first time.
 */

/** The header the service's own warm-up requests carry (the value is a
 * secret of the process: `start.js`). */
export const warmUpHeader = "x-astro-warm-up";

/**
 * Default time the warm-up may take before the service is ready anyway. It
 * must stay under the window in which the platform's readiness probe gives a
 * revision up, less the time the start takes before the warm-up begins
 * (`tests/warm-up-budget-probe-window.test.mjs` computes both from
 * `hostedProbes()` and fails when this passes the window). On 31/10/2026 a
 * budget of 600 s let the platform declare the revision unhealthy 16 s before
 * the service said it was ready, and the rollout failed.
 */
export const warmUpBudgetMilliseconds = 45_000;

/**
 * Runs [steps] (`{ name, run }`, `run` returning a line saying what it did, or
 * nothing) in order. [log] takes `{ level, event, message, context }` (the
 * server's `recordBackendLog`). Returns `{ steps, totalMs, timedOut }`, `steps`
 * being `[{ name, durationMs, ok }]` of the steps that ended.
 */
export async function runStartupWarmUp({
  steps,
  log,
  budgetMs = warmUpBudgetMilliseconds,
  now = () => performance.now(),
}) {
  const started = now();
  const done = [];
  let abandoned = false;
  if (!steps.length) return { steps: done, totalMs: 0, timedOut: false };
  log({
    event: "startup.warm-up.start",
    message: `Warm-up before ready: ${steps.map((step) => step.name).join(", ")}.`,
    context: { steps: steps.map((step) => step.name), budgetMs },
  });
  const sequence = (async () => {
    for (const { name, run } of steps) {
      if (abandoned) return;
      log({
        event: "startup.warm-up.step.start",
        message: `Warm-up step ${name} started.`,
        context: { step: name },
      });
      const stepStarted = now();
      let ok = true;
      let said = "";
      try {
        said = (await run()) || "";
      } catch (error) {
        ok = false;
        said = error?.message || String(error);
      }
      const durationMs = Math.round(now() - stepStarted);
      done.push({ name, durationMs, ok });
      log({
        level: ok ? "info" : "warning",
        event: ok ? "startup.warm-up.step.done" : "startup.warm-up.step.failed",
        message: `Warm-up step ${name} ${ok ? "done" : "failed"} in ${durationMs} ms${said ? ` (${said})` : ""}.`,
        context: { step: name, durationMs, ok },
      });
    }
  })();
  let timer;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve("budget"), budgetMs);
    timer.unref?.();
  });
  const outcome = await Promise.race([sequence.then(() => "done"), budget]);
  clearTimeout(timer);
  const timedOut = outcome === "budget";
  if (timedOut) abandoned = true;
  const totalMs = Math.round(now() - started);
  log({
    level: timedOut ? "warning" : "info",
    event: timedOut ? "startup.warm-up.budget" : "startup.warm-up.done",
    message: timedOut
      ? `Warm-up still running after ${totalMs} ms (budget ${budgetMs} ms): ready anyway, the rest finishes in the background.`
      : `Warm-up done in ${totalMs} ms (${done.map((step) => `${step.name} ${step.durationMs} ms`).join(", ")}).`,
    context: { totalMs, steps: done, timedOut },
  });
  return { steps: done, totalMs, timedOut };
}

/**
 * Runs [steps] (`{ name, run }`) at once, after the service is ready, each told
 * to [log] when it starts and when it ends, with its duration, so that the log
 * says what the service did in the background and for how long. A step that
 * throws is told as a warning; nothing here ever throws or keeps the process
 * alive. Returns `{ steps, totalMs }` (`steps`: `[{ name, durationMs, ok }]`)
 * once every step has ended.
 */
export async function runBackgroundWarmUp({
  steps,
  log,
  now = () => performance.now(),
}) {
  const started = now();
  const done = [];
  if (!steps.length) return { steps: done, totalMs: 0 };
  log({
    event: "startup.warm-up.background.start",
    message: `Ready; warming up in the background: ${steps.map((step) => step.name).join(", ")}.`,
    context: { steps: steps.map((step) => step.name) },
  });
  await Promise.all(
    steps.map(async ({ name, run }) => {
      log({
        event: "startup.warm-up.background.step.start",
        message: `Background warm-up step ${name} started.`,
        context: { step: name },
      });
      const stepStarted = now();
      let ok = true;
      let said = "";
      try {
        said = (await run()) || "";
      } catch (error) {
        ok = false;
        said = error?.message || String(error);
      }
      const durationMs = Math.round(now() - stepStarted);
      done.push({ name, durationMs, ok });
      log({
        level: ok ? "info" : "warning",
        event: ok
          ? "startup.warm-up.background.step.done"
          : "startup.warm-up.background.step.failed",
        message: `Background warm-up step ${name} ${ok ? "done" : "failed"} in ${durationMs} ms${said ? ` (${said})` : ""}.`,
        context: { step: name, durationMs, ok },
      });
    }),
  );
  const totalMs = Math.round(now() - started);
  log({
    event: "startup.warm-up.background.done",
    message: `Background warm-up done in ${totalMs} ms (${done.map((step) => `${step.name} ${step.durationMs} ms`).join(", ")}).`,
    context: { totalMs, steps: done },
  });
  return { steps: done, totalMs };
}
