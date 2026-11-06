/**
 * Long computations in small slices, handing the event loop back in between.
 *
 * A process that computes the offline-pack manifest as one synchronous block
 * answers nothing meanwhile, not even a platform's health probe, which may
 * give up after one second. Every step of that work (each catalogue page, the
 * catalogue's own loading) goes through these helpers, so that no slice holds
 * the process for long. `worker_threads` are not used: a worker needs its own
 * copy of the catalogue, and its own connection to a SQLite database whose
 * locks do not cross a network file system — a second writer there can
 * corrupt it.
 */

/** Lets every pending timer, I/O callback and request run before going on. */
export const yieldToEventLoop = () =>
  new Promise((resolvePromise) => setImmediate(resolvePromise));

/**
 * [items] sorted by [compare] — stable, exactly like
 * `Array.prototype.sort` — in slices: runs of about a thousand sorted one at
 * a time, then merged pairwise, handing the event loop back in between.
 * Sorting the whole catalogue at once is one block of about 60 ms locally.
 */
export async function sortedInSlices(items, compare, runLength = 1024) {
  let runs = [];
  for (let start = 0; start < items.length; start += runLength) {
    runs.push(items.slice(start, start + runLength).sort(compare));
    await yieldToEventLoop();
  }
  while (runs.length > 1) {
    const merged = [];
    for (let index = 0; index < runs.length; index += 2) {
      const left = runs[index];
      const right = runs[index + 1];
      if (!right) {
        merged.push(left);
        continue;
      }
      const run = new Array(left.length + right.length);
      let fromLeft = 0;
      let fromRight = 0;
      let next = 0;
      // Ties take from the left run first: earlier elements stay first.
      while (fromLeft < left.length && fromRight < right.length)
        run[next++] =
          compare(right[fromRight], left[fromLeft]) < 0
            ? right[fromRight++]
            : left[fromLeft++];
      while (fromLeft < left.length) run[next++] = left[fromLeft++];
      while (fromRight < right.length) run[next++] = right[fromRight++];
      merged.push(run);
      await yieldToEventLoop();
    }
    runs = merged;
  }
  return runs[0] || [];
}

/** [items] mapped by [transform], [sliceLength] at a time. */
export async function mappedInSlices(items, transform, sliceLength = 2000) {
  const result = new Array(items.length);
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0 && index % sliceLength === 0) await yieldToEventLoop();
    result[index] = transform(items[index], index);
  }
  return result;
}
