import { clockText } from "../../written-forms.js";

/**
 * What the web sign-in says of a refusal.
 *
 * A notice is **data**, not a text: a refusal that comes with a wait is kept
 * as a kind and the instant it counts to, and the words are made each time
 * the page is drawn, from the clock (`noticeContent`). A delay written into a
 * sentence once stays where it was while the button beside it counts down;
 * here the notice and the button read the same instant, and the notice goes
 * when the instant comes.
 */

/** The longest wait a service can mean: a year. A figure beyond it is not a wait. */
export const LONGEST_WAIT_SECONDS = 366 * 24 * 60 * 60;

const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Milliseconds since the epoch of [instant] (an ISO string, or already a number), or `null`. */
function momentOf(instant) {
  if (typeof instant === "number")
    return Number.isFinite(instant) ? instant : null;
  if (typeof instant !== "string" || !ISO_INSTANT.test(instant)) return null;
  const parsed = Date.parse(instant);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Whole seconds until [instant], at least 0; 0 for anything that is not a moment. */
export function secondsUntil(instant, now = Date.now()) {
  const at = momentOf(instant);
  return at === null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/** `0:42`, `14:52`: a wait as written on screen. */
export const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * When the service says the request may be sent again, in milliseconds since
 * the epoch, or `null`: `Retry-After` (a whole number of seconds) first, the
 * body's `retryAt` (an ISO 8601 instant) next. What is not a wait ahead of
 * [now], and within a year, is no date: a header that is not such a number is
 * ignored and the body decides; an absent, mal-formed or past date gives the
 * message without an hour.
 */
export function retryMoment({ retryAfter, retryAt } = {}, now = Date.now()) {
  const header = typeof retryAfter === "string" ? retryAfter.trim() : "";
  const seconds = /^\d+$/.test(header) ? Number(header) : null;
  let moment = null;
  if (seconds !== null && seconds > 0 && seconds <= LONGEST_WAIT_SECONDS)
    moment = now + seconds * 1000;
  else moment = momentOf(retryAt);
  if (moment === null || moment <= now) return null;
  return moment - now > LONGEST_WAIT_SECONDS * 1000 ? null : moment;
}

/** The calendar day of [moment] in [timeZone], as a number of days. */
function dayOf(moment, timeZone) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(moment)
    .split("-")
    .map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * [moment] as it reads inside a sentence (« Vous pourrez réessayer … »): « à
 * 21:14 », « demain, mer. 30 sept., à 21:14 », « le jeu. 1 oct., à 21:14 » — in
 * the browser's own time zone and calendar.
 */
export function atWhen(moment, now, copy, { locale = "en", timeZone } = {}) {
  const time = clockText(
    moment,
    timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const days = dayOf(moment, timeZone) - dayOf(now, timeZone);
  if (days <= 0) return copy.atToday(time);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(moment);
  return days === 1 ? copy.atTomorrow(date, time) : copy.atLater(date, time);
}

/**
 * What a refusal of the service is, for the page. The answer is what the
 * page read: `status`, the envelope's `error`, the body's `retryAt`,
 * `attemptsRemaining`, and the header `retryAfter`. Most are plain
 * `{ title, body }`; the two that carry a wait are `{ kind, until }`, with
 * no words of their own.
 */
export function refusalNotice(
  answer,
  copy,
  { requesting = false, now = Date.now() } = {},
) {
  if (answer.offline)
    return {
      title: copy.offlineTitle,
      body: requesting ? copy.failed : copy.offlineBody,
    };
  // A `429` without the service's envelope (a gateway, a limit in front of
  // it): « Trop de demandes », with the wait the header gives, if any.
  if (answer.status === 429 && !answer.error?.code) {
    const until = retryMoment(answer, now);
    return until === null
      ? { title: copy.tooManyTitle }
      : { kind: "rate-limited", until };
  }
  switch (answer.error?.code) {
    case "email_invalid":
      return { body: copy.emailInvalid };
    case "sign_in_code_incorrect":
      return {
        title: copy.incorrectTitle,
        body: copy.incorrectBody(answer.attemptsRemaining || 1),
      };
    case "sign_in_code_expired":
    case "sign_in_link_invalid":
      return { title: copy.expiredTitle, body: copy.expiredBody };
    case "sign_in_locked":
      return { title: copy.lockedTitle, body: copy.lockedBody };
    case "email_delivery_failed":
      return { body: copy.deliveryFailed };
    case "sign_in_unavailable": {
      // With a date, when a code was asked for: the budget of messages of
      // the service is spent for a while. Without one, or with one that is
      // not a wait ahead, the sign-in is simply not available (and a
      // verification sends nothing, so nothing is suspended by it).
      const until = requesting ? retryMoment(answer, now) : null;
      return until === null
        ? { body: copy.unavailable }
        : { kind: "sending-suspended", until };
    }
    case "space_unavailable":
      return { body: copy.spaceUnavailable };
    // A private server: another address than its owner's, or a portal
    // that nobody installed yet (its page of installation, where the
    // service names it).
    case "not_owner":
      return { body: copy.notOwner };
    case "not_initialized":
      return {
        body: copy.notInitialized,
        link: {
          href:
            typeof answer.bootstrapPath === "string" &&
            /^\/auth\/[a-z-]+$/.test(answer.bootstrapPath)
              ? answer.bootstrapPath
              : "/auth/bootstrap",
          label: copy.installLink,
        },
      };
    case "sign_in_rate_limited": {
      // The wait the service names, while it is still ahead: the notice
      // counts down to it. No date, or one already past, and the title
      // stands alone — never a delay of the page's own making.
      const until =
        typeof answer.retryAt === "string" ? momentOf(answer.retryAt) : null;
      return until !== null && until > now
        ? { kind: "rate-limited", until }
        : { title: copy.tooManyTitle };
    }
    default:
      return { body: copy.failed };
  }
}

/**
 * A code asked for, from the address step, that the service refused with a
 * wait (`429 sign_in_rate_limited`: a code left for this address a moment ago):
 * nothing was sent from this page, so it says to wait --
 * for the time `Retry-After` gives, else the body's `retryAt` -- and never that
 * a code was sent. Without a wait ahead, the title alone.
 */
export function askLaterNotice(answer, copy, now = Date.now()) {
  const until = retryMoment(answer, now);
  return until === null
    ? { title: copy.tooManyTitle }
    : { kind: "ask-later", until };
}

/** The instant a notice counts to, in milliseconds, or `null`. */
export const noticeUntil = (notice) =>
  notice?.kind === "rate-limited" ||
  notice?.kind === "sending-suspended" ||
  notice?.kind === "ask-later"
    ? notice.until
    : null;

/**
 * The words of [notice] at [now]: `{ title, body }`, or `null` when there is
 * nothing to say — no notice, or a wait that is over. [locale] and
 * [timeZone] are the browser's own.
 */
export function noticeContent(
  notice,
  copy,
  { now = Date.now(), locale, timeZone } = {},
) {
  if (!notice) return null;
  if (notice.kind === "rate-limited") {
    const seconds = secondsUntil(notice.until, now);
    return seconds > 0
      ? { title: copy.tooManyTitle, body: copy.tooManyBody(clock(seconds)) }
      : null;
  }
  if (notice.kind === "ask-later") {
    const seconds = secondsUntil(notice.until, now);
    return seconds > 0
      ? { title: copy.askLater(seconds, clock(seconds)) }
      : null;
  }
  if (notice.kind === "sending-suspended")
    return notice.until > now
      ? {
          title: copy.suspendedTitle,
          body: copy.suspendedBody(
            atWhen(notice.until, now, copy, { locale, timeZone }),
          ),
        }
      : null;
  return notice;
}
