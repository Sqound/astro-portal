import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * The rules of a code (v1.md « The rules of a code »). The
 * values: ten minutes, five attempts,
 * fifteen minutes of wait, a new message after sixty seconds.
 *
 * - A code can be compared five times at most (`MAX_FAILED_ATTEMPTS`,
 *   reserved on its row before each comparison).
 * - Five failures of one address from one network origin lock that pair;
 *   twenty failures of one address from every origin lock the address. A
 *   lock stops codes being typed, never the link of a message; it lasts
 *   15 minutes, then 1 hour, then 24 hours when it comes back within 24
 *   hours of the previous one (`LOCK_STEPS_MS`, `RECIDIVISM_MS`).
 * - The e-mail budget of the whole service (per minute and per hour) is a
 *   setting (configuration.js), not a rule of a code.
 */
export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILURES_PER_ADDRESS_PER_WINDOW = 20;
export const LOCK_STEPS_MS = [15 * 60_000, 60 * 60_000, 24 * 3600_000];
export const RECIDIVISM_MS = 24 * 3600_000;
export const RESEND_INTERVAL_MS = 60_000;
export const LIMIT_WINDOW_MS = 60 * 60_000;
export const CODES_PER_ADDRESS_PER_WINDOW = 5;
export const CODES_PER_ORIGIN_PER_WINDOW = 20;
export const FAILURES_PER_ORIGIN_PER_WINDOW = 30;

/** Six digits from the operating system's secure generator. */
export function newCode() {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

/** The opaque token of the link of a message: 32 random bytes. */
export function newLinkToken() {
  return randomBytes(32).toString("base64url");
}

/** Six digits, spaces and hyphens typed between them ignored; else `null`. */
export function normalizeCode(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/[\s-]/gu, "");
  return /^[0-9]{6}$/.test(digits) ? digits : null;
}

export function isLinkToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * The keyed digest a code, a link token, an address or a network origin is
 * kept as: HMAC-SHA-256 under the service's key, with a purpose prefix so
 * that the same value never yields the same digest for two uses.
 */
export function keyedDigest(key, purpose, value) {
  return createHmac("sha256", key)
    .update(`${purpose}\u0000${value}`)
    .digest("base64url");
}

/** Constant-time comparison of two digests. */
export function sameDigest(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const codeDigest = (key, codeId, code) =>
  keyedDigest(key, `code:${codeId}`, code);
export const linkTokenDigest = (key, token) => keyedDigest(key, "link", token);
export const addressSubject = (key, email) =>
  keyedDigest(key, "address", email);
export const originSubject = (key, origin) =>
  keyedDigest(key, "origin", origin);
/** One address as tried from one network origin. */
export const addressOriginSubject = (key, email, origin) =>
  keyedDigest(key, "address-origin", `${email}\u0000${origin}`);
