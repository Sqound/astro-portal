/**
 * A capture written by two hands: the revision and the conflict judged
 * by field. Pure but for the per-capture lock.
 *
 * The capture has one `revision` (`captures.revision`, 1 at the creation,
 * +1 at each write that changed something) and, for the conflict, the
 * revision of the last change of each of its fields and each of its
 * acquisition lines (`capture_field_revisions`). An owner write names the
 * revision it read (`If-Match: "<n>"`) and is refused with `409
 * capture_conflict` only if **the field it writes** changed after that
 * revision. A write that leaves the stored value as it was changes nothing,
 * does not move the revision and never conflicts.
 */

/**
 * The `If-Match` header: a quoted positive integer (`"7"`). `null` when
 * the header is absent (the write is applied); `NaN`-free: a header that is
 * not that throws `InvalidIfMatch`.
 */
export class InvalidIfMatch extends Error {
  constructor(message = 'If-Match is a quoted revision, such as "7".') {
    super(message);
    this.name = "InvalidIfMatch";
    this.code = "invalid_if_match";
    this.status = 400;
  }
}

export function parseIfMatch(header) {
  if (header === null || header === undefined) return null;
  const value = String(header).trim();
  const found = /^"([1-9][0-9]{0,14})"$/.exec(value);
  if (!found) throw new InvalidIfMatch();
  const revision = Number(found[1]);
  if (!Number.isSafeInteger(revision)) throw new InvalidIfMatch();
  return revision;
}

// ---------------------------------------------------------------------------
// The lock: the judge and the write of one capture are one step in a process.

const tails = new Map();

/**
 * Runs `task` once every earlier task of the same capture has finished: the
 * check of the revision, the write and the move of the revision are one
 * step for the process (the revision itself is moved by a compare-and-swap
 * in the database, which re-judges if another process wrote in between).
 */
export async function withCaptureLock(captureId, task) {
  const key = String(captureId ?? "");
  const before = tails.get(key) ?? Promise.resolve();
  let release;
  const mine = new Promise((resolve) => {
    release = resolve;
  });
  const tail = before.then(() => mine);
  tails.set(key, tail);
  await before;
  try {
    return await task();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

// ---------------------------------------------------------------------------
// What changed.

const jsonOf = (value) => JSON.stringify(value ?? null);

/**
 * The lines of an acquisition as the conflict compares them: the line's
 * values and whether it was corrected (never the moment it was).
 */
const lineKey = (line) =>
  jsonOf({
    filter: line.filter ?? null,
    frameCount: line.frameCount,
    exposureSeconds: line.exposureSeconds,
    gain: line.gain ?? null,
    origin: line.origin ?? null,
    edited: Boolean(line.editedAt),
    declaredSeconds: line.declaredSeconds ?? null,
    sessionId: line.sessionId ?? null,
    computerLabel: line.computerLabel ?? null,
  });

/** The ids of the lines added, changed or removed between two lists. */
export function changedLineIds(before, after) {
  const was = new Map((before || []).map((line) => [line.id, lineKey(line)]));
  const is = new Map((after || []).map((line) => [line.id, lineKey(line)]));
  const ids = [];
  for (const [id, key] of is) if (was.get(id) !== key) ids.push(id);
  for (const id of was.keys()) if (!is.has(id)) ids.push(id);
  return ids;
}

/** Whether a stored value (and where it comes from) is the same. */
export const sameValue = (left, right) => jsonOf(left) === jsonOf(right);
