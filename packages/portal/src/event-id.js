/**
 * A session-event id the browser writes itself: a 26-character Crockford
 * base32 ULID (`session-events/event-envelope.schema.json`), the time of the
 * instant in its first ten characters and 80 random bits in the other
 * sixteen. The ids of one batch stay in the order they were asked for when
 * they share a millisecond: the caller passes increasing instants.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** `newEventId(Date.now())` -> `01K…` (26 characters). */
export function newEventId(now = Date.now(), random = randomBytes) {
  let time = Math.max(0, Math.floor(now));
  let head = "";
  for (let index = 0; index < 10; index += 1) {
    head = ALPHABET[time % 32] + head;
    time = Math.floor(time / 32);
  }
  let tail = "";
  for (const byte of random(16)) tail += ALPHABET[byte & 31];
  return head + tail;
}
