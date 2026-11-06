import { randomUUID } from "node:crypto";
import { retryOnSqliteNestedTransaction } from "../persistence/db-transaction-retry.js";
import { applyMigrations } from "../persistence/migration-runner.js";
import {
  CODE_TTL_MS,
  CODES_PER_ADDRESS_PER_WINDOW,
  CODES_PER_ORIGIN_PER_WINDOW,
  FAILURES_PER_ADDRESS_PER_WINDOW,
  FAILURES_PER_ORIGIN_PER_WINDOW,
  LIMIT_WINDOW_MS,
  LOCK_STEPS_MS,
  MAX_FAILED_ATTEMPTS,
  RECIDIVISM_MS,
  RESEND_INTERVAL_MS,
  addressOriginSubject,
  addressSubject,
  codeDigest,
  isLinkToken,
  linkTokenDigest,
  newCode,
  newLinkToken,
  normalizeCode,
  originSubject,
  sameDigest,
} from "./codes.js";
import { isValidEmail, normalizeEmail } from "./email.js";
import { spaceSignInProblems } from "./configuration.js";
import { createSpaceDevices } from "./devices.js";
import { validDevice } from "./installation.js";
import { languageOf, signInLink } from "./link.js";
import { signInMessage } from "./messages.js";
import { SignInRefusal, refuse } from "./refusal.js";
import * as repository from "./repository.js";
import { MailDeliveryError } from "../mail/errors.js";

export { SignInRefusal };

/** Where a private server that has no owner yet is set up. */
export const BOOTSTRAP_PATH = "/auth/bootstrap";

/**
 * A private server (`spaceCreation: "closed"`, docs/PRIVATE_NOTEBOOK_AUTH.md):
 * one space, its owner's, created at the installation. Only the owner's
 * address receives a code; any other is told at once, without a message,
 * that the portal belongs to someone else (a private server has nothing to
 * hide about who may open it: clarity comes first). Before the
 * installation, nobody does.
 */
export function closedSpacePolicy() {
  return {
    spaceCreation: "closed",
    async admit({ email, driver }) {
      const owner = await repository.portalOwner(driver);
      if (!owner && (await repository.countUsers(driver)) === 0)
        throw refuse(
          "not_initialized",
          `This portal is not set up yet: its owner opens ${BOOTSTRAP_PATH} on the web first.`,
          409,
          { bootstrapPath: BOOTSTRAP_PATH },
        );
      if (!owner || normalizeEmail(owner.email) !== email)
        throw refuse("not_owner", "This portal belongs to someone else.", 403);
    },
  };
}

/**
 * The policy of a composition that opens spaces (`spaceCreation: "open"`):
 * an address without a space gets one at its first proven code. The core
 * writes no second person: `openSpace(transaction, { email, timestamp,
 * language })` is the composition's, and answers `{ tenantId, userId }` (it
 * names the role of the new person, whatever its settings say). Without it
 * the policy opens nothing, and an address other than the owner's is
 * refused (`not_owner`).
 *
 * `afterDeviceSignIn({ email, tenantId, userId, created })` is called once a
 * device's sign-in succeeded (the code used, the device registered); what
 * it does belongs to the composition. It never changes the answer of the sign-in:
 * a failure is logged, and the next sign-in calls it again.
 *
 * `afterProven({ email, tenantId, userId, created })`, optional, runs once an
 * address is proven, on the web and on a phone alike, with the same
 * guarantee.
 *
 * `fixedCode` is the composition's addresses that sign in with a code fixed
 * by its settings instead of a code sent by e-mail (see `createSpaceSignIn`):
 * `{ has(email), matches(email, code, { key, compareDigests }),
 * spaceFields(email), afterOpen({ driver, tenantId, userId, client, now }) }`.
 * Absent: every address receives its code by e-mail.
 *
 * `devices` is the composition's rules for the devices of many spaces
 * (devices.js): `{ create(context) }`, whose result replaces `signIn` and
 * `detach` of the core's devices and may add `attach` (« Rattacher cet
 * appareil à mon espace », which answers a device attached to another space)
 * and `housekeeping(now)`, called when a code is sent. Absent: a device
 * belongs to the one space it signs in to, and no attachment is offered.
 */
export function openSpacePolicy({
  openSpace = null,
  afterDeviceSignIn = null,
  afterProven = null,
  fixedCode = null,
  devices = null,
} = {}) {
  return {
    spaceCreation: "open",
    openSpace,
    afterDeviceSignIn,
    afterProven,
    fixedCode,
    devices,
  };
}

/**
 * The sign-in by e-mail code (v1.md « Sign-in by e-mail
 * code »), for a private server and for a server that opens spaces, which differ by
 * their `policy` only: who may receive a code (`admit`), whether an address
 * without a space gets one (`spaceCreation`), and the role of a new space's
 * person (`openSpace`, the composition's). `problems(configuration)` says
 * what keeps the codes from being sent (configuration.js, or an extension's
 * own).
 *
 * Independent of HTTP: `http.js` turns its results and refusals into
 * responses. The core's authentication provides, through `auth`, opening a
 * web session and issuing a device token for a person already proven here
 * (`newDeviceCredential`: the token and its hash; `devices.js` registers the
 * device itself).
 *
 * Every limit is taken before the work it limits: a message's place under the limits is reserved before the
 * message leaves, a comparison of a code and the failure it may become are
 * counted before the code is compared, and a success gives back what it
 * did not use. Requests that arrive together therefore never pass a limit
 * together.
 */

const MINUTE_MS = 60_000;
const iso = (value) => new Date(value).toISOString();
const later = (date, ms) => new Date(new Date(date).getTime() + ms);
const latest = (dates) =>
  new Date(Math.max(...dates.map((date) => new Date(date).getTime())));
const lockedRefusal = (retryAt) =>
  refuse(
    "sign_in_locked",
    "Too many attempts. Codes cannot be typed for this address until the wait ends.",
    429,
    { retryAt: iso(retryAt) },
  );
const rateLimited = (message, retryAt) =>
  refuse("sign_in_rate_limited", message, 429, { retryAt: iso(retryAt) });
const expired = () =>
  refuse(
    "sign_in_code_expired",
    "This code is no longer valid. Ask for a new one.",
    400,
  );
const linkInvalid = () =>
  refuse("sign_in_link_invalid", "This link is no longer valid.", 400);

const databaseUnavailableCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "57P03",
  "53300",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
]);

/** A database that is not reachable yet: the service is starting. */
export function isDatabaseUnavailable(error) {
  return (
    databaseUnavailableCodes.has(error?.code) ||
    /timeout exceeded when trying to connect|Connection terminated|database system is starting up/i.test(
      String(error?.message || ""),
    )
  );
}

const consoleAlert = ({ level, event, message }) =>
  console.warn(`[Astro Portal] ${level} ${event}: ${message}`);

export function createSpaceSignIn({
  driver,
  configuration,
  sender,
  auth,
  policy = closedSpacePolicy(),
  problems = spaceSignInProblems,
  clock = () => new Date(),
  log = (message) => console.error(`[Astro Portal] ${message}`),
  // `{ level, event, message }`, never an address: the alert of a spent
  // e-mail budget, for the application log.
  alert = consoleAlert,
  // The comparison of two digests; tests count the comparisons through it.
  compareDigests = sameDigest,
  // The tables of every message counted in the service's e-mail budget
  // (repository.js `mailBudgetState`): a composition that sends other
  // codes within the same budget names their table too.
  mailBudgetTables = repository.MAIL_BUDGET_TABLES,
}) {
  const key = configuration.signInKey;
  // The addresses that sign in with a fixed code (`policy.fixedCode`), on a
  // service that opens spaces only: a private server has none.
  const fixedCode =
    policy.spaceCreation === "open" ? (policy.fixedCode ?? null) : null;
  const hasFixedCode = (email) => Boolean(fixedCode) && fixedCode.has(email);
  // The space as the applications read it (`sign-in.schema.json`, `space`):
  // the fields the policy adds for an address of the fixed code
  // (`demoModeAllowed`, which opens the demo mode of the application); any
  // other space says nothing of them.
  const spaceSummary = (tenantId, email) => ({
    id: tenantId,
    email,
    webUrl: configuration.publicUrl,
    ...(hasFixedCode(email) ? fixedCode.spaceFields?.(email) : {}),
  });
  const admit = async (email) => {
    if (typeof policy.admit === "function")
      await policy.admit({ email, driver });
  };
  // The rules of the devices of many spaces (`policy.devices`), on a service
  // that opens spaces only: a private server has one space.
  const devices = createSpaceDevices({
    driver,
    configuration,
    sender,
    auth,
    extension:
      policy.spaceCreation === "open" ? (policy.devices ?? null) : null,
    clock,
    log,
  });
  let schemaReady = null;
  let budgetAlertAt = null;
  // The service's startup migrates the database before the first request
  // (server.mjs); this lazy check then applies nothing. When it does run
  // (a test, a script), it may meet another repository migrating on the
  // same SQLite connection, and waits for it rather than failing.
  const ready = () => {
    schemaReady ||= retryOnSqliteNestedTransaction(() =>
      applyMigrations(driver, driver.dialect),
    ).catch((error) => {
      schemaReady = null;
      throw error;
    });
    return schemaReady;
  };
  const usable = () => Boolean(sender) && problems(configuration).length === 0;
  const requireUsable = () => {
    if (!usable())
      throw refuse(
        "sign_in_unavailable",
        "Sign-in by e-mail is not available on this service.",
        503,
      );
  };
  const addressOf = (value) => {
    const email = normalizeEmail(value);
    if (!isValidEmail(email))
      throw refuse("email_invalid", "Enter a valid e-mail address.", 400);
    return email;
  };
  const lockOf = async (subject, now) => {
    const throttle = await repository.throttleOf(driver, subject);
    const until = throttle?.locked_until ? String(throttle.locked_until) : null;
    return until && until > iso(now) ? until : null;
  };
  /** The two subjects a failure for an address counts against. */
  const failureSubjects = (email, origin) => ({
    pair: addressOriginSubject(key, email, origin),
    address: addressSubject(key, email),
  });
  /** When codes may be typed again for this address from this origin. */
  const codesHeldUntil = async (email, origin, now) => {
    const { pair, address } = failureSubjects(email, origin);
    const locks = [await lockOf(pair, now), await lockOf(address, now)].filter(
      Boolean,
    );
    return locks.length ? latest(locks) : null;
  };

  /**
   * Counts a verification of this origin as failed before it is made; a
   * success gives it back. Refused past thirty within the hour.
   */
  async function reserveOriginFailure(origin, now) {
    const subject = originSubject(key, origin);
    const reserved = await repository.reserveFailure(driver, subject, {
      now,
      windowMs: LIMIT_WINDOW_MS,
      limit: FAILURES_PER_ORIGIN_PER_WINDOW,
    });
    if (reserved.reserved) return { subject, ...reserved };
    const throttle = await repository.throttleOf(driver, subject);
    throw rateLimited(
      "Too many attempts from this network. Try again later.",
      throttle?.window_started_at
        ? later(String(throttle.window_started_at), LIMIT_WINDOW_MS)
        : later(now, LIMIT_WINDOW_MS),
    );
  }

  /**
   * Counts a failure of this address, from this origin and from anywhere,
   * before the attempt is judged. The failure that reaches five for the
   * pair, or twenty for the address, locks it at once (a success lifts
   * it). Throws `sign_in_locked` when the pair or the address is locked
   * already.
   */
  async function reserveAddressFailure(email, origin, now) {
    const subjects = failureSubjects(email, origin);
    const rules = {
      now,
      windowMs: LIMIT_WINDOW_MS,
      lockSteps: LOCK_STEPS_MS,
      recidivismMs: RECIDIVISM_MS,
      // Both rows are the address's: the deletion of its space finds them.
      addressHash: subjects.address,
    };
    const onPair = await repository.reserveLockingFailure(
      driver,
      subjects.pair,
      { ...rules, limit: MAX_FAILED_ATTEMPTS },
    );
    if (!onPair.reserved)
      throw lockedRefusal(
        (await lockOf(subjects.pair, now)) || later(now, LOCK_STEPS_MS[0]),
      );
    const onAddress = await repository.reserveLockingFailure(
      driver,
      subjects.address,
      { ...rules, limit: FAILURES_PER_ADDRESS_PER_WINDOW },
    );
    if (!onAddress.reserved)
      throw lockedRefusal(
        (await lockOf(subjects.address, now)) || later(now, LOCK_STEPS_MS[0]),
      );
    const locks = [onPair.lockedUntil, onAddress.lockedUntil].filter(Boolean);
    return {
      lockedUntil: locks.length ? latest(locks) : null,
      remaining: Math.min(
        MAX_FAILED_ATTEMPTS - onPair.failures,
        FAILURES_PER_ADDRESS_PER_WINDOW - onAddress.failures,
      ),
    };
  }

  /** The address is proven: what was counted against it is forgotten. */
  async function forgetFailures(email, origin, originFailure, now) {
    const { pair, address } = failureSubjects(email, origin);
    await repository.clearFailures(driver, pair, now);
    await repository.clearFailures(driver, address, now);
    await repository.releaseFailure(
      driver,
      originFailure.subject,
      originFailure.windowStartedAt,
    );
  }

  /** At most one alert a minute, with no address and no origin. */
  function alertBudgetSpent(state, retryAt, now) {
    if (budgetAlertAt && now.getTime() - budgetAlertAt < MINUTE_MS) return;
    budgetAlertAt = now.getTime();
    alert({
      level: "warning",
      event: "sign-in.mail_budget_spent",
      message:
        `The e-mail budget of the service is spent ` +
        `(${state.service.minute.count}/${configuration.mailMinuteBudget} this minute, ` +
        `${state.service.hour.count}/${configuration.mailHourlyBudget} this hour): ` +
        `codes are refused until ${iso(retryAt)}.`,
    });
  }

  /** Why a new message may not leave now, or `null`. */
  function sendingRefusal(state, now) {
    if (state.address.latest) {
      const resendAt = later(state.address.latest, RESEND_INTERVAL_MS);
      if (resendAt > now)
        return rateLimited(
          "A code was sent a moment ago. Try again shortly.",
          resendAt,
        );
    }
    if (state.address.count >= CODES_PER_ADDRESS_PER_WINDOW)
      return rateLimited(
        "Too many codes were requested. Try again later.",
        later(state.address.oldest, LIMIT_WINDOW_MS),
      );
    if (state.origin.count >= CODES_PER_ORIGIN_PER_WINDOW)
      return rateLimited(
        "Too many codes were requested. Try again later.",
        later(state.origin.oldest, LIMIT_WINDOW_MS),
      );
    const waits = [];
    if (state.service.minute.count >= configuration.mailMinuteBudget)
      waits.push(later(state.service.minute.oldest, MINUTE_MS));
    if (state.service.hour.count >= configuration.mailHourlyBudget)
      waits.push(later(state.service.hour.oldest, LIMIT_WINDOW_MS));
    if (!waits.length) return null;
    const retryAt = latest(waits);
    alertBudgetSpent(state, retryAt, now);
    return refuse(
      "sign_in_unavailable",
      "Too many messages are leaving the service. Try again later.",
      503,
      { retryAt: iso(retryAt) },
    );
  }

  /** Opens the space's door for the proven address and the asking client. */
  async function open({
    codeRow,
    comparedAtMost,
    now,
    client,
    device,
    originClientInstanceId,
  }) {
    const email = String(codeRow.email);
    const fixed = codeRow.fixed === true;
    let space;
    try {
      space = await repository.consumeCodeAndOpenSpace(driver, {
        codeId: fixed ? null : String(codeRow.id),
        email,
        now,
        language: fixed ? null : languageOf(codeRow.language),
        comparedAtMost,
        openSpace:
          policy.spaceCreation === "open" &&
          typeof policy.openSpace === "function"
            ? (transaction, context) => policy.openSpace(transaction, context)
            : null,
      });
    } catch (error) {
      // The address has no space here and nothing opens one: the server
      // belongs to someone else.
      if (error?.code === "not_owner")
        throw refuse("not_owner", "This portal belongs to someone else.", 403);
      throw error;
    }
    if (!space) throw expired();
    if (fixed)
      await fixedCode.afterOpen?.({
        driver,
        tenantId: space.tenantId,
        userId: space.userId,
        client,
        now,
      });
    if (typeof policy.afterProven === "function")
      try {
        await policy.afterProven({
          email,
          tenantId: space.tenantId,
          userId: space.userId,
          created: space.created,
        });
      } catch (error) {
        log(
          `sign_in.after_proven_failed: ${error?.message || "unknown error"}`,
        );
      }
    const summary = {
      created: space.created,
      space: spaceSummary(space.tenantId, email),
    };
    if (client === "web") {
      const session = await auth.openSession({
        tenantId: space.tenantId,
        userId: space.userId,
      });
      return { ...summary, cookies: session.cookies };
    }
    // The address is proven and the code used: the device now registers
    // itself, under the rules of the devices of a space (devices.js); where
    // the policy has rules for many spaces, a phone of another space
    // answers `device_attached_elsewhere`.
    const signedIn = await devices.signIn({
      tenantId: space.tenantId,
      userId: space.userId,
      created: space.created,
      device,
      originClientInstanceId,
    });
    if (typeof policy.afterDeviceSignIn === "function")
      try {
        await policy.afterDeviceSignIn({
          email,
          tenantId: space.tenantId,
          userId: space.userId,
          created: space.created,
        });
      } catch (error) {
        log(
          `sign_in.after_device_failed: ${error?.message || "unknown error"}`,
        );
      }
    return { ...summary, ...signedIn };
  }

  /**
   * Sends a code to an address already admitted: the limits, the message,
   * and the answer of POST /v1/sign-in/code.
   */
  async function sendCode(email, language, origin, client = "app") {
    const now = clock();
    // Only the origin whose failures locked this address waits here: an
    // address lock stops codes being typed, not the link of a message.
    const pairLock = await lockOf(
      addressOriginSubject(key, email, origin),
      now,
    );
    if (pairLock) throw lockedRefusal(pairLock);
    const originHash = originSubject(key, origin);
    const windows = {
      hourMs: LIMIT_WINDOW_MS,
      minuteMs: MINUTE_MS,
      budgetTables: mailBudgetTables,
    };
    const refusalOf = (state) => sendingRefusal(state, now);
    // A first look, without taking turns, turns most refused requests
    // away; the reservation looks again while it holds the guard.
    const early = refusalOf(
      await repository.sendingState(driver, {
        email,
        originHash,
        now,
        ...windows,
      }),
    );
    if (early) throw early;

    const id = randomUUID();
    const code = newCode();
    const token = newLinkToken();
    const expiresAt = iso(later(now, CODE_TTL_MS));
    const lang = languageOf(language);
    const { refusal } = await repository.reservePendingCode(
      driver,
      {
        id,
        email,
        codeHash: codeDigest(key, id, code),
        linkTokenHash: linkTokenDigest(key, token),
        language: lang,
        originHash,
        createdAt: iso(now),
        expiresAt,
      },
      windows,
      refusalOf,
    );
    if (refusal) throw refusal;
    const link = signInLink({
      publicUrl: configuration.publicUrl,
      token,
      code,
      expiresAt,
      language: lang,
    });
    const message = signInMessage({
      code,
      link,
      language: lang,
      productName: configuration.productName,
      publicUrl: configuration.publicUrl,
      spaceCreation: policy.spaceCreation,
      client,
    });
    try {
      await sender.send({
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        meta: { language: lang, code, link },
      });
    } catch (error) {
      await repository.deletePendingCode(driver, id);
      if (
        error instanceof MailDeliveryError ||
        error?.name === "MailDeliveryError"
      )
        throw refuse(
          "email_delivery_failed",
          "The message could not be sent. Try again.",
          502,
        );
      throw error;
    }
    await repository.markCodeSent(driver, { id, email, sentAt: iso(now) });
    await repository.purgeOldCodes(driver, now).catch(() => {});
    await devices.housekeeping?.(now).catch(() => {});
    return {
      email,
      codeLength: 6,
      expiresAt,
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAt: iso(later(now, RESEND_INTERVAL_MS)),
      resendAfterSeconds: RESEND_INTERVAL_MS / 1000,
    };
  }

  /**
   * The request for a code of an address with a fixed code: the answer of
   * any other address, with nothing sent and nothing kept (the code is the
   * fixed one, `policy.fixedCode`). The lock of an origin that failed on
   * this address holds it back like any other.
   */
  async function fixedCodeRequest(email, origin) {
    const now = clock();
    const pairLock = await lockOf(
      addressOriginSubject(key, email, origin),
      now,
    );
    if (pairLock) throw lockedRefusal(pairLock);
    return {
      email,
      codeLength: 6,
      expiresAt: iso(later(now, CODE_TTL_MS)),
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAt: iso(later(now, RESEND_INTERVAL_MS)),
      resendAfterSeconds: RESEND_INTERVAL_MS / 1000,
    };
  }

  /**
   * Proves an address by its code or by the token of the link of its
   * message: every limit is counted first, and what was counted against the
   * address is forgotten once it is proven. The code's row and how many
   * comparisons it may have had (`null` for a link), to use it up; throws a
   * refusal otherwise.
   */
  async function prove({
    email,
    code,
    linkToken,
    origin,
    now,
    allowFixedCode = false,
  }) {
    const originFailure = await reserveOriginFailure(origin, now);
    const proven = async (row, comparedAtMost) => {
      await forgetFailures(email, origin, originFailure, now);
      return { row, comparedAtMost };
    };

    if (linkToken !== null) {
      // No lock holds a link back: its token cannot be guessed.
      const row = await repository.codeByLinkDigest(
        driver,
        linkTokenDigest(key, linkToken),
      );
      if (!row || row.consumed_at || row.voided_at) throw linkInvalid();
      if (String(row.expires_at) <= iso(now)) throw expired();
      if (String(row.email) !== email) {
        // A link forwarded from another address's message: refused, and
        // counted as a failed attempt for the address typed.
        const counted = await reserveAddressFailure(email, origin, now);
        if (counted.lockedUntil) throw lockedRefusal(counted.lockedUntil);
        throw refuse(
          "sign_in_code_incorrect",
          "This link was not sent to this address.",
          400,
          { attemptsRemaining: counted.remaining },
        );
      }
      return await proven(row, null);
    }

    const heldUntil = await codesHeldUntil(email, origin, now);
    if (heldUntil) throw lockedRefusal(heldUntil);
    if (allowFixedCode && hasFixedCode(email)) {
      // The fixed code: counted as a failure first like any code, forgotten
      // once it is right; no row to compare five times, the locks of the
      // address and of the origin are its only limit.
      const counted = await reserveAddressFailure(email, origin, now);
      if (fixedCode.matches(email, code, { key, compareDigests }))
        return await proven({ email, fixed: true }, null);
      if (counted.lockedUntil) throw lockedRefusal(counted.lockedUntil);
      if (counted.remaining < 1)
        throw lockedRefusal(later(now, LOCK_STEPS_MS[0]));
      throw refuse("sign_in_code_incorrect", "This code does not match.", 400, {
        attemptsRemaining: counted.remaining,
      });
    }
    const row = await repository.validCodeForEmail(
      driver,
      email,
      now,
      MAX_FAILED_ATTEMPTS,
    );
    if (!row) {
      // The same digest work as a comparison, so that the time of the
      // answer does not say whether a code was waiting.
      sameDigest(
        codeDigest(key, "no-code", code),
        codeDigest(key, "no-code", "------"),
      );
      throw expired();
    }
    // The comparison and the failure it may be are counted first.
    const attempt = await repository.reserveCodeAttempt(driver, {
      codeId: String(row.id),
      now,
      maxAttempts: MAX_FAILED_ATTEMPTS,
    });
    if (attempt === null) throw expired();
    const counted = await reserveAddressFailure(email, origin, now);
    if (
      compareDigests(
        codeDigest(key, String(row.id), code),
        String(row.code_hash),
      )
    )
      return await proven(row, MAX_FAILED_ATTEMPTS);
    if (counted.lockedUntil) throw lockedRefusal(counted.lockedUntil);
    const remaining = Math.min(
      MAX_FAILED_ATTEMPTS - attempt,
      counted.remaining,
    );
    // The code was compared five times: it can no longer be used.
    if (remaining < 1) throw expired();
    throw refuse("sign_in_code_incorrect", "This code does not match.", 400, {
      attemptsRemaining: remaining,
    });
  }

  /** Six digits, or `invalid_request`. */
  const codeOf = (typedCode) => {
    const code = normalizeCode(typedCode);
    if (!code) throw refuse("invalid_request", "A code has six digits.", 400);
    return code;
  };

  return {
    usable,
    spaceCreation: policy.spaceCreation,

    /**
     * POST /v1/sign-in/code. On a server that opens spaces, the same answer whether
     * a space exists or not; on a private server, only its owner's address
     * receives a code (`not_owner`, `not_initialized`, closedSpacePolicy).
     */
    async requestCode({
      email: typedEmail,
      language,
      origin = "",
      client = "app",
    }) {
      const email = addressOf(typedEmail);
      requireUsable();
      await ready();
      await admit(email);
      if (hasFixedCode(email)) return await fixedCodeRequest(email, origin);
      // Only the web page says so; anything else is the app's message.
      return await sendCode(
        email,
        language,
        origin,
        client === "web" ? "web" : "app",
      );
    },

    /**
     * POST /v1/sign-in/verify, by address and code, or by the token of the
     * link and the address it was sent to.
     */
    async verify({
      email: typedEmail,
      code: typedCode,
      linkToken,
      client,
      device: typedDevice,
      origin = "",
      originClientInstanceId = null,
    }) {
      const byLink = linkToken !== undefined && linkToken !== null;
      if (
        !["app", "web"].includes(client) ||
        typedEmail === undefined ||
        typedEmail === null ||
        (byLink ? typedCode !== undefined : typedCode === undefined)
      )
        throw refuse(
          "invalid_request",
          "Send an address with its code, or with the token of the link.",
          400,
        );
      const device = client === "app" ? validDevice(typedDevice) : null;
      if (client === "app" && !device)
        throw refuse(
          "invalid_request",
          "The device signing in must be described.",
          400,
        );
      const email = addressOf(typedEmail);
      const code = byLink ? null : codeOf(typedCode);
      if (byLink && !isLinkToken(linkToken)) throw linkInvalid();
      requireUsable();
      await ready();
      await admit(email);
      const now = clock();
      const { row, comparedAtMost } = await prove({
        email,
        code,
        linkToken: byLink ? linkToken : null,
        origin,
        now,
        allowFixedCode: true,
      });
      return await open({
        codeRow: row,
        comparedAtMost,
        now,
        client,
        device,
        originClientInstanceId,
      });
    },

    /**
     * The installation of a private server by e-mail code
     * (docs/PRIVATE_NOTEBOOK_AUTH.md, « Installing »): a code to the address
     * typed with the bootstrap secret, which the caller checked, before any
     * owner exists. The same limits and message as every code.
     */
    async requestInstallationCode({
      email: typedEmail,
      language,
      origin = "",
    }) {
      const email = addressOf(typedEmail);
      requireUsable();
      await ready();
      // The installation page is a web page: the code is typed there.
      return await sendCode(email, language, origin, "web");
    },

    /**
     * Its code, proven like any other, then used up in the same transaction
     * as `create(transaction, { email, language })`, which writes the
     * account; its result is returned. `null` never: a code used meanwhile
     * answers `sign_in_code_expired`.
     */
    async verifyInstallationCode({
      email: typedEmail,
      code: typedCode,
      origin = "",
      create,
    }) {
      const email = addressOf(typedEmail);
      const code = codeOf(typedCode);
      requireUsable();
      await ready();
      const now = clock();
      const { row, comparedAtMost } = await prove({
        email,
        code,
        linkToken: null,
        origin,
        now,
      });
      const created = await repository.consumeCodeWithin(
        driver,
        { codeId: String(row.id), now, comparedAtMost },
        (transaction) =>
          create(transaction, { email, language: languageOf(row.language) }),
      );
      if (!created) throw expired();
      return created;
    },

    /** GET /v1/space for an already authenticated credential. */
    async currentSpace({ tenantId, userId, email = null, device = null }) {
      await ready();
      return {
        space: spaceSummary(
          tenantId,
          email || (await repository.emailOf(driver, userId)),
        ),
        device: device ? { id: device.id, name: device.label } : null,
      };
    },

    /**
     * POST /v1/sign-in/attach: « Rattacher cet appareil à mon espace », with
     * the token a verification answered `device_attached_elsewhere` with.
     * The token stands for the proven address: unknown, used or more than
     * ten minutes old, it is refused like a code that is no longer valid.
     * The attempt counts as a failure of the network origin before the
     * token is looked up, the same way as a verification; an attachment
     * that succeeds gives it back.
     */
    async attach({
      attachToken,
      device: typedDevice,
      origin = "",
      originClientInstanceId = null,
    }) {
      const device = validDevice(typedDevice);
      if (typeof attachToken !== "string" || !isLinkToken(attachToken))
        throw refuse("invalid_request", "An attach token is required.", 400);
      if (!device || device.application !== "planner")
        throw refuse(
          "invalid_request",
          "The device to attach must be described.",
          400,
        );
      requireUsable();
      await ready();
      const now = clock();
      const originFailure = await reserveOriginFailure(origin, now);
      // A server without the rules of many spaces offers no attachment: any
      // token is one it never issued.
      if (!devices.attach) throw expired();
      const attached = await devices.attach({
        attachToken,
        device,
        originClientInstanceId,
      });
      await repository.releaseFailure(
        driver,
        originFailure.subject,
        originFailure.windowStartedAt,
      );
      const { tenantId, userId, created, ...signedIn } = attached;
      return {
        created,
        space: spaceSummary(tenantId, await repository.emailOf(driver, userId)),
        ...signedIn,
      };
    },

    /** GET, PATCH, DELETE /v1/devices: « Mes appareils » (devices.js). */
    async listDevices(options) {
      await ready();
      return await devices.list(options);
    },
    async renameDevice(options) {
      await ready();
      return await devices.rename(options);
    },
    async detachDevice(options) {
      await ready();
      return await devices.detach(options);
    },
  };
}
