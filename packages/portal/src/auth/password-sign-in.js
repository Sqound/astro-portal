import {
  FAILURES_PER_ADDRESS_PER_WINDOW,
  FAILURES_PER_ORIGIN_PER_WINDOW,
  LIMIT_WINDOW_MS,
  LOCK_STEPS_MS,
  MAX_FAILED_ATTEMPTS,
  RECIDIVISM_MS,
  keyedDigest,
} from "../spaces/codes.js";
import { refuse } from "../spaces/refusal.js";
import * as repository from "../spaces/repository.js";

/**
 * The limits of a private server's own sign-in (docs/PRIVATE_NOTEBOOK_AUTH.md,
 * « The locks »), on the same counters and with the same steps as the codes
 * sent by e-mail (`sign_in_throttles`, spaces/codes.js):
 *
 * - a password is judged only after its failure is counted, for the address
 *   from this network origin and for the address from every origin;
 * - five failures for an address from one origin lock that pair; twenty from
 *   every origin within the hour lock the address. A lock lasts 15 minutes,
 *   then 1 hour, then 24 hours when it comes back within 24 hours of the
 *   previous one; a success lifts it and forgets it. So someone who knows
 *   the address can, from one origin, only hold back themselves;
 * - thirty failures from one origin within the hour, whatever the address
 *   (passwords and recovery codes together), refuse that origin until the
 *   hour ends;
 * - a recovery code is never held back by the lock of an address: it is the
 *   way back of the owner whom someone else locked out. Only the budget of
 *   its own origin counts it.
 *
 * Every subject is a keyed digest under the service's key
 * (ASTRO_PORTAL_SIGN_IN_KEY); no address and no network address is stored.
 */
const iso = (value) => new Date(value).toISOString();
const later = (date, ms) => new Date(new Date(date).getTime() + ms);
const latest = (dates) =>
  new Date(Math.max(...dates.map((date) => new Date(date).getTime())));

const pairSubject = (key, email, origin) =>
  keyedDigest(key, "password-address-origin", `${email}\u0000${origin}`);
const addressSubject = (key, email) =>
  keyedDigest(key, "password-address", email);
const originSubject = (key, origin) =>
  keyedDigest(key, "private-sign-in-origin", origin);

const lockedRefusal = (retryAt) =>
  refuse(
    "sign_in_locked",
    "Too many attempts. This address cannot sign in from here until the wait ends.",
    429,
    { retryAt: iso(retryAt) },
  );

export function createPasswordGate({ driver, key, clock = () => new Date() }) {
  const lockOf = async (subject, now) => {
    const throttle = await repository.throttleOf(driver, subject);
    const until = throttle?.locked_until ? String(throttle.locked_until) : null;
    return until && until > iso(now) ? until : null;
  };

  /** Counts a failure of the origin first; refused past thirty an hour. */
  async function reserveOrigin(origin, now) {
    const subject = originSubject(key, origin);
    const reserved = await repository.reserveFailure(driver, subject, {
      now,
      windowMs: LIMIT_WINDOW_MS,
      limit: FAILURES_PER_ORIGIN_PER_WINDOW,
    });
    if (reserved.reserved) return { subject, ...reserved };
    const throttle = await repository.throttleOf(driver, subject);
    throw refuse(
      "sign_in_rate_limited",
      "Too many attempts from this network. Try again later.",
      429,
      {
        retryAt: iso(
          throttle?.window_started_at
            ? later(String(throttle.window_started_at), LIMIT_WINDOW_MS)
            : later(now, LIMIT_WINDOW_MS),
        ),
      },
    );
  }

  const releaseOrigin = (reservation) =>
    repository.releaseFailure(
      driver,
      reservation.subject,
      reservation.windowStartedAt,
    );

  /** The address is proven: its failures and its locks are forgotten. */
  async function forget(email, origin, now) {
    await repository.clearFailures(
      driver,
      pairSubject(key, email, origin),
      now,
    );
    await repository.clearFailures(driver, addressSubject(key, email), now);
  }

  return {
    /**
     * Judges a password for `email` from `origin`: `compare()` runs once
     * every failure it may be is counted, and answers whether the password
     * is right. Throws `sign_in_locked` (with `retryAt`),
     * `sign_in_rate_limited`, or `sign_in_password_incorrect` (with
     * `attemptsRemaining` from this origin).
     */
    async checkPassword({ email, origin, compare }) {
      const now = clock();
      const reservation = await reserveOrigin(origin, now);
      const pair = pairSubject(key, email, origin);
      const address = addressSubject(key, email);
      const held = [await lockOf(pair, now), await lockOf(address, now)].filter(
        Boolean,
      );
      if (held.length) throw lockedRefusal(latest(held));
      const rules = {
        now,
        windowMs: LIMIT_WINDOW_MS,
        lockSteps: LOCK_STEPS_MS,
        recidivismMs: RECIDIVISM_MS,
        addressHash: address,
      };
      const onPair = await repository.reserveLockingFailure(driver, pair, {
        ...rules,
        limit: MAX_FAILED_ATTEMPTS,
      });
      if (!onPair.reserved)
        throw lockedRefusal(
          (await lockOf(pair, now)) || later(now, LOCK_STEPS_MS[0]),
        );
      const onAddress = await repository.reserveLockingFailure(
        driver,
        address,
        { ...rules, limit: FAILURES_PER_ADDRESS_PER_WINDOW },
      );
      if (!onAddress.reserved)
        throw lockedRefusal(
          (await lockOf(address, now)) || later(now, LOCK_STEPS_MS[0]),
        );
      if (await compare()) {
        await forget(email, origin, now);
        await releaseOrigin(reservation);
        return true;
      }
      const locks = [onPair.lockedUntil, onAddress.lockedUntil].filter(Boolean);
      if (locks.length) throw lockedRefusal(latest(locks));
      throw refuse(
        "sign_in_password_incorrect",
        "This address and this password do not match.",
        401,
        {
          attemptsRemaining: Math.max(
            1,
            Math.min(
              MAX_FAILED_ATTEMPTS - onPair.failures,
              FAILURES_PER_ADDRESS_PER_WINDOW - onAddress.failures,
            ),
          ),
        },
      );
    },

    /**
     * Judges a recovery code from `origin`: counted against the origin
     * only, never held back by the lock of an address. `use()` consumes the
     * code and answers whether it was one; a success forgets what was
     * counted against the owner's address (`email`).
     */
    async checkRecoveryCode({ email, origin, use }) {
      const now = clock();
      const reservation = await reserveOrigin(origin, now);
      if (!(await use()))
        throw refuse(
          "recovery_code_incorrect",
          "This recovery code is not one, or was already used.",
          401,
        );
      if (email) await forget(email, origin, now);
      await releaseOrigin(reservation);
      return true;
    },
  };
}
