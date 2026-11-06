// The timed playback of a progression: it starts from the first night, and it
// never steps to a milestone whose picture is not there yet (the pictures were
// 3 MB and the player showed the loader alone).
import assert from "node:assert/strict";
import test from "node:test";
import { registerJsx } from "../../../tests/helpers/jsx-render.mjs";

await registerJsx();
const { firstStepToPlay, playNextStep, preloadImage } =
  await import("portal/components/detail/ProgressionPlayer.js");

const IDS = ["n1", "n2", "n3", "n4"];
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A clock the test turns by hand: `schedule` records, `fire()` runs it. */
function clock() {
  const timers = [];
  return {
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancelSchedule: (timer) => {
      timer.cancelled = true;
    },
    fire: () => {
      for (const timer of timers)
        if (!timer.cancelled) {
          timer.cancelled = true;
          timer.callback();
        }
    },
    timers,
  };
}

test("▶ starts from the first night, wherever the viewer was", () => {
  assert.equal(firstStepToPlay(IDS), "n1");
  assert.equal(firstStepToPlay([]), null);
});

test("the next milestone is fetched at once and the tick waits for its picture", async () => {
  const time = clock();
  const shown = [];
  const fetched = [];
  let arrive;
  const slow = new Promise((resolve) => {
    arrive = resolve;
  });
  const stop = playNextStep({
    stepIds: IDS,
    activeId: "n2",
    interval: 2600,
    sourceOf: (id) => `/media/${id}.jpg`,
    preload: (url) => {
      fetched.push(url);
      return slow;
    },
    onStep: (id) => shown.push(id),
    schedule: time.schedule,
    cancelSchedule: time.cancelSchedule,
  });
  assert.deepEqual(fetched, ["/media/n3.jpg"], "fetched while n2 is shown");
  assert.equal(time.timers[0].delay, 2600);
  time.fire();
  await flush();
  assert.deepEqual(
    shown,
    [],
    "the picture of n3 is not there: nothing changes",
  );
  arrive();
  await flush();
  assert.deepEqual(shown, ["n3"]);
  stop();
});

test("the playback goes back to the first night after the last, and a stopped tick shows nothing", async () => {
  const time = clock();
  const shown = [];
  const stop = playNextStep({
    stepIds: IDS,
    activeId: "n4",
    interval: 1400,
    preload: () => Promise.resolve(),
    onStep: (id) => shown.push(id),
    schedule: time.schedule,
    cancelSchedule: time.cancelSchedule,
  });
  time.fire();
  await flush();
  assert.deepEqual(shown, ["n1"]);

  const again = clock();
  const stopped = playNextStep({
    stepIds: IDS,
    activeId: "n1",
    interval: 1400,
    preload: () => Promise.resolve(),
    onStep: (id) => shown.push(id),
    schedule: again.schedule,
    cancelSchedule: again.cancelSchedule,
  });
  stopped();
  again.fire();
  await flush();
  assert.deepEqual(shown, ["n1"], "stopped before its tick: nothing shown");
  stop();
});

test("a picture is fetched once, and nothing is fetched without an address", async () => {
  assert.equal(await preloadImage(null), undefined);
  assert.equal(await preloadImage(""), undefined);
  // No browser here: nothing to fetch, nothing to wait for.
  assert.equal(await preloadImage("/media/n1.jpg"), undefined);
});
